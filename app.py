import asyncio
import json
import logging
import os
import time
from functools import wraps
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from flask import Flask, jsonify, redirect, render_template, request, make_response
from playwright.async_api import Error as PlaywrightError

import auth
from searcher import search_platform, scan_single

load_dotenv()

ADMIN_SECRET = os.getenv("ADMIN_SECRET", "changeme-set-in-env")
FINDS_FILE   = Path(__file__).parent / "data" / "finds.json"


def _load_finds():
    FINDS_FILE.parent.mkdir(exist_ok=True)
    if not FINDS_FILE.exists():
        FINDS_FILE.write_text(json.dumps([]))
    return json.loads(FINDS_FILE.read_text())

def _save_finds(finds):
    FINDS_FILE.write_text(json.dumps(finds, indent=2))


def create_app() -> Flask:
    app = Flask(__name__)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")

    def get_ip():
        return request.headers.get("X-Forwarded-For", request.remote_addr or "unknown").split(",")[0].strip()

    def get_user():
        token = request.cookies.get("sf_token")
        if not token: return None
        result = auth.validate_token(token, get_ip())
        return result if result["valid"] else None

    def require_auth(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if not get_user():
                return jsonify({"error": "Unauthorized"}), 401
            return f(*args, **kwargs)
        return decorated

    def require_auth_page(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            token = request.cookies.get("sf_token")
            if not token or not auth.validate_token(token, get_ip())["valid"]:
                return redirect("/")
            return f(*args, **kwargs)
        return decorated

    def require_admin(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            secret = request.args.get("secret") or request.headers.get("X-Admin-Secret")
            if secret != ADMIN_SECRET:
                return "Unauthorized", 403
            return f(*args, **kwargs)
        return decorated

    @app.get("/")
    def root():
        token = request.cookies.get("sf_token")
        if token and auth.validate_token(token, get_ip())["valid"]:
            return render_template("index.html")
        return render_template("access.html")

    @app.post("/request-access")
    def request_access():
        data    = request.get_json(silent=True) or {}
        name     = (data.get("name") or "").strip()
        email    = (data.get("email") or "").strip()
        reason   = (data.get("reason") or data.get("why") or "").strip()
        discord  = (data.get("discord") or "").strip()
        wechat   = (data.get("wechat") or "").strip()
        password = (data.get("password") or "").strip()
        if not name or not email:
            return jsonify({"ok": False, "error": "Name and email required."}), 400
        result = auth.submit_request(name, email, reason, get_ip(), discord=discord, wechat=wechat, password=password)
        return jsonify(result), 200

    @app.post("/login")
    def login():
        data     = request.get_json(silent=True) or {}
        email    = (data.get("email") or "").strip()
        password = (data.get("password") or "").strip()
        if not email or not password:
            return jsonify({"error": "Email and password required."}), 400
        result = auth.login_user(email, password, get_ip())
        if not result["valid"]:
            if result.get("needs_password"):
                return jsonify({"ok": False, "needs_password": True, "email": email, "error": result.get("error", "")}), 200
            return jsonify({"error": result.get("error", "Invalid credentials.")}), 401
        resp = make_response(jsonify({"ok": True, "status": "ok", "name": result["name"], "is_admin": result.get("is_admin", False)}))
        resp.set_cookie("sf_token", result["token"], httponly=True, samesite="Lax")
        return resp

    @app.post("/set-password")
    def set_password_route():
        data     = request.get_json(silent=True) or {}
        email    = (data.get("email") or "").strip()
        password = (data.get("password") or "").strip()
        if not email or not password:
            return jsonify({"ok": False, "error": "Email and password required."}), 400
        result = auth.set_password(email, password)
        if result.get("ok"):
            resp = make_response(jsonify({"ok": True, "name": result["name"]}))
            resp.set_cookie("sf_token", result["token"], httponly=True, samesite="Lax")
            return resp
        return jsonify(result), 400

    @app.post("/logout")
    def logout():
        resp = make_response(jsonify({"status": "ok"}))
        resp.delete_cookie("sf_token")
        return resp

    @app.get("/setup-admin")
    def setup_admin():
        secret = request.args.get("secret","")
        if secret != os.getenv("ADMIN_SECRET","secretcode"):
            return "Wrong secret", 403
        pw = request.args.get("pw", "sourcefinder2024")
        result = auth.update_password("cadehottmansox@gmail.com", pw)
        auth.set_admin("cadehottmansox@gmail.com", True)
        # Ensure user exists
        data = auth.get_admin_data()
        import hashlib, time as t, json
        from pathlib import Path
        user = next((u for u in data["approved"] if u["email"]=="cadehottmansox@gmail.com"), None)
        if not user:
            data["approved"].append({
                "name":"Cade","email":"cadehottmansox@gmail.com",
                "password":hashlib.sha256(pw.encode()).hexdigest(),
                "is_admin":True,"ip_history":[],"approved_at":t.time(),
                "last_login":None,"request_id":None,"search_count":0,
                "last_search":None,"last_query":"",
            })
            p = Path("/app/data/users.json")
            p.parent.mkdir(exist_ok=True)
            p.write_text(json.dumps(data, indent=2))
        return f"<h2>Done!</h2><p>Email: cadehottmansox@gmail.com</p><p>Password: {pw}</p><p><a href='/'>Go to app</a></p>"

    # ── Admin API endpoints ──────────────────────────────────────────
    @app.get("/api/admin/data")
    @require_admin
    def api_admin_data():
        """Return all admin data as JSON for the in-app admin tab."""
        try:
            data = auth.get_admin_data()
        except Exception as e:
            return jsonify({"pending":[],"approved":[],"error":str(e)}), 200
        pending  = [r for r in data.get("requests",[]) if r.get("status")=="pending"]
        approved = data.get("approved",[])
        # Sort pending by newest first
        pending.sort(key=lambda x: x.get("timestamp",0), reverse=True)
        approved.sort(key=lambda x: x.get("last_login") or 0, reverse=True)
        # Format times
        def fmt_time(ts):
            if not ts: return "never"
            import datetime
            return datetime.datetime.fromtimestamp(ts).strftime("%b %d, %H:%M")
        for r in pending:
            r["_time"] = fmt_time(r.get("timestamp"))
        for u in approved:
            u["_last_login"] = fmt_time(u.get("last_login"))
            u["_approved_at"] = fmt_time(u.get("approved_at"))
        return jsonify({
            "pending":  pending,
            "approved": [{"name":u["name"],"email":u["email"],"is_admin":u.get("is_admin",False),
                          "revoked":u.get("revoked",False),"needs_password":u.get("needs_password",True),
                          "search_count":u.get("search_count",0),"last_search":u.get("last_search",""),
                          "last_query":u.get("last_query",""),"_last_login":u["_last_login"],
                          "_approved_at":u["_approved_at"]} for u in approved],
        })

    @app.post("/api/admin/approve")
    @require_admin
    def api_approve():
        data = request.get_json(silent=True) or {}
        result = auth.approve_request(data.get("req_id",""))
        return jsonify(result)

    @app.post("/api/admin/deny")
    @require_admin
    def api_deny():
        data = request.get_json(silent=True) or {}
        result = auth.deny_request(data.get("req_id",""))
        return jsonify(result)

    @app.post("/api/admin/revoke")
    @require_admin
    def api_revoke():
        data = request.get_json(silent=True) or {}
        result = auth.revoke_user(data.get("email",""))
        return jsonify(result)

    @app.post("/api/admin/set-admin")
    @require_admin
    def api_set_admin():
        data = request.get_json(silent=True) or {}
        result = auth.set_admin(data.get("email",""), data.get("is_admin", True))
        return jsonify(result)

    @app.get("/api/me")
    def api_me():
        """Return current user info."""
        token = request.cookies.get("sf_token","")
        ip    = request.headers.get("X-Forwarded-For", request.remote_addr or "")
        info  = auth.validate_token(token, ip)
        if not info["valid"]: return jsonify({"valid":False}), 401
        return jsonify({"valid":True,"name":info["name"],"email":info.get("email",""),"is_admin":info.get("is_admin",False)})

    @app.get("/me")
    @require_auth
    def me():
        """Return current user info including admin status."""
        user = get_user()
        return jsonify({"name": user["name"], "email": user["email"], "is_admin": user.get("is_admin", False)})

    @app.post("/set-password")
    def set_password():
        """User sets their own password after being approved."""
        data     = request.get_json(silent=True) or {}
        email    = (data.get("email") or "").strip()
        password = (data.get("password") or "").strip()
        if not email or not password:
            return jsonify({"ok": False, "error": "Email and password required."}), 400
        result = auth.set_password(email, password)
        if not result.get("ok"):
            return jsonify(result), 400
        resp = make_response(jsonify({"ok": True, "name": result["name"], "is_admin": result.get("is_admin", False)}))
        resp.set_cookie("sf_token", result["token"], httponly=True, samesite="Lax")
        return resp

    @app.get("/admin/api/data")
    @require_auth
    def admin_api_data():
        """Admin data for in-app admin tab."""
        user = get_user()
        if not user.get("is_admin"):
            return jsonify({"error": "Admin only"}), 403
        return jsonify(auth.get_admin_data())

    @app.post("/admin/api/approve/<req_id>")
    @require_auth
    def admin_api_approve(req_id):
        user = get_user()
        if not user.get("is_admin"):
            return jsonify({"error": "Admin only"}), 403
        result = auth.approve_request(req_id)
        return jsonify(result)

    @app.get("/admin/api/deny/<req_id>")
    @require_auth
    def admin_api_deny(req_id):
        user = get_user()
        if not user.get("is_admin"):
            return jsonify({"error": "Admin only"}), 403
        return jsonify(auth.deny_request(req_id))

    @app.post("/admin/api/revoke")
    @require_auth
    def admin_api_revoke():
        user = get_user()
        if not user.get("is_admin"):
            return jsonify({"error": "Admin only"}), 403
        data = request.get_json(silent=True) or {}
        return jsonify(auth.revoke_user(data.get("email", "")))

    @app.post("/admin/api/set-admin")
    @require_auth
    def admin_api_set_admin():
        user = get_user()
        if not user.get("is_admin"):
            return jsonify({"error": "Admin only"}), 403
        data = request.get_json(silent=True) or {}
        return jsonify(auth.set_admin(data.get("email", ""), data.get("is_admin", True)))

    @app.get("/admin/api/analytics")
    @require_auth
    def admin_api_analytics():
        user = get_user()
        if not user.get("is_admin"):
            return jsonify({"error": "Admin only"}), 403
        data = auth.get_admin_data()
        analytics = []
        for u in data.get("approved", []):
            analytics.append({
                "email":       u["email"],
                "name":        u["name"],
                "searches":    u.get("search_count", 0),
                "last_search": u.get("last_search", "never"),
                "last_query":  u.get("last_query", ""),
                "is_admin":    u.get("is_admin", False),
                "revoked":     u.get("revoked", False),
                "approved_at": u.get("approved_at", 0),
            })
        analytics.sort(key=lambda x: x["searches"], reverse=True)
        return jsonify(analytics)

    @app.post("/search")
    @require_auth
    def search() -> tuple[Any, int]:
        payload     = request.get_json(silent=True) or {}
        query       = (payload.get("query")      or "").strip()
        brand       = (payload.get("brand")      or "").strip()
        platform    = (payload.get("platform")   or "baidu").strip().lower()
        mode        = (payload.get("mode")        or "supplier").strip().lower()
        deep_scan   = bool(payload.get("deep_scan", False))
        wechat_only = bool(payload.get("wechat_only", False))
        page_num    = max(1, int(payload.get("page_num", 1)))
        variation   = max(0, int(payload.get("variation", 0)))
        seen_links  = list(payload.get("seen_links") or [])

        if not query:
            return jsonify({"error": "Please enter a search query."}), 400
        if mode not in {"supplier", "ff", "passing"}:
            return jsonify({"error": "Invalid mode."}), 400

        try:
            results = asyncio.run(search_platform(
                query, brand=brand, platform=platform, mode=mode,
                deep_scan=deep_scan, wechat_only=wechat_only,
                page_num=page_num, variation=variation, seen_links=seen_links,
            ))
            return jsonify({"query": query, "brand": brand, "platform": platform,
                "mode": mode, "deep_scan": deep_scan, "wechat_only": wechat_only,
                "page_num": page_num, "variation": variation, "results": results}), 200
        except PlaywrightError as exc:
            msg = str(exc)
            if "Executable doesn't exist" in msg:
                return jsonify({"error": "Run: python3 -m playwright install chromium"}), 500
            if "Timeout" in msg:
                return jsonify({"error": "Search timed out. Try again."}), 500
            return jsonify({"error": "Browser error. Try again."}), 500
        except Exception as exc:
            app.logger.exception("Search failed: %s", exc)
            return jsonify({"error": "Something went wrong. Try again."}), 500

    @app.post("/verify-wechat")
    @require_auth
    def verify_wechat():
        """Verify a WeChat ID by searching Baidu for it."""
        data   = request.get_json(silent=True) or {}
        wechat = (data.get("wechat") or "").strip()
        if not wechat:
            return jsonify({"error": "WeChat ID required"}), 400
        try:
            from searcher import verify_wechat_via_baidu
            import asyncio
            from playwright.async_api import async_playwright

            async def _run():
                from searcher import _launch
                async with async_playwright() as p:
                    browser = await _launch(p, True)
                    ctx  = await browser.new_context()
                    page = await ctx.new_page()
                    try:
                        result = await verify_wechat_via_baidu(wechat, page)
                    finally:
                        await ctx.close()
                        await browser.close()
                return result

            result = asyncio.run(_run())
            if isinstance(result, dict):
                return jsonify({"wechat": wechat, **result}), 200
            return jsonify({"wechat": wechat, "status": result}), 200
        except Exception as e:
            app.logger.exception("Verify WeChat failed: %s", e)
            return jsonify({"error": "Verification failed"}), 500

    @app.post("/scan-page")
    @require_auth
    def scan_page():
        """Scan a single URL for WeChat IDs — used by per-card scan button."""
        data = request.get_json(silent=True) or {}
        url  = (data.get("url") or "").strip()
        if not url:
            return jsonify({"error": "URL required."}), 400
        try:
            result = asyncio.run(scan_single(url))
            return jsonify(result), 200
        except Exception as exc:
            app.logger.exception("Scan page failed: %s", exc)
            return jsonify({"error": "Scan failed. Try again."}), 500

    # ── Debug endpoint ───────────────────────────────────────────────
    @app.get("/debug/baidu-html")
    @require_admin
    def debug_baidu_html():
        """Read saved Baidu HTML to debug parser."""
        from pathlib import Path
        p = Path("/app/data/debug_baidu.html")
        if not p.exists():
            return "No debug HTML saved yet. Run a search first.", 404
        html = p.read_text(errors="replace")
        # Find h3 tags
        import re
        h3s = re.findall(r'<h3[^>]*>.*?</h3>', html, re.S)[:5]
        links = re.findall(r'href="([^"]+)"', html[:5000])[:20]
        return f"""<pre>
HTML length: {len(html)}

=== FIRST 5 H3 TAGS ===
{chr(10).join(h3s[:5])}

=== FIRST 20 HREFS IN PAGE ===
{chr(10).join(links)}

=== HTML SAMPLE 2000-4000 ===
{html[2000:4000]}
</pre>"""

    # ── Finds board ───────────────────────────────────────────────
    @app.get("/finds")
    def get_finds():
        finds = _load_finds()
        return jsonify(finds), 200

    @app.post("/finds")
    @require_auth
    def post_find():
        user = get_user()
        data = request.get_json(silent=True) or {}
        title   = (data.get("title") or "").strip()
        desc    = (data.get("desc") or "").strip()
        wechat  = (data.get("wechat") or "").strip()
        product = (data.get("product") or "").strip()
        price   = (data.get("price") or "").strip()
        if not title:
            return jsonify({"error": "Title required."}), 400
        finds = _load_finds()
        find = {
            "id":        len(finds),
            "title":     title,
            "desc":      desc,
            "wechat":    wechat,
            "product":   product,
            "price":     price,
            "author":    user["name"],
            "timestamp": time.time(),
            "likes":     0,
        }
        finds.insert(0, find)
        finds = finds[:200]  # keep max 200
        _save_finds(finds)
        return jsonify(find), 200

    @app.post("/finds/<int:find_id>/like")
    @require_auth
    def like_find(find_id):
        finds = _load_finds()
        find  = next((f for f in finds if f["id"] == find_id), None)
        if not find:
            return jsonify({"error": "Not found."}), 404
        find["likes"] = find.get("likes", 0) + 1
        _save_finds(finds)
        return jsonify({"likes": find["likes"]}), 200

    @app.delete("/finds/<int:find_id>")
    @require_admin
    def delete_find(find_id):
        finds = _load_finds()
        finds = [f for f in finds if f["id"] != find_id]
        _save_finds(finds)
        return jsonify({"status": "deleted"}), 200

    # ── Debug ────────────────────────────────────────────────────
    @app.get("/debug/html")
    @require_admin
    def debug_html():
        from pathlib import Path
        p = Path("/app/data/debug_baidu.html")
        if not p.exists():
            return "No debug HTML saved yet", 404
        html = p.read_text(errors="replace")
        # Find h3 tags
        import re
        h3s = re.findall(r'<h3[^>]*>.*?</h3>', html[:100000], re.S)
        links = re.findall(r'href="([^"]{20,})"', html[:100000])
        return f"""
        <pre>
FILE SIZE: {len(html)} chars

=== H3 TAGS FOUND ({len(h3s)}) ===
{chr(10).join(h3s[:5])}

=== ALL HREFS ({len(links)}) ===
{chr(10).join(links[:30])}

=== HTML SAMPLE (chars 5000-8000) ===
{html[5000:8000]}
        </pre>
        """

    # ── Admin ─────────────────────────────────────────────────────
    @app.get("/admin")
    @require_admin
    def admin_dashboard():
        return render_template("admin.html", secret=ADMIN_SECRET)

    @app.get("/admin/data")
    @require_admin
    def admin_data():
        return jsonify(auth.get_admin_data())

    @app.post("/admin/approve/<req_id>")
    @require_admin
    def admin_approve(req_id):
        data     = request.get_json(silent=True) or {}
        password = (data.get("password") or "").strip()
        result   = auth.approve_request(req_id, password)
        return jsonify(result)

    @app.get("/admin/deny/<req_id>")
    @require_admin
    def admin_deny(req_id):
        return jsonify(auth.deny_request(req_id))

    @app.post("/admin/revoke")
    @require_admin
    def admin_revoke():
        data  = request.get_json(silent=True) or {}
        return jsonify(auth.revoke_user(data.get("email", "")))

    @app.post("/admin/set-admin")
    @require_admin
    def admin_set_admin():
        data = request.get_json(silent=True) or {}
        return jsonify(auth.set_admin(data.get("email", ""), data.get("is_admin", True)))

    @app.post("/admin/update-password")
    @require_admin
    def admin_update_password():
        data = request.get_json(silent=True) or {}
        return jsonify(auth.update_password(data.get("email", ""), data.get("password", "")))

    return app


app = create_app()

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=os.getenv("FLASK_DEBUG", "false").lower() == "true")

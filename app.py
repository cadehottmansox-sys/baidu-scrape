import asyncio
import json
import logging
import os
import time
from functools import wraps
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from flask import Flask, jsonify, redirect, render_template, request, make_response, session
from playwright.async_api import Error as PlaywrightError

import auth
from searcher import search_platform, scan_single

load_dotenv()

ADMIN_SECRET = os.getenv("ADMIN_SECRET", "changeme-set-in-env")
FINDS_FILE   = Path(__file__).parent / "data" / "finds.json"


def _load_finds():
    import storage
    return storage.read("sf_finds", []) or []

def _save_finds(finds):
    import storage
    storage.write("sf_finds", finds)


def create_app() -> Flask:
    app = Flask(__name__)
    app.secret_key = os.getenv("SECRET_KEY", "sourcefinder-secret-key-2024")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")

    # Session init for blocklist and 1688 toggle
    @app.before_request
    def init_session():
        if 'blocked_domains' not in session:
            session['blocked_domains'] = []
        if 'exclude_1688' not in session:
            session['exclude_1688'] = True

    # Clear all session tokens on startup
    try:
        import storage
        data = storage.read("sf_users", {"requests": [], "approved": []})
        changed = False
        for u in data.get("approved", []):
            if u.get("session_token"):
                u["session_token"] = None
                changed = True
        if changed:
            storage.write("sf_users", data)
            logging.getLogger(__name__).info("Cleared all session tokens on startup")
    except Exception as e:
        logging.getLogger(__name__).warning("Could not clear sessions on startup: %s", e)

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
            if secret == ADMIN_SECRET:
                return f(*args, **kwargs)
            token = request.cookies.get("sf_token","")
            if token:
                info = auth.validate_token(token, get_ip())
                if info.get("valid") and info.get("is_admin"):
                    return f(*args, **kwargs)
            if request.path.startswith("/api/"):
                return jsonify({"error": "Not authorized"}), 403
            return "Not authorized", 403
        return decorated

    @app.get("/")
    def root():
        token = request.cookies.get("sf_token")
        if token and auth.validate_token(token, get_ip())["valid"]:
            return render_template("index.html")
        return render_template("access.html")

    @app.post("/request-access")
    def request_access():
        data = request.get_json(silent=True) or {}
        name = (data.get("name") or "").strip()
        email = (data.get("email") or "").strip()
        reason = (data.get("reason") or data.get("why") or "").strip()
        discord = (data.get("discord") or "").strip()
        wechat = (data.get("wechat") or "").strip()
        password = (data.get("password") or "").strip()
        if not name or not email:
            return jsonify({"ok": False, "error": "Name and email required."}), 400
        result = auth.submit_request(name, email, reason, get_ip(), discord=discord, wechat=wechat, password=password)
        return jsonify(result), 200

    @app.post("/login")
    def login():
        data = request.get_json(silent=True) or {}
        email = (data.get("email") or "").strip()
        password = (data.get("password") or "").strip()
        if not email or not password:
            return jsonify({"error": "Email and password required."}), 400
        result = auth.login_user(email, password, get_ip())
        if not result["valid"]:
            if result.get("needs_password"):
                return jsonify({"ok": False, "needs_password": True, "email": email, "error": result.get("error", "")}), 200
            return jsonify({"error": result.get("error", "Invalid credentials.")}), 401
        resp = make_response(jsonify({"ok": True, "status": "ok", "name": result["name"], "is_admin": result.get("is_admin", False)}))
        resp.set_cookie("sf_token", result["token"], max_age=60*60*24*365, httponly=True, samesite="Lax")
        return resp

    @app.post("/set-password")
    def set_password_route():
        data = request.get_json(silent=True) or {}
        email = (data.get("email") or "").strip()
        password = (data.get("password") or "").strip()
        if not email or not password:
            return jsonify({"ok": False, "error": "Email and password required."}), 400
        result = auth.set_password(email, password)
        if result.get("ok"):
            resp = make_response(jsonify({"ok": True, "name": result["name"]}))
            resp.set_cookie("sf_token", result["token"], max_age=60*60*24*365, httponly=True, samesite="Lax")
            return resp
        return jsonify(result), 400

    @app.post("/logout")
    def logout():
        resp = make_response(jsonify({"status": "ok"}))
        resp.delete_cookie("sf_token")
        session.clear()
        return resp

    @app.get("/setup-admin")
    def setup_admin():
        secret = request.args.get("secret","")
        if secret != os.getenv("ADMIN_SECRET","secretcode"):
            return "Wrong secret", 403
        pw = request.args.get("pw", "sourcefinder2024")
        result = auth.update_password("cadehottmansox@gmail.com", pw)
        auth.set_admin("cadehottmansox@gmail.com", True)
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

    # ──── Admin API endpoints ────────────────────────────────────────────────
    @app.get("/api/admin/data")
    @require_admin
    def api_admin_data():
        try:
            data = auth.get_admin_data()
        except Exception as e:
            return jsonify({"pending":[],"approved":[],"error":str(e)}), 200
        pending = [r for r in data.get("requests",[]) if r.get("status")=="pending"]
        approved = data.get("approved",[])
        pending.sort(key=lambda x: x.get("timestamp",0), reverse=True)
        approved.sort(key=lambda x: x.get("last_login") or 0, reverse=True)
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
            "pending": pending,
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

    @app.post("/translate")
    @require_auth
    def translate():
        import urllib.request, urllib.parse
        data = request.get_json(silent=True) or {}
        text = (data.get("text") or "").strip()[:2000]
        target = (data.get("target") or "en").strip()
        source = (data.get("source") or "auto").strip()
        if not text: return jsonify({"translated": text})
        try:
            url = f"https://translate.googleapis.com/translate_a/single?client=gtx&sl={source}&tl={target}&dt=t&q={urllib.parse.quote(text)}"
            req = urllib.request.Request(url, headers={"User-Agent":"Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=8) as resp:
                import json as _json
                d = _json.loads(resp.read())
            translated = "".join(s[0] for s in d[0] if s[0])
            return jsonify({"translated": translated})
        except Exception as e:
            return jsonify({"translated": text, "error": str(e)})

    @app.post("/api/notes")
    @require_auth
    def save_note():
        user = get_user()
        data = request.get_json(silent=True) or {}
        link = (data.get("link") or "").strip()
        note = (data.get("note") or "").strip()
        if not link: return jsonify({"ok": False})
        db = auth.get_admin_data()
        u = next((u for u in db["approved"] if u["email"]==user["email"]), None)
        if not u: return jsonify({"ok": False})
        notes = u.get("notes", {})
        if note: notes[link] = note
        elif link in notes: del notes[link]
        u["notes"] = notes
        auth._save(db)
        return jsonify({"ok": True})

    @app.get("/debug-backup")
    @require_auth
    def debug_backup():
        import os
        token = os.getenv("GITHUB_BACKUP_TOKEN", "")
        gist_id = os.getenv("GITHUB_GIST_ID", "")
        result = {"token_set": bool(token), "token_prefix": token[:8] if token else "", "gist_id": gist_id}
        try:
            from backup import push_backup
            push_backup("sf_users.json", {"test": True})
            result["push_result"] = "called"
        except Exception as e:
            result["push_error"] = str(e)
        try:
            import urllib.request, urllib.error, json
            headers = {"Authorization": f"token {token}", "User-Agent": "test"}
            req = urllib.request.Request(f"https://api.github.com/gists/{gist_id}", headers=headers)
            with urllib.request.urlopen(req, timeout=10) as r:
                d = json.loads(r.read())
                result["gist_ok"] = True
                result["gist_files"] = list(d.get("files", {}).keys())
        except Exception as e:
            result["gist_error"] = str(e)
        return jsonify(result)

    @app.get("/api/notes")
    @require_auth
    def get_notes():
        user = get_user()
        db = auth.get_admin_data()
        u = next((u for u in db["approved"] if u["email"]==user["email"]), None)
        return jsonify({"notes": u.get("notes", {}) if u else {}})

    @app.get("/api/saved")
    @require_auth
    def get_saved():
        user = get_user()
        data = auth.get_admin_data()
        u = next((u for u in data["approved"] if u["email"]==user["email"]), None)
        return jsonify({"saved": u.get("saved_results", []) if u else []})

    @app.post("/api/saved")
    @require_auth
    def save_result():
        user = get_user()
        item = request.get_json(silent=True) or {}
        data = auth.get_admin_data()
        u = next((u for u in data["approved"] if u["email"]==user["email"]), None)
        if not u: return jsonify({"ok": False}), 404
        saved = u.get("saved_results", [])
        if not any(s.get("link")==item.get("link") for s in saved):
            saved.insert(0, item)
            saved = saved[:100]
        u["saved_results"] = saved
        auth._save(data)
        return jsonify({"ok": True, "count": len(saved)})

    @app.delete("/api/saved")
    @require_auth
    def unsave_result():
        user = get_user()
        link = (request.get_json(silent=True) or {}).get("link","")
        data = auth.get_admin_data()
        u = next((u for u in data["approved"] if u["email"]==user["email"]), None)
        if not u: return jsonify({"ok": False}), 404
        u["saved_results"] = [s for s in u.get("saved_results",[]) if s.get("link")!=link]
        auth._save(data)
        return jsonify({"ok": True})

    @app.get("/api/me")
    def api_me():
        token = request.cookies.get("sf_token","")
        ip = request.headers.get("X-Forwarded-For", request.remote_addr or "")
        info = auth.validate_token(token, ip)
        if not info["valid"]: return jsonify({"valid":False}), 401
        return jsonify({"valid":True,"name":info["name"],"email":info.get("email",""),"is_admin":info.get("is_admin",False)})

    @app.get("/me")
    @require_auth
    def me():
        user = get_user()
        return jsonify({"name": user["name"], "email": user["email"], "is_admin": user.get("is_admin", False)})

    @app.post("/set-password")
    def set_password():
        data = request.get_json(silent=True) or {}
        email = (data.get("email") or "").strip()
        password = (data.get("password") or "").strip()
        if not email or not password:
            return jsonify({"ok": False, "error": "Email and password required."}), 400
        result = auth.set_password(email, password)
        if not result.get("ok"):
            return jsonify(result), 400
        resp = make_response(jsonify({"ok": True, "name": result["name"], "is_admin": result.get("is_admin", False)}))
        resp.set_cookie("sf_token", result["token"], max_age=60*60*24*365, httponly=True, samesite="Lax")
        return resp

    @app.get("/admin/api/data")
    @require_auth
    def admin_api_data():
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
                "email": u["email"],
                "name": u["name"],
                "searches": u.get("search_count", 0),
                "last_search": u.get("last_search", "never"),
                "last_query": u.get("last_query", ""),
                "is_admin": u.get("is_admin", False),
                "revoked": u.get("revoked", False),
                "approved_at": u.get("approved_at", 0),
            })
        analytics.sort(key=lambda x: x["searches"], reverse=True)
        return jsonify(analytics)

    # ──── MAIN SEARCH ROUTE (with official domain filter) ────────────────
    @app.post("/search")
    @require_auth
    def search() -> tuple[Any, int]:
        payload = request.get_json(silent=True) or {}
        query = (payload.get("query") or "").strip()
        brand = (payload.get("brand") or "").strip()
        platform = (payload.get("platform") or "baidu").strip().lower()
        mode = (payload.get("mode") or "supplier").strip().lower()
        deep_scan = bool(payload.get("deep_scan", False))
        wechat_only = bool(payload.get("wechat_only", False))
        page_num = max(1, int(payload.get("page_num", 1)))
        variation = max(0, int(payload.get("variation", 0)))
        seen_links = list(payload.get("seen_links") or [])

        if not query:
            return jsonify({"error": "Please enter a search query."}), 400
        if mode not in {"supplier", "ff", "passing", "trend", "batch", "research"}:
            return jsonify({"error": "Invalid mode."}), 400
        if mode in {"trend", "batch", "research"}:
            mode = "supplier"

        try:
            results = asyncio.run(search_platform(
                query, brand=brand, platform=platform, mode=mode,
                deep_scan=deep_scan, wechat_only=wechat_only,
                page_num=page_num, variation=variation, seen_links=seen_links,
            ))
            # Apply session filters (blocked domains, exclude 1688)
            blocked_domains = session.get('blocked_domains', [])
            if blocked_domains:
                results = [r for r in results if not any(bd in r.get('link', '') for bd in blocked_domains)]
            if session.get('exclude_1688', True):
                results = [r for r in results if '1688.com' not in r.get('link', '')]
            # Official domain filter (hard remove)
            official_domains = ["nike.com", "adidas.com", "gucci.com", "lv.com",
                                "stockx.com", "goat.com", "footlocker.com", "champssports.com"]
            results = [r for r in results if not any(dom in r.get('link', '') for dom in official_domains)]
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
        data = request.get_json(silent=True) or {}
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
                    ctx = await browser.new_context()
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
        data = request.get_json(silent=True) or {}
        url = (data.get("url") or "").strip()
        if not url:
            return jsonify({"error": "URL required."}), 400
        try:
            result = asyncio.run(scan_single(url))
            return jsonify(result), 200
        except Exception as exc:
            app.logger.exception("Scan page failed: %s", exc)
            return jsonify({"error": "Scan failed. Try again."}), 500

    # ──── Finds board ────────────────────────────────────────────────────────
    @app.get("/finds")
    def get_finds():
        finds = _load_finds()
        return jsonify(finds), 200

    @app.post("/finds")
    @require_auth
    def post_find():
        user = get_user()
        data = request.get_json(silent=True) or {}
        title = (data.get("title") or "").strip()
        desc = (data.get("desc") or "").strip()
        wechat = (data.get("wechat") or "").strip()
        product = (data.get("product") or "").strip()
        price = (data.get("price") or "").strip()
        if not title:
            return jsonify({"error": "Title required."}), 400
        finds = _load_finds()
        find = {
            "id": len(finds),
            "title": title,
            "desc": desc,
            "wechat": wechat,
            "product": product,
            "price": price,
            "author": user["name"],
            "timestamp": time.time(),
            "likes": 0,
        }
        finds.insert(0, find)
        finds = finds[:200]
        _save_finds(finds)
        return jsonify(find), 200

    @app.post("/finds/<int:find_id>/like")
    @require_auth
    def like_find(find_id):
        finds = _load_finds()
        find = next((f for f in finds if f["id"] == find_id), None)
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

    # ──── Douyin endpoints (unchanged) ──────────────────────────────────────
    @app.route('/api/douyin-video', methods=['POST'])
    def douyin_video():
        user = get_user()
        if not user:
            return jsonify({'error': 'Unauthorized'}), 401
        try:
            import yt_dlp, tempfile, os, re, base64
            data = request.get_json(silent=True) or {}
            url = (data.get('url') or '').strip()
            if not url:
                return jsonify({'error': 'No URL'}), 400
            if not any(d in url for d in ['douyin.com','tiktok.com','iesdouyin.com','v.douyin']):
                return jsonify({'error': 'Not a Douyin URL'}), 400
            with tempfile.TemporaryDirectory() as tmpdir:
                outtmpl = os.path.join(tmpdir, 'vid.%(ext)s')
                opts = {'outtmpl': outtmpl, 'format': 'mp4/best', 'quiet': True, 'no_warnings': True,
                        'http_headers': {'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15'}}
                with yt_dlp.YoutubeDL(opts) as ydl:
                    info = ydl.extract_info(url, download=True)
                desc = info.get('description') or info.get('title') or ''
                author = info.get('uploader') or ''
                vfile = None
                for f in os.listdir(tmpdir):
                    if f.startswith('vid.'):
                        vfile = os.path.join(tmpdir, f); break
                if not vfile:
                    return jsonify({'error': 'Download failed'}), 500
                sz = os.path.getsize(vfile)
                if sz > 50*1024*1024:
                    return jsonify({'error': 'Video too large (50MB max)'}), 400
                with open(vfile,'rb') as vf:
                    vb64 = base64.b64encode(vf.read()).decode()
                wechats = []
                for pat in [r'\u5fae\u4fe1[\uff1a:\u53f7]?\s*([A-Za-z0-9_\-]{5,25})',
                             r'wx[\uff1a:]?\s*([A-Za-z0-9_\-]{5,25})',
                             r'V\u4fe1[\uff1a:]?\s*([A-Za-z0-9_\-]{5,25})',
                             r'weixin[\uff1a:]?\s*([A-Za-z0-9_\-]{5,25})']:
                    for m in re.findall(pat, desc+' '+author, re.IGNORECASE):
                        if m not in wechats: wechats.append(m)
                return jsonify({'ok': True, 'video_b64': vb64,
                    'ext': os.path.splitext(vfile)[1].lstrip('.') or 'mp4',
                    'description': desc, 'author': author,
                    'duration': info.get('duration',0),
                    'view_count': info.get('view_count',0),
                    'like_count': info.get('like_count',0),
                    'wechats': wechats,
                    'file_size_mb': round(sz/1024/1024,1)})
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    @app.route('/api/douyin-search', methods=['POST'])
    def douyin_search():
        user = get_user()
        if not user:
            return jsonify({'error': 'Unauthorized'}), 401
        import requests as _req, re as _re, os, base64, time
        data = request.get_json(silent=True) or {}
        query = (data.get('query') or '').strip()
        if not query:
            return jsonify({'error': 'No query'}), 400
        max_vids = min(int(data.get('max_results', 5)), 8)
        api_key = os.getenv('SCRAPINGDOG_API_KEY', '69e6b959ba3950604d5080d7')
        results = []
        debug_info = []
        try:
            search_queries = [
                query + ' 抖音 site:douyin.com',
                query + ' 抖音号 douyin.com',
                query + ' 抖音视频 莆田 微信',
            ]
            video_ids = []
            seen = set()
            for sq in search_queries:
                if len(video_ids) >= max_vids: break
                try:
                    r = _req.get('https://api.scrapingdog.com/baidu/search/',
                        params={'api_key': api_key, 'query': sq, 'results': 20, 'country': 'cn'},
                        timeout=20)
                    if r.status_code != 200:
                        debug_info.append('baidu_err:'+str(r.status_code))
                        continue
                    raw = r.json()
                    organic = raw.get('Baidu_data') or raw.get('organic_data') or raw.get('data') or []
                    if not isinstance(organic, list): organic = []
                    debug_info.append('baidu:'+str(len(organic))+':'+sq[:25])
                    for item in organic:
                        parts = [item.get('link',''), item.get('url',''),
                                 item.get('description',''), item.get('snippet',''), item.get('title','')]
                        combined = ' '.join(str(p) for p in parts)
                        import re as _r2
                        for m in _r2.finditer(r'douyin\.com/video/(\d{15,20})', combined):
                            vid = m.group(1)
                            if vid not in seen: seen.add(vid); video_ids.append(vid)
                        for m in _r2.finditer(r'v\.douyin\.com/([A-Za-z0-9]{6,12})', combined):
                            short = 'https://v.douyin.com/'+m.group(1)+'/'
                            if short not in seen: seen.add(short); video_ids.append(short)
                except Exception as e:
                    debug_info.append('sq_err:'+str(e)[:40])
            debug_info.append('ids:'+str(len(video_ids)))
            wc_pats = [
                _re.compile(r'[\u5fae\u4fe1][\uff1a:]?\s*([A-Za-z0-9_\-]{5,25})'),
                _re.compile(r'wx[\uff1a:]?\s*([A-Za-z0-9_\-]{5,25})', _re.I),
                _re.compile(r'weixin[\uff1a:]?\s*([A-Za-z0-9_\-]{5,25})', _re.I),
            ]
            def scan_wc(text):
                found = []
                for p in wc_pats:
                    for m in p.findall(text or ''):
                        if m and len(m)>=5 and m not in found: found.append(m)
                return found
            hdrs = {'User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
                    'Referer':'https://www.douyin.com/'}
            for vid in video_ids[:max_vids]:
                try:
                    vurl = ('https://www.douyin.com/video/'+vid) if vid.isdigit() else vid
                    vr = _req.get('https://api.douyin.wtf/api/hybrid/video_data',
                                  params={'url':vurl,'minimal':'false'}, timeout=25, headers=hdrs)
                    if vr.status_code != 200: continue
                    vd = vr.json()
                    if vd.get('status') == 'failed': continue
                    desc = vd.get('desc') or vd.get('title') or ''
                    ao = vd.get('author') or {}
                    author = ao.get('nickname') or ao.get('unique_id') or ''
                    author_sig = ao.get('signature') or ''
                    stats = vd.get('statistics') or {}
                    vo = vd.get('video') or {}
                    play_url = (vo.get('play_addr') or vo.get('download_addr') or
                                vo.get('wm_video_url_HQ') or vo.get('wm_video_url') or '')
                    video_b64 = ''
                    if play_url:
                        try:
                            dl = _req.get(play_url, timeout=30, stream=True, headers=hdrs)
                            chunks = b''
                            for chunk in dl.iter_content(65536):
                                chunks += chunk
                                if len(chunks) > 25*1024*1024: break
                            if chunks: video_b64 = base64.b64encode(chunks).decode()
                        except Exception: pass
                    wechats = scan_wc(desc+' '+author+' '+author_sig)
                    results.append({'url':vurl,'title':desc[:120] if desc else author+' - Douyin',
                        'desc':desc,'author':author,'author_sig':author_sig,
                        'play_count':stats.get('play_count',0),'digg_count':stats.get('digg_count',0),
                        'comment_count':stats.get('comment_count',0),'duration':vo.get('duration',0),
                        'wechats':wechats,'video_b64':video_b64,'has_video':bool(video_b64),'video_url':play_url})
                    time.sleep(0.3)
                except Exception as e: debug_info.append('vid_err:'+str(e)[:40])
        except Exception as e:
            return jsonify({'error':str(e),'debug':debug_info}), 500
        return jsonify({'ok':True,'query':query,'results':results,'count':len(results),'debug':debug_info})

    @app.route("/api/chat/messages")
    def get_chat_messages():
        import storage
        user = get_user()
        if not user:
            return jsonify({"error": "Unauthorized"}), 401
        msgs = storage.read("sf_chat_v2", [])
        return jsonify(msgs[-200:] if msgs else [])

    @app.route("/api/chat/send", methods=["POST"])
    def send_chat():
        import storage, time as _t
        user = get_user()
        if not user:
            return jsonify({"error": "Unauthorized"}), 401
        data = request.get_json() or {}
        msg = (data.get("message") or "").strip()[:500]
        if not msg:
            return jsonify({"error": "Empty"}), 400
        msgs = storage.read("sf_chat_v2", [])
        msgs.append({
            "id": int(_t.time()*1000),
            "name": user.get("name", user.get("email", "User")),
            "email": user.get("email", ""),
            "message": msg,
            "type": data.get("type", "chat"),
            "ts": _t.time()
        })
        storage.write("sf_chat_v2", msgs[-500:])
        return jsonify({"ok": True})

    @app.route("/api/image-search", methods=["POST"])
    def image_search():
        user = get_user()
        if not user:
            return jsonify({"error": "Unauthorized"}), 401
        import base64, tempfile, os
        try:
            import requests as _req
        except ImportError:
            return jsonify({"error": "requests not available"}), 500
        data = request.get_json(silent=True) or {}
        image_b64 = data.get("image", "")
        if not image_b64:
            return jsonify({"error": "No image provided"}), 400
        try:
            if ',' in image_b64:
                image_b64 = image_b64.split(',')[1]
            img_bytes = base64.b64decode(image_b64)
            with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as f:
                f.write(img_bytes)
                tmp = f.name
            try:
                hdrs = {"User-Agent": "Mozilla/5.0", "Referer": "https://image.baidu.com/"}
                with open(tmp, 'rb') as f:
                    r = _req.post("https://graph.baidu.com/upload", files={"image": ("img.jpg", f, "image/jpeg")}, headers=hdrs, timeout=15)
                rd = r.json()
                sign = rd.get("sign", "")
                if not sign:
                    return jsonify({"error": "Baidu upload failed", "detail": str(rd)[:200]}), 500
                sr = _req.get(f"https://graph.baidu.com/details?sign={sign}&tn=pc&from=pc", headers=hdrs, timeout=15)
                sd = sr.json() if sr.status_code==200 else {}
                items = sd.get("data", {})
                if isinstance(items, dict): items = items.get("list", [])
                results = [{"title": x.get("fromPageTitleEnc",""), "link": x.get("fromUrl",""), "thumb": x.get("middleURL",""), "source": x.get("fromURLHost","")} for x in (items or [])[:15] if x.get("fromUrl")]
                return jsonify({"ok": True, "sign": sign, "results": results, "count": len(results), "baidu_url": f"https://image.baidu.com/search/detail?sign={sign}"})
            finally:
                try: os.unlink(tmp)
                except: pass
        except Exception as e:
            app.logger.error("Image search error: %s", e)
            return jsonify({"error": str(e)}), 500

    # ======================= NEW: BLOCKLIST API =======================
    @app.route("/api/block_domain", methods=["POST"])
    @require_auth
    def block_domain():
        data = request.get_json(silent=True) or {}
        domain = data.get("domain", "").strip()
        if domain and domain not in session['blocked_domains']:
            session['blocked_domains'].append(domain)
            session.modified = True
        return jsonify({"ok": True, "blocked": session['blocked_domains']})

    @app.route("/api/unblock_all", methods=["POST"])
    @require_auth
    def unblock_all():
        session['blocked_domains'] = []
        session.modified = True
        return jsonify({"ok": True})

    @app.route("/api/set_exclude_1688", methods=["POST"])
    @require_auth
    def set_exclude_1688():
        data = request.get_json(silent=True) or {}
        session['exclude_1688'] = bool(data.get("exclude", True))
        session.modified = True
        return jsonify({"ok": True, "exclude_1688": session['exclude_1688']})
    # ================================================================

    return app


app = create_app()


@app.route("/api/global-stats")
def global_stats():
    import storage
    stats = storage.read("sf_global_stats", {"total_searches": 0, "total_wechats": 0})
    return jsonify(stats)

@app.route("/api/global-stats/bump", methods=["POST"])
def bump_global_stats():
    import storage
    data = request.get_json() or {}
    stats = storage.read("sf_global_stats", {"total_searches": 0, "total_wechats": 0})
    stats["total_searches"] = stats.get("total_searches", 0) + int(data.get("searches", 0))
    stats["total_wechats"] = stats.get("total_wechats", 0) + int(data.get("wechats", 0))
    storage.write("sf_global_stats", stats)
    return jsonify(stats)


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=os.getenv("FLASK_DEBUG","false").lower()=="true")


# ========== BRAND-AWARE SEARCH & FREIGHT ENDPOINTS ==========
from searcher import build_brand_aware_query, build_freight_query, score_freight_forwarder

@app.route("/api/brand_aware_search", methods=["POST"])
@require_auth
def brand_aware_search():
    data = request.get_json(silent=True) or {}
    query = data.get("query", "").strip()
    brand = data.get("brand", "").strip()
    if not query:
        return jsonify({"error": "Query required"}), 400
    enhanced_query = build_brand_aware_query(query, brand)
    try:
        results = asyncio.run(search_platform(
            query=enhanced_query,
            brand=brand,
            platform="all",
            mode="supplier",
            deep_scan=False,
            wechat_only=False,
            page_num=1
        ))
        return jsonify({
            "ok": True,
            "original_query": query,
            "enhanced_query": enhanced_query,
            "results": results[:20],
            "count": len(results)
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/freight_search", methods=["POST"])
@require_auth
def freight_search():
    data = request.get_json(silent=True) or {}
    origin = data.get("origin", "")
    destination = data.get("destination", "USA")
    cargo_type = data.get("cargo_type", "replica")
    query = build_freight_query(origin, destination, cargo_type)
    try:
        results = asyncio.run(search_platform(
            query=query,
            brand="",
            platform="baidu",
            mode="supplier",
            deep_scan=False,
            wechat_only=False,
            page_num=1
        ))
        for r in results:
            text = (r.get("title") or "") + " " + (r.get("snippet") or "")
            r["ff_score"] = score_freight_forwarder(text)
        results.sort(key=lambda x: x.get("ff_score", 0), reverse=True)
        return jsonify({
            "ok": True,
            "query": query,
            "results": results[:15],
            "count": len(results)
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

import asyncio
import logging
import os
from functools import wraps
from typing import Any

from dotenv import load_dotenv
from flask import Flask, jsonify, redirect, render_template, request, make_response
from playwright.async_api import Error as PlaywrightError

import auth
from searcher import search_platform

load_dotenv()

ADMIN_SECRET = os.getenv("ADMIN_SECRET", "changeme-set-in-env")


def create_app() -> Flask:
    app = Flask(__name__)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")

    def get_ip():
        return request.headers.get("X-Forwarded-For", request.remote_addr or "unknown").split(",")[0].strip()

    def require_auth(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            token = request.cookies.get("sf_token")
            result = auth.validate_token(token or "", get_ip())
            if not result["valid"]:
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

    # ── Root — access page or app ─────────────────────────────────
    @app.get("/")
    def root():
        token = request.cookies.get("sf_token")
        if token and auth.validate_token(token, get_ip())["valid"]:
            return render_template("index.html")
        return render_template("access.html")

    @app.post("/request-access")
    def request_access():
        data   = request.get_json(silent=True) or {}
        name    = (data.get("name") or "").strip()
        email   = (data.get("email") or "").strip()
        reason  = (data.get("reason") or "").strip()
        discord = (data.get("discord") or "").strip()
        wechat  = (data.get("wechat") or "").strip()
        country = (data.get("country") or "").strip()
        source  = (data.get("source") or "").strip()
        if not name or not email:
            return jsonify({"error": "Name and email required."}), 400
        if not discord and not wechat:
            return jsonify({"error": "Discord or WeChat required."}), 400
        result = auth.submit_request(name, email, reason, get_ip(), discord=discord, wechat=wechat, country=country, source=source)
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
            return jsonify({"error": result.get("error", "Invalid credentials.")}), 401
        resp = make_response(jsonify({"status": "ok", "name": result["name"]}))
        resp.set_cookie("sf_token", result["token"], max_age=60*60*24*30, httponly=True, samesite="Lax")
        return resp

    @app.post("/logout")
    def logout():
        resp = make_response(jsonify({"status": "ok"}))
        resp.delete_cookie("sf_token")
        return resp

    # ── Main search ───────────────────────────────────────────────
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
            return jsonify({
                "query": query, "brand": brand, "platform": platform,
                "mode": mode, "deep_scan": deep_scan, "wechat_only": wechat_only,
                "page_num": page_num, "variation": variation, "results": results,
            }), 200
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
        result = auth.deny_request(req_id)
        return jsonify(result)

    @app.post("/admin/revoke")
    @require_admin
    def admin_revoke():
        data  = request.get_json(silent=True) or {}
        email = data.get("email", "")
        return jsonify(auth.revoke_user(email))

    @app.post("/admin/update-password")
    @require_admin
    def admin_update_password():
        data     = request.get_json(silent=True) or {}
        email    = data.get("email", "")
        password = data.get("password", "")
        return jsonify(auth.update_password(email, password))

    return app


app = create_app()

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=os.getenv("FLASK_DEBUG", "false").lower() == "true")

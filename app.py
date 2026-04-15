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
            token = request.cookies.get("sf_token") or request.args.get("token")
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

    # ── Root — shows access page OR app depending on auth ────────
    @app.get("/")
    def root():
        token = request.cookies.get("sf_token") or request.args.get("token")
        if token and auth.validate_token(token, get_ip())["valid"]:
            return render_template("index.html")
        return render_template("access.html")

    @app.post("/request-access")
    def request_access():
        data   = request.get_json(silent=True) or {}
        name   = (data.get("name") or "").strip()
        email  = (data.get("email") or "").strip()
        reason = (data.get("reason") or "").strip()
        if not name or not email:
            return jsonify({"error": "Name and email required."}), 400
        result = auth.submit_request(name, email, reason, get_ip())
        return jsonify(result), 200

    @app.get("/login")
    def login():
        token = request.args.get("token", "")
        result = auth.validate_token(token, get_ip())
        if not result["valid"]:
            return redirect("/?error=invalid")
        resp = make_response(redirect("/"))
        resp.set_cookie("sf_token", token, max_age=60*60*24*30, httponly=True, samesite="Lax")
        return resp

    # ── Main app ─────────────────────────────────────────────────
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

        app.logger.info("Search | mode=%s platform=%s page=%d var=%d deep=%s wc_only=%s", mode, platform, page_num, variation, deep_scan, wechat_only)

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

    # ── Admin routes ─────────────────────────────────────────────
    @app.get("/admin")
    @require_admin
    def admin_dashboard():
        return render_template("admin.html", secret=ADMIN_SECRET)

    @app.get("/admin/data")
    @require_admin
    def admin_data():
        return jsonify(auth.get_admin_data())

    @app.get("/admin/approve/<req_id>")
    @require_admin
    def admin_approve(req_id):
        result = auth.approve_request(req_id)
        return render_template("admin_action.html", action="approved", result=result, secret=ADMIN_SECRET)

    @app.get("/admin/deny/<req_id>")
    @require_admin
    def admin_deny(req_id):
        result = auth.deny_request(req_id)
        return render_template("admin_action.html", action="denied", result=result, secret=ADMIN_SECRET)

    @app.post("/admin/revoke")
    @require_admin
    def admin_revoke():
        data  = request.get_json(silent=True) or {}
        email = data.get("email", "")
        return jsonify(auth.revoke_user(email))

    return app


app = create_app()

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=os.getenv("FLASK_DEBUG", "false").lower() == "true")

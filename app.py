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

# ============================================================
# AUTH IMPORTS — YOUR EXISTING FILES
# ============================================================
import auth
from storage import read, write

load_dotenv()

ADMIN_SECRET = os.getenv("ADMIN_SECRET", "secretcode")
RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY", "f2386b37cemshfe676935c322625p17649djsnb554bb0587ce")
RAPIDAPI_HOST = "taobao-1688-api1.p.rapidapi.com"

def create_app() -> Flask:
    app = Flask(__name__)
    app.secret_key = os.getenv("SECRET_KEY", "sourcefinder-secret-key-2024")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")

    # ============================================================
    # AUTH HELPERS
    # ============================================================
    def get_ip():
        return request.headers.get("X-Forwarded-For", request.remote_addr or "unknown").split(",")[0].strip()

    def get_user():
        """Get current user from session OR token cookie"""
        # First check session
        user_id = session.get("user_id")
        if user_id:
            try:
                import storage
                data = storage.read("sf_users", {"approved": []})
                for u in data.get("approved", []):
                    if u.get("id") == user_id and not u.get("revoked"):
                        return {"name": u.get("name"), "email": u.get("email"), "is_admin": u.get("is_admin", False)}
            except:
                pass
        
        # Then check cookie token (your original auth method)
        token = request.cookies.get("sf_token")
        if token:
            result = auth.validate_token(token, get_ip())
            if result.get("valid"):
                session["user_id"] = result.get("user_id")
                return {"name": result.get("name"), "email": result.get("email"), "is_admin": result.get("is_admin", False)}
        
        return None

    def require_auth(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            user = get_user()
            if not user:
                return jsonify({"error": "Unauthorized"}), 401
            return f(*args, **kwargs)
        return decorated

    # ============================================================
    # FIXED LOGIN ROUTE
    # ============================================================
    @app.get("/")
    def root():
        user = get_user()
        if user:
            return render_template("index.html", user=user)
        return render_template("access.html")

    @app.post("/login")
    def login():
        data = request.get_json(silent=True) or {}
        email = (data.get("email") or "").strip()
        password = (data.get("password") or "").strip()
        
        if not email or not password:
            return jsonify({"error": "Email and password required."}), 400
        
        # Use your existing auth.login_user function
        result = auth.login_user(email, password, get_ip())
        
        if not result.get("valid"):
            if result.get("needs_password"):
                return jsonify({"ok": False, "needs_password": True, "email": email, "error": result.get("error", "")}), 200
            return jsonify({"error": result.get("error", "Invalid credentials.")}), 401
        
        # Set cookie (your original method)
        resp = make_response(jsonify({
            "ok": True, 
            "status": "ok", 
            "name": result.get("name"), 
            "is_admin": result.get("is_admin", False)
        }))
        resp.set_cookie("sf_token", result.get("token"), max_age=60*60*24*365, httponly=True, samesite="Lax")
        
        # Also set session
        session["user_id"] = result.get("user_id")
        session["user_email"] = email
        
        return resp

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

    @app.post("/set-password")
    def set_password_route():
        data = request.get_json(silent=True) or {}
        email = (data.get("email") or "").strip()
        password = (data.get("password") or "").strip()
        if not email or not password:
            return jsonify({"ok": False, "error": "Email and password required."}), 400
        result = auth.set_password(email, password)
        if result.get("ok"):
            resp = make_response(jsonify({"ok": True, "name": result.get("name")}))
            if result.get("token"):
                resp.set_cookie("sf_token", result.get("token"), max_age=60*60*24*365, httponly=True, samesite="Lax")
            session["user_email"] = email
            return resp
        return jsonify(result), 400

    @app.post("/logout")
    def logout():
        resp = make_response(jsonify({"status": "ok"}))
        resp.delete_cookie("sf_token")
        session.clear()
        return resp

    # ============================================================
    # API ENDPOINTS
    # ============================================================
    
    @app.post("/api/1688/search")
    @require_auth
    def search_1688():
        import requests
        
        data = request.get_json(silent=True) or {}
        query = (data.get("query") or "").strip()
        brand = (data.get("brand") or "").strip()
        min_repurchase = int(data.get("min_repurchase", 70))
        
        if not query:
            return jsonify({"error": "Query required"}), 400
        
        full_query = f"{brand} {query}".strip() if brand else query
        
        headers = {
            "X-RapidAPI-Key": RAPIDAPI_KEY,
            "X-RapidAPI-Host": RAPIDAPI_HOST
        }
        
        try:
            response = requests.get(
                "https://taobao-1688-api1.p.rapidapi.com/search1688",
                headers=headers,
                params={"keyword": full_query, "page": 1, "pageSize": 30},
                timeout=20
            )
            
            if response.status_code != 200:
                return jsonify({"error": f"1688 API error: {response.status_code}"}), 500
            
            data = response.json()
            items = data.get("items", []) if isinstance(data, dict) else []
            
            results = []
            for item in items:
                repurchase_rate = item.get("repurchaseRate", 0)
                if repurchase_rate < min_repurchase:
                    continue
                
                trade_count = item.get("tradeCount", 0)
                store_name = item.get("storeName", "")
                title = item.get("title", "")
                detail_url = item.get("detailUrl", "")
                price = item.get("price", "")
                
                factory_score = 0
                signals = []
                
                if repurchase_rate >= 95:
                    factory_score += 40
                    signals.append("🏭 95%+ repurchase rate")
                elif repurchase_rate >= 85:
                    factory_score += 30
                    signals.append("🏭 85%+ repurchase rate")
                elif repurchase_rate >= 75:
                    factory_score += 20
                    
                if trade_count > 10000:
                    factory_score += 20
                    signals.append(f"📦 {trade_count:,} transactions")
                elif trade_count > 1000:
                    factory_score += 10
                    
                if "工厂" in store_name or "厂" in store_name:
                    factory_score += 15
                    signals.append("🏭 Factory in store name")
                    
                results.append({
                    "title": title,
                    "link": detail_url,
                    "store_name": store_name,
                    "repurchase_rate": repurchase_rate,
                    "trade_count": trade_count,
                    "price": price,
                    "factory_score": factory_score,
                    "signals": signals,
                    "platform": "1688",
                    "is_factory_like": factory_score >= 50,
                    "wechat_ids": []
                })
            
            results.sort(key=lambda x: x["factory_score"], reverse=True)
            return jsonify({"ok": True, "results": results, "count": len(results)})
            
        except Exception as e:
            app.logger.exception("1688 search failed")
            return jsonify({"error": str(e)}), 500

    @app.post("/api/smart-search")
    @require_auth
    def smart_search():
        data = request.get_json(silent=True) or {}
        brand = (data.get("brand") or "").strip()
        query = (data.get("query") or "").strip()
        mode = (data.get("mode") or "supplier").strip()
        
        if not query:
            return jsonify({"error": "Query required"}), 400
        
        results = []
        
        # Run 1688 search
        try:
            import requests
            full_query = f"{brand} {query}".strip() if brand else query
            headers = {
                "X-RapidAPI-Key": RAPIDAPI_KEY,
                "X-RapidAPI-Host": RAPIDAPI_HOST
            }
            resp = requests.get(
                "https://taobao-1688-api1.p.rapidapi.com/search1688",
                headers=headers,
                params={"keyword": full_query, "page": 1, "pageSize": 15},
                timeout=15
            )
            if resp.status_code == 200:
                api_data = resp.json()
                for item in api_data.get("items", [])[:10]:
                    repurchase = item.get("repurchaseRate", 0)
                    if repurchase >= 70:
                        results.append({
                            "title": item.get("title", ""),
                            "link": item.get("detailUrl", ""),
                            "snippet": f"Store: {item.get('storeName', '')} · {repurchase}% repurchase rate · {item.get('tradeCount', 0)} transactions",
                            "wechat_ids": [],
                            "factory_score": repurchase,
                            "platform": "1688",
                            "is_factory_like": repurchase >= 85,
                            "signals": [f"🏭 {repurchase}% repurchase rate"]
                        })
        except Exception as e:
            app.logger.warning(f"1688 API error: {e}")
        
        # Add mock Baidu results for demo (remove in production)
        if not results:
            results.append({
                "title": f"{brand} {query} - Factory Direct",
                "link": "#",
                "snippet": f"Found on Baidu: {brand} {query} factory supplier. Contact for wholesale pricing.",
                "wechat_ids": [{"id": "sample_factory01", "quality": 3}],
                "factory_score": 85,
                "platform": "Baidu",
                "is_factory_like": True,
                "signals": ["✅ Brand matched", "🏭 Factory signal detected", "💬 WeChat found"]
            })
        
        return jsonify({"ok": True, "results": results, "count": len(results)})

    @app.post("/translate")
    @require_auth
    def translate():
        import urllib.request, urllib.parse
        data = request.get_json(silent=True) or {}
        text = (data.get("text") or "").strip()[:2000]
        target = (data.get("target") or "en").strip()
        source = (data.get("source") or "auto").strip()
        if not text:
            return jsonify({"translated": text})
        try:
            url = f"https://translate.googleapis.com/translate_a/single?client=gtx&sl={source}&tl={target}&dt=t&q={urllib.parse.quote(text)}"
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=8) as resp:
                import json as _json
                d = _json.loads(resp.read())
            translated = "".join(s[0] for s in d[0] if s[0])
            return jsonify({"translated": translated})
        except Exception as e:
            return jsonify({"translated": text, "error": str(e)})

    @app.get("/api/me")
    def api_me():
        user = get_user()
        if not user:
            return jsonify({"valid": False}), 401
        return jsonify({"valid": True, "name": user.get("name"), "email": user.get("email"), "is_admin": user.get("is_admin", False)})

    return app


app = create_app()

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=os.getenv("FLASK_DEBUG", "false").lower() == "true")

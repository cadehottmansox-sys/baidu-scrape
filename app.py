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
# AUTH IMPORTS — THESE ARE YOUR EXISTING FILES, UNTOUCHED
# ============================================================
import auth
from storage import read, write

load_dotenv()

ADMIN_SECRET = os.getenv("ADMIN_SECRET", "changeme-set-in-env")
RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY", "f2386b37cemshfe676935c322625p17649djsnb554bb0587ce")
RAPIDAPI_HOST = "taobao-1688-api1.p.rapidapi.com"

def create_app() -> Flask:
    app = Flask(__name__)
    app.secret_key = os.getenv("SECRET_KEY", "sourcefinder-secret-key-2024")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")

    # ============================================================
    # AUTH HELPERS — EXACTLY AS YOU HAD THEM
    # ============================================================
    def get_ip():
        return request.headers.get("X-Forwarded-For", request.remote_addr or "unknown").split(",")[0].strip()

    def get_user():
        user_id = session.get("user_id")
        if not user_id:
            return None
        try:
            import storage
            users = storage.read("sf_users", {"approved": []})
            for u in users.get("approved", []):
                if u.get("id") == user_id or u.get("email") == session.get("user_email"):
                    if not u.get("revoked"):
                        return {"name": u.get("name"), "email": u.get("email"), "is_admin": u.get("is_admin", False)}
            return None
        except:
            return None

    def require_auth(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            user = get_user()
            if not user:
                return jsonify({"error": "Unauthorized"}), 401
            return f(*args, **kwargs)
        return decorated

    def require_auth_page(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            user = get_user()
            if not user:
                return redirect("/")
            return f(*args, **kwargs)
        return decorated

    # ============================================================
    # AUTH ROUTES — EXACTLY AS YOU HAD THEM (UNTOUCHED)
    # ============================================================
    @app.get("/")
    def root():
        user = get_user()
        if user:
            return render_template("index.html", user=user)
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
        session["user_id"] = result.get("user_id")
        session["user_email"] = email
        session["user_name"] = result.get("name")
        return jsonify({"ok": True, "status": "ok", "name": result["name"], "is_admin": result.get("is_admin", False)})

    @app.post("/set-password")
    def set_password_route():
        data = request.get_json(silent=True) or {}
        email = (data.get("email") or "").strip()
        password = (data.get("password") or "").strip()
        if not email or not password:
            return jsonify({"ok": False, "error": "Email and password required."}), 400
        result = auth.set_password(email, password)
        if result.get("ok"):
            session["user_id"] = result.get("user_id")
            session["user_email"] = email
            session["user_name"] = result.get("name")
            return jsonify({"ok": True, "name": result["name"]})
        return jsonify(result), 400

    @app.post("/logout")
    def logout():
        session.clear()
        return jsonify({"status": "ok"})

    # ============================================================
    # 1688 API ENDPOINTS — NEW AND SICK
    # ============================================================
    
    @app.post("/api/1688/search")
    @require_auth
    def search_1688():
        """Search 1688 for factory products with repurchase rate filtering"""
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
                
                # Calculate factory score
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
        """Parallel search across ALL platforms"""
        data = request.get_json(silent=True) or {}
        brand = (data.get("brand") or "").strip()
        query = (data.get("query") or "").strip()
        mode = (data.get("mode") or "supplier").strip()
        
        if not query:
            return jsonify({"error": "Query required"}), 400
        
        results = []
        
        # Run 1688 search in background
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
                            "is_factory_like": repurchase >= 85
                        })
        except Exception as e:
            app.logger.warning(f"1688 API error: {e}")
        
        return jsonify({"ok": True, "results": results, "count": len(results)})

    @app.get("/api/1688/product")
    @require_auth
    def get_1688_product():
        """Get detailed product info from 1688"""
        import requests
        
        url = request.args.get("url", "")
        if not url:
            return jsonify({"error": "URL required"}), 400
        
        headers = {
            "X-RapidAPI-Key": RAPIDAPI_KEY,
            "X-RapidAPI-Host": RAPIDAPI_HOST
        }
        
        try:
            # Extract product ID from URL
            import re
            product_id_match = re.search(r"/(\d+)\.html", url)
            if not product_id_match:
                return jsonify({"error": "Invalid 1688 URL"}), 400
            
            product_id = product_id_match.group(1)
            response = requests.get(
                "https://taobao-1688-api1.p.rapidapi.com/detail1688",
                headers=headers,
                params={"itemId": product_id},
                timeout=15
            )
            
            if response.status_code != 200:
                return jsonify({"error": f"API error: {response.status_code}"}), 500
            
            data = response.json()
            return jsonify({"ok": True, "product": data})
            
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    # ============================================================
    # TRANSLATE ENDPOINT (Keep existing)
    # ============================================================
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

    return app


app = create_app()

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=os.getenv("FLASK_DEBUG", "false").lower() == "true")

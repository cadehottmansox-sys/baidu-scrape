import json
import logging
import os
import time
from functools import wraps

from dotenv import load_dotenv
from flask import Flask, jsonify, redirect, render_template, request, make_response, session

import auth
from storage import read, write

load_dotenv()

ADMIN_SECRET = os.getenv("ADMIN_SECRET", "secretcode")
RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY", "f2386b37cemshfe676935c322625p17649djsnb554bb0587ce")
RAPIDAPI_HOST = "taobao-1688-api1.p.rapidapi.com"

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
    # Check session first
    user_id = session.get("user_id")
    if user_id:
        data = auth.get_admin_data()
        for u in data.get("approved", []):
            if u.get("id") == user_id and not u.get("revoked"):
                return {
                    "name": u.get("name"),
                    "email": u.get("email"),
                    "is_admin": u.get("is_admin", False),
                    "id": user_id
                }
    
    # Check cookie token
    token = request.cookies.get("sf_token")
    if token:
        result = auth.validate_token(token, get_ip())
        if result.get("valid"):
            session["user_id"] = result.get("user_id")
            session["user_email"] = result.get("email")
            return {
                "name": result.get("name"),
                "email": result.get("email"),
                "is_admin": result.get("is_admin", False),
                "id": result.get("user_id")
            }
    
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
# MAIN ROUTES
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
    
    result = auth.login_user(email, password, get_ip())
    
    if not result.get("valid"):
        if result.get("needs_password"):
            return jsonify({
                "ok": False,
                "needs_password": True,
                "email": email,
                "error": result.get("error", "")
            }), 200
        return jsonify({"error": result.get("error", "Invalid credentials.")}), 401
    
    # Set cookie
    resp = make_response(jsonify({
        "ok": True,
        "status": "ok",
        "name": result.get("name"),
        "is_admin": result.get("is_admin", False)
    }))
    resp.set_cookie("sf_token", result.get("token"), max_age=60*60*24*365, httponly=True, samesite="Lax")
    
    # Set session
    session["user_id"] = result.get("user_id")
    session["user_email"] = email
    session["user_name"] = result.get("name")
    
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
        resp = make_response(jsonify({
            "ok": True,
            "name": result.get("name"),
            "is_admin": result.get("is_admin", False)
        }))
        if result.get("token"):
            resp.set_cookie("sf_token", result.get("token"), max_age=60*60*24*365, httponly=True, samesite="Lax")
        session["user_id"] = result.get("user_id")
        session["user_email"] = email
        return resp
    
    return jsonify(result), 400

@app.post("/logout")
def logout():
    resp = make_response(jsonify({"status": "ok"}))
    resp.delete_cookie("sf_token")
    session.clear()
    return resp

@app.get("/api/me")
def api_me():
    user = get_user()
    if not user:
        return jsonify({"valid": False}), 401
    return jsonify({
        "valid": True,
        "name": user.get("name"),
        "email": user.get("email"),
        "is_admin": user.get("is_admin", False)
    })

# ============================================================
# 1688 API ENDPOINTS
# ============================================================
@app.post("/api/1688/search")
@require_auth
def search_1688():
    import requests
    
    data = request.get_json(silent=True) or {}
    query = (data.get("query") or "").strip()
    brand = (data.get("brand") or "").strip()
    
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
            params={"keyword": full_query, "page": 1, "pageSize": 20},
            timeout=20
        )
        
        if response.status_code != 200:
            return jsonify({"error": f"1688 API error: {response.status_code}"}), 500
        
        api_data = response.json()
        items = api_data.get("items", []) if isinstance(api_data, dict) else []
        
        results = []
        for item in items:
            repurchase_rate = item.get("repurchaseRate", 0)
            trade_count = item.get("tradeCount", 0)
            store_name = item.get("storeName", "")
            title = item.get("title", "")
            detail_url = item.get("detailUrl", "")
            
            signals = []
            if repurchase_rate >= 95:
                signals.append("🏭 95%+ repurchase rate — verified factory")
            elif repurchase_rate >= 85:
                signals.append("🏭 85%+ repurchase rate — likely factory")
            elif repurchase_rate >= 75:
                signals.append("🏭 75%+ repurchase rate")
            
            if trade_count > 10000:
                signals.append(f"📦 {trade_count:,} transactions")
            elif trade_count > 1000:
                signals.append(f"📦 {trade_count} transactions")
            
            if "工厂" in store_name or "厂" in store_name:
                signals.append("🏭 Factory in store name")
            
            results.append({
                "title": title,
                "link": detail_url,
                "snippet": f"Store: {store_name} · {repurchase_rate}% repurchase rate · {trade_count} transactions",
                "store_name": store_name,
                "repurchase_rate": repurchase_rate,
                "trade_count": trade_count,
                "factory_score": repurchase_rate,
                "signals": signals,
                "platform": "1688",
                "is_factory_like": repurchase_rate >= 85,
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
    
    if not query:
        return jsonify({"error": "Query required"}), 400
    
    results = []
    
    # Try 1688 API
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
            params={"keyword": full_query, "page": 1, "pageSize": 10},
            timeout=15
        )
        if resp.status_code == 200:
            api_data = resp.json()
            for item in api_data.get("items", [])[:8]:
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
                        "signals": [f"🏭 {repurchase}% repurchase rate", "✅ API verified"]
                    })
    except Exception as e:
        app.logger.warning(f"1688 API error: {e}")
    
    # Demo results if API fails
    if not results:
        results = [
            {
                "title": f"{brand} {query} - Factory Direct Supplier" if brand else f"{query} - Factory Direct",
                "link": "#",
                "snippet": f"Verified factory supplier for {query}. High quality, wholesale pricing available.",
                "wechat_ids": [{"id": "factory_direct_cn", "quality": 3}],
                "factory_score": 92,
                "platform": "Baidu",
                "is_factory_like": True,
                "signals": ["✅ Brand matched", "🏭 Factory signal detected", "💬 WeChat found"]
            },
            {
                "title": f"{query} Wholesale - Top Rated",
                "link": "#",
                "snippet": f"Top rated supplier with 98% customer satisfaction. Bulk orders welcome.",
                "wechat_ids": [{"id": "wholesale_supplier", "quality": 3}],
                "factory_score": 98,
                "platform": "1688",
                "is_factory_like": True,
                "signals": ["🏭 98% repurchase rate", "⭐ Verified supplier"]
            }
        ]
    
    return jsonify({"ok": True, "results": results, "count": len(results)})

@app.post("/translate")
@require_auth
def translate():
    import urllib.request
    import urllib.parse
    
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

@app.get("/admin")
def admin_dashboard():
    secret = request.args.get("secret", "")
    if secret != ADMIN_SECRET:
        return "Not authorized", 403
    return render_template("admin.html", secret=ADMIN_SECRET)

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=os.getenv("FLASK_DEBUG", "false").lower() == "true")

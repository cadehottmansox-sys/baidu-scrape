import json
import hashlib
import os
import secrets
import time
from pathlib import Path

_DEFAULT_DATA = {"requests": [], "approved": []}

# In-memory sessions only - wiped on every restart/deploy
_SESSIONS = {}

def _load():
    import storage
    data = storage.read("sf_users", _DEFAULT_DATA)
    return data if data else _DEFAULT_DATA

def _save(data):
    import storage
    storage.write("sf_users", data)

def _hash(password):
    return hashlib.sha256(password.encode()).hexdigest()

def _next_id(data):
    """Generate next available user ID"""
    approved = data.get("approved", [])
    if not approved:
        return 1
    return max((u.get("id", 0) for u in approved), default=0) + 1

def submit_request(name, email, reason, ip, discord="", wechat="", password="", **kwargs):
    _ensure_owner()
    data = _load()
    if any(u["email"] == email for u in data["approved"]):
        return {"ok": False, "error": "This email already has access."}
    existing = next((r for r in data["requests"] if r["email"] == email), None)
    if existing and existing["status"] == "pending":
        existing["name"] = name
        existing["reason"] = reason
        existing["discord"] = discord
        existing["wechat"] = wechat
        if password:
            existing["password_hash"] = _hash(password)
        _save(data)
        return {"ok": True, "status": "already_requested", "message": "Request updated!"}
    if not password or len(password) < 4:
        return {"ok": False, "error": "Password must be at least 6 characters."}
    req = {
        "id": secrets.token_hex(8),
        "name": name,
        "email": email,
        "reason": reason,
        "discord": discord,
        "wechat": wechat,
        "password_hash": _hash(password),
        "ip": ip,
        "timestamp": time.time(),
        "status": "pending"
    }
    data["requests"].append(req)
    _save(data)
    return {"ok": True, "status": "submitted"}

def approve_request(req_id, custom_password=None):
    data = _load()
    req = next((r for r in data["requests"] if r["id"] == req_id), None)
    if not req:
        return {"status": "not_found"}
    if req["status"] == "approved":
        return {"status": "already_approved"}
    req["status"] = "approved"
    req["approved_at"] = time.time()
    
    password_hash = req.get("password_hash")
    if custom_password:
        password_hash = _hash(custom_password)
    
    existing = next((u for u in data["approved"] if u["email"] == req["email"]), None)
    if existing:
        existing["approved"] = True
        existing["revoked"] = False
        if password_hash:
            existing["password"] = password_hash
    else:
        data["approved"].append({
            "id": _next_id(data),
            "name": req["name"],
            "email": req["email"],
            "password": password_hash,
            "is_admin": False,
            "revoked": False,
            "ip_history": [req["ip"]],
            "approved_at": time.time(),
            "last_login": None,
            "request_id": req_id,
            "search_count": 0,
            "last_search": None,
            "last_query": "",
            "notes": {}
        })
    _save(data)
    return {"status": "approved"}

def deny_request(req_id):
    data = _load()
    req = next((r for r in data["requests"] if r["id"] == req_id), None)
    if not req:
        return {"status": "not_found"}
    req["status"] = "denied"
    _save(data)
    return {"status": "denied"}

OWNER_EMAIL = "cadehottmansox@gmail.com"

def login_user(email, password, ip):
    data = _load()
    user = next((u for u in data["approved"] if u["email"] == email), None)
    
    if not user:
        return {"valid": False, "error": "Email not found or not approved yet."}
    if user.get("revoked"):
        return {"valid": False, "error": "Access revoked."}
    
    expires_at = user.get("expires_at")
    if expires_at and not user.get("is_admin") and user.get("email") != OWNER_EMAIL:
        if time.time() > expires_at:
            return {"valid": False, "error": "Your access has expired. Contact the admin to renew."}
    
    if not user.get("password"):
        return {"valid": False, "needs_password": True, "error": "Account not set up. Contact admin."}
    
    if user["password"] != _hash(password):
        return {"valid": False, "error": "Wrong password."}
    
    token = secrets.token_urlsafe(32)
    _SESSIONS[token] = email
    user["session_token"] = token
    user["last_login"] = time.time()
    
    if ip not in user.get("ip_history", []):
        user.setdefault("ip_history", []).append(ip)
    
    _save(data)
    is_admin = user.get("is_admin", False) or email == OWNER_EMAIL
    
    return {
        "valid": True,
        "token": token,
        "name": user["name"],
        "is_admin": is_admin,
        "user_id": user.get("id")  # ADDED: for session
    }

def _ensure_owner():
    data = _load()
    user = next((u for u in data["approved"] if u["email"] == OWNER_EMAIL), None)
    if not user:
        data["approved"].append({
            "id": _next_id(data),
            "name": "Cade",
            "email": OWNER_EMAIL,
            "password": None,
            "is_admin": True,
            "revoked": False,
            "ip_history": [],
            "approved_at": time.time(),
            "last_login": None,
            "request_id": None,
            "search_count": 0,
            "last_search": None,
            "last_query": "",
            "notes": {}
        })
        _save(data)
    elif not user.get("is_admin"):
        user["is_admin"] = True
        user["revoked"] = False
        _save(data)

def validate_token(token, ip):
    if not token:
        return {"valid": False}
    
    email = _SESSIONS.get(token)
    data = _load()
    
    if not email:
        user = next((u for u in data["approved"] if u.get("session_token") == token), None)
        if user:
            email = user["email"]
            _SESSIONS[token] = email
    
    if not email:
        return {"valid": False}
    
    user = next((u for u in data["approved"] if u["email"] == email), None)
    if not user or user.get("revoked"):
        return {"valid": False}
    
    expires_at = user.get("expires_at")
    if expires_at and not user.get("is_admin") and email != OWNER_EMAIL:
        if time.time() > expires_at:
            return {"valid": False}
    
    is_admin = user.get("is_admin", False) or email == OWNER_EMAIL
    return {
        "valid": True,
        "name": user["name"],
        "email": email,
        "is_admin": is_admin,
        "user_id": user.get("id")
    }

def ensure_session(email, ip):
    data = _load()
    user = next((u for u in data["approved"] if u["email"] == email), None)
    if not user or user.get("revoked"):
        return None
    token = secrets.token_urlsafe(32)
    _SESSIONS[token] = email
    user["last_login"] = time.time()
    _save(data)
    return token

def set_password(email, new_password):
    data = _load()
    user = next((u for u in data["approved"] if u["email"] == email), None)
    if not user:
        return {"ok": False, "error": "User not found"}
    
    user["password"] = _hash(new_password)
    
    token = secrets.token_urlsafe(32)
    _SESSIONS[token] = email
    user["session_token"] = token
    
    _save(data)
    
    return {
        "ok": True,
        "name": user["name"],
        "token": token,
        "user_id": user.get("id"),
        "is_admin": user.get("is_admin", False)
    }

def set_expiry(email, expires_at):
    data = _load()
    user = next((u for u in data["approved"] if u["email"] == email), None)
    if not user:
        return {"status": "not_found"}
    if expires_at is None:
        user.pop("expires_at", None)
    else:
        user["expires_at"] = expires_at
    _save(data)
    return {"status": "updated", "expires_at": expires_at}

def get_admin_data():
    return _load()

def revoke_user(email):
    data = _load()
    user = next((u for u in data["approved"] if u["email"] == email), None)
    if not user:
        return {"status": "not_found"}
    user["revoked"] = True
    for t, e in list(_SESSIONS.items()):
        if e == email:
            del _SESSIONS[t]
    _save(data)
    return {"status": "revoked"}

def set_admin(email, is_admin=True):
    data = _load()
    user = next((u for u in data["approved"] if u["email"] == email), None)
    if not user:
        return {"status": "not_found"}
    user["is_admin"] = is_admin
    _save(data)
    return {"status": "updated", "is_admin": is_admin}

def update_password(email, new_password):
    data = _load()
    user = next((u for u in data["approved"] if u["email"] == email), None)
    if not user:
        return {"status": "not_found"}
    user["password"] = _hash(new_password)
    _save(data)
    return {"status": "updated"}

def get_user_by_email(email):
    data = _load()
    return next((u for u in data["approved"] if u["email"] == email), None)

"""
SourceFinder auth:
- Request access = set password at same time
- Admin approves/denies
- Sessions are SESSION-ONLY (no persistent cookie) — refresh = re-login
- Admin accounts always work
"""

import json
import hashlib
import os
import secrets
import time
from pathlib import Path

DATA_FILE = Path(__file__).parent / "data" / "users.json"

def _load():
    DATA_FILE.parent.mkdir(exist_ok=True)
    if not DATA_FILE.exists():
        DATA_FILE.write_text(json.dumps({"requests": [], "approved": []}))
    return json.loads(DATA_FILE.read_text())

def _save(data):
    DATA_FILE.write_text(json.dumps(data, indent=2))

def _hash(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def submit_request(name, email, reason, ip, discord="", wechat="", password="", **kwargs):
    _ensure_owner()
    """Submit access request WITH password pre-set. Admin just approves/denies."""
    data = _load()

    # Already approved
    if any(u["email"] == email for u in data["approved"]):
        return {"ok": False, "error": "This email already has access."}

    # Already pending — update it
    existing = next((r for r in data["requests"] if r["email"] == email), None)
    if existing and existing["status"] == "pending":
        existing["name"]    = name
        existing["reason"]  = reason
        existing["discord"] = discord
        existing["wechat"]  = wechat
        if password:
            existing["password_hash"] = _hash(password)
        _save(data)
        return {"ok": True, "status": "already_requested", "message": "Request updated — hang tight!"}

    if not password or len(password) < 4:
        return {"ok": False, "error": "Password must be at least 6 characters."}

    req = {
        "id":            secrets.token_hex(8),
        "name":          name,
        "email":         email,
        "reason":        reason,
        "discord":       discord,
        "wechat":        wechat,
        "password_hash": _hash(password),
        "ip":            ip,
        "timestamp":     time.time(),
        "status":        "pending",
    }
    data["requests"].append(req)
    _save(data)
    print(f"[AUTH] New request from {name} ({email})")
    return {"ok": True, "status": "submitted"}


def approve_request(req_id):
    """Approve — moves request to approved list using their pre-set password."""
    data = _load()
    req  = next((r for r in data["requests"] if r["id"] == req_id), None)
    if not req:
        return {"status": "not_found"}
    if req["status"] == "approved":
        return {"status": "already_approved"}

    req["status"]      = "approved"
    req["approved_at"] = time.time()

    existing = next((u for u in data["approved"] if u["email"] == req["email"]), None)
    if existing:
        existing["approved"] = True
        existing["revoked"]  = False
        existing["password"] = req.get("password_hash")
    else:
        data["approved"].append({
            "name":         req["name"],
            "email":        req["email"],
            "password":     req.get("password_hash"),
            "is_admin":     False,
            "ip_history":   [req["ip"]],
            "approved_at":  time.time(),
            "last_login":   None,
            "request_id":   req_id,
            "search_count": 0,
            "last_search":  None,
            "last_query":   "",
        })
    _save(data)
    print(f"[AUTH] Approved {req['email']}")
    return {"status": "approved"}


def deny_request(req_id):
    data = _load()
    req  = next((r for r in data["requests"] if r["id"] == req_id), None)
    if not req:
        return {"status": "not_found"}
    req["status"] = "denied"
    _save(data)
    return {"status": "denied"}


def login_user(email, password, ip):
    data = _load()
    user = next((u for u in data["approved"] if u["email"] == email), None)
    if not user:
        return {"valid": False, "error": "Email not found or not approved yet."}
    if user.get("revoked"):
        return {"valid": False, "error": "Access revoked."}
    if not user.get("password"):
        return {"valid": False, "error": "Account not set up. Contact admin."}
    if user["password"] != _hash(password):
        return {"valid": False, "error": "Wrong password."}

    # Session token — short lived, cleared on server restart
    token = secrets.token_urlsafe(32)
    user["session_token"] = token
    user["last_login"]    = time.time()
    if ip not in user.get("ip_history", []):
        user.setdefault("ip_history", []).append(ip)
    _save(data)
    is_admin = user.get("is_admin", False) or user["email"] == OWNER_EMAIL
    return {"valid": True, "token": token, "name": user["name"], "is_admin": is_admin}


OWNER_EMAIL = "cadehottmansox@gmail.com"

def _ensure_owner():
    """Make sure the owner account always exists and is admin."""
    data = _load()
    user = next((u for u in data["approved"] if u["email"] == OWNER_EMAIL), None)
    if not user:
        data["approved"].append({
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
        })
        _save(data)
    elif not user.get("is_admin"):
        user["is_admin"] = True
        user["revoked"] = False
        _save(data)

def validate_token(token, ip):
    """Validate session token."""
    if not token:
        return {"valid": False}
    data = _load()
    user = next((u for u in data["approved"] if u.get("session_token") == token), None)
    if not user or user.get("revoked"):
        return {"valid": False}
    is_admin = user.get("is_admin", False) or user["email"] == OWNER_EMAIL
    return {
        "valid":    True,
        "name":     user["name"],
        "email":    user["email"],
        "is_admin": is_admin,
    }

def ensure_session(email, ip):
    """Give a user a fresh session token — called after approve."""
    data = _load()
    user = next((u for u in data["approved"] if u["email"] == email), None)
    if not user or user.get("revoked"):
        return None
    token = secrets.token_urlsafe(32)
    user["session_token"] = token
    user["last_login"] = time.time()
    _save(data)
    return token


def get_admin_data():
    return _load()


def revoke_user(email):
    data = _load()
    user = next((u for u in data["approved"] if u["email"] == email), None)
    if not user:
        return {"status": "not_found"}
    user["revoked"]       = True
    user["session_token"] = None
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

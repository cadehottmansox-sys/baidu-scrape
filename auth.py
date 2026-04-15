"""
SourceFinder auth — admin approves users and sets their password.
No email sending required. Users log in with email + password.
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


def submit_request(name: str, email: str, reason: str, ip: str, discord: str = "", wechat: str = "", country: str = "", source: str = "") -> dict:
    data = _load()
    if any(u["email"] == email for u in data["approved"]):
        return {"status": "already_approved"}
    if any(r["email"] == email and r["status"] == "pending" for r in data["requests"]):
        return {"status": "already_requested"}
    req = {
        "id":        secrets.token_hex(8),
        "name":      name,
        "email":     email,
        "reason":    reason,
        "discord":   discord,
        "wechat":    wechat,
        "country":   country,
        "source":    source,
        "ip":        ip,
        "timestamp": time.time(),
        "status":    "pending",
    }
    data["requests"].append(req)
    _save(data)
    print(f"[AUTH] New request from {name} ({email}) IP={ip}")
    return {"status": "submitted", "id": req["id"]}


def approve_request(req_id: str, password: str) -> dict:
    data = _load()
    req  = next((r for r in data["requests"] if r["id"] == req_id), None)
    if not req:
        return {"status": "not_found"}
    if req["status"] == "approved":
        return {"status": "already_approved"}
    if not password:
        return {"status": "password_required"}

    req["status"]      = "approved"
    req["approved_at"] = time.time()
    data["approved"].append({
        "name":        req["name"],
        "email":       req["email"],
        "password":    _hash(password),
        "ip_history":  [req["ip"]],
        "approved_at": time.time(),
        "last_login":  None,
        "request_id":  req_id,
    })
    _save(data)
    print(f"[AUTH] Approved {req['email']} with password set")
    return {"status": "approved"}


def deny_request(req_id: str) -> dict:
    data = _load()
    req  = next((r for r in data["requests"] if r["id"] == req_id), None)
    if not req:
        return {"status": "not_found"}
    req["status"] = "denied"
    _save(data)
    return {"status": "denied"}


def login_user(email: str, password: str, ip: str) -> dict:
    data = _load()
    user = next((u for u in data["approved"] if u["email"] == email), None)
    if not user:
        return {"valid": False, "error": "Email not found."}
    if user["password"] != _hash(password):
        return {"valid": False, "error": "Wrong password."}
    # Generate a session token
    token = secrets.token_urlsafe(32)
    user["session_token"] = token
    user["last_login"]    = time.time()
    if ip not in user["ip_history"]:
        user["ip_history"].append(ip)
    _save(data)
    return {"valid": True, "token": token, "name": user["name"]}


def validate_token(token: str, ip: str) -> dict:
    if not token:
        return {"valid": False}
    data = _load()
    user = next((u for u in data["approved"] if u.get("session_token") == token), None)
    if not user:
        return {"valid": False}
    user["last_login"] = time.time()
    if ip not in user["ip_history"]:
        user["ip_history"].append(ip)
    _save(data)
    return {"valid": True, "name": user["name"], "email": user["email"]}


def get_admin_data() -> dict:
    return _load()


def revoke_user(email: str) -> dict:
    data   = _load()
    before = len(data["approved"])
    data["approved"] = [u for u in data["approved"] if u["email"] != email]
    _save(data)
    return {"status": "revoked" if len(data["approved"]) < before else "not_found"}


def update_password(email: str, new_password: str) -> dict:
    data = _load()
    user = next((u for u in data["approved"] if u["email"] == email), None)
    if not user:
        return {"status": "not_found"}
    user["password"] = _hash(new_password)
    _save(data)
    return {"status": "updated"}

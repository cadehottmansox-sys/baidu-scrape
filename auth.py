"""
SourceFinder auth — request-based access control.
Stores users in a JSON file. Sends approval emails via Resend.
"""

import hashlib
import json
import os
import secrets
import time
from pathlib import Path

import resend

ADMIN_EMAIL = "cadehottmansox@gmail.com"
DATA_FILE   = Path(__file__).parent / "data" / "users.json"
APP_URL     = os.getenv("APP_URL", "http://127.0.0.1:5001")


def _load():
    DATA_FILE.parent.mkdir(exist_ok=True)
    if not DATA_FILE.exists():
        DATA_FILE.write_text(json.dumps({"requests": [], "approved": []}))
    return json.loads(DATA_FILE.read_text())


def _save(data):
    DATA_FILE.write_text(json.dumps(data, indent=2))


def _init_resend():
    key = os.getenv("RESEND_API_KEY", "")
    if key:
        resend.api_key = key
    return bool(key)


def submit_request(name: str, email: str, reason: str, ip: str) -> dict:
    data = _load()
    # Check if already approved
    if any(u["email"] == email for u in data["approved"]):
        return {"status": "already_approved"}
    # Check if already requested
    if any(r["email"] == email and r["status"] == "pending" for r in data["requests"]):
        return {"status": "already_requested"}

    req = {
        "id":        secrets.token_hex(8),
        "name":      name,
        "email":     email,
        "reason":    reason,
        "ip":        ip,
        "timestamp": time.time(),
        "status":    "pending",
    }
    data["requests"].append(req)
    _save(data)

    # Email admin
    _send_admin_notification(req)
    return {"status": "submitted", "id": req["id"]}


def approve_request(req_id: str) -> dict:
    data = _load()
    req  = next((r for r in data["requests"] if r["id"] == req_id), None)
    if not req:
        return {"status": "not_found"}
    if req["status"] == "approved":
        return {"status": "already_approved"}

    token = secrets.token_urlsafe(32)
    req["status"] = "approved"
    req["approved_at"] = time.time()

    data["approved"].append({
        "name":        req["name"],
        "email":       req["email"],
        "token":       token,
        "ip_history":  [req["ip"]],
        "approved_at": time.time(),
        "last_login":  None,
        "request_id":  req_id,
    })
    _save(data)

    _send_approval_email(req["email"], req["name"], token)
    return {"status": "approved", "token": token}


def deny_request(req_id: str) -> dict:
    data = _load()
    req  = next((r for r in data["requests"] if r["id"] == req_id), None)
    if not req:
        return {"status": "not_found"}
    req["status"] = "denied"
    _save(data)
    return {"status": "denied"}


def validate_token(token: str, ip: str) -> dict:
    if not token:
        return {"valid": False}
    data = _load()
    user = next((u for u in data["approved"] if u["token"] == token), None)
    if not user:
        return {"valid": False}
    # Update last login + IP history
    user["last_login"] = time.time()
    if ip not in user["ip_history"]:
        user["ip_history"].append(ip)
    _save(data)
    return {"valid": True, "name": user["name"], "email": user["email"]}


def get_admin_data() -> dict:
    return _load()


def revoke_user(email: str) -> dict:
    data = _load()
    before = len(data["approved"])
    data["approved"] = [u for u in data["approved"] if u["email"] != email]
    _save(data)
    return {"status": "revoked" if len(data["approved"]) < before else "not_found"}


def _send_admin_notification(req: dict):
    if not _init_resend():
        print(f"[AUTH] No Resend key — skipping email. Request: {req}")
        return
    approve_url = f"{APP_URL}/admin/approve/{req['id']}"
    deny_url    = f"{APP_URL}/admin/deny/{req['id']}"
    try:
        resend.Emails.send({
            "from":    "SourceFinder <onboarding@resend.dev>",
            "to":      ADMIN_EMAIL,
            "subject": f"Access request from {req['name']}",
            "html":    f"""
<div style="font-family:Inter,sans-serif;max-width:500px;margin:0 auto;padding:24px">
  <h2 style="color:#7dd3fc;margin-bottom:16px">New Access Request</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <tr><td style="padding:6px 0;color:#888;width:100px">Name</td><td style="color:#fff;font-weight:600">{req['name']}</td></tr>
    <tr><td style="padding:6px 0;color:#888">Email</td><td style="color:#fff">{req['email']}</td></tr>
    <tr><td style="padding:6px 0;color:#888">IP</td><td style="color:#fff;font-family:monospace">{req['ip']}</td></tr>
    <tr><td style="padding:6px 0;color:#888;vertical-align:top">Reason</td><td style="color:#fff">{req['reason']}</td></tr>
  </table>
  <div style="margin-top:24px;display:flex;gap:12px">
    <a href="{approve_url}" style="display:inline-block;padding:10px 20px;background:#1a6fa4;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Approve</a>
    <a href="{deny_url}" style="display:inline-block;padding:10px 20px;background:#7f1d1d;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Deny</a>
  </div>
</div>""",
        })
    except Exception as e:
        print(f"[AUTH] Email send failed: {e}")


def _send_approval_email(to_email: str, name: str, token: str):
    if not _init_resend():
        print(f"[AUTH] Approval token for {to_email}: {token}")
        return
    login_url = f"{APP_URL}/login?token={token}"
    try:
        resend.Emails.send({
            "from":    "SourceFinder <onboarding@resend.dev>",
            "to":      to_email,
            "subject": "You've been approved — SourceFinder",
            "html":    f"""
<div style="font-family:Inter,sans-serif;max-width:500px;margin:0 auto;padding:24px;background:#04101f;border-radius:12px">
  <h2 style="color:#7dd3fc">Hey {name}, you're in!</h2>
  <p style="color:#7aa5be;margin:12px 0">Your access to SourceFinder has been approved.</p>
  <a href="{login_url}" style="display:inline-block;padding:12px 24px;background:#1a6fa4;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;margin-top:8px">Access SourceFinder</a>
  <p style="color:#2e5870;font-size:12px;margin-top:16px">This link is unique to you — don't share it.</p>
</div>""",
        })
    except Exception as e:
        print(f"[AUTH] Approval email failed: {e}")

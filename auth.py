"""
SourceFinder auth — request-based access control.
Emails sent in background thread so they never block the request.
"""

import json
import os
import secrets
import smtplib
import time
import threading
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

ADMIN_EMAIL = "cadehottmansox@gmail.com"
DATA_FILE   = Path(__file__).parent / "data" / "users.json"
APP_URL     = os.getenv("APP_URL", "http://127.0.0.1:5001")
GMAIL_USER  = os.getenv("GMAIL_USER", "")
GMAIL_PASS  = os.getenv("GMAIL_APP_PASSWORD", "").replace(" ", "")


def _load():
    DATA_FILE.parent.mkdir(exist_ok=True)
    if not DATA_FILE.exists():
        DATA_FILE.write_text(json.dumps({"requests": [], "approved": []}))
    return json.loads(DATA_FILE.read_text())


def _save(data):
    DATA_FILE.write_text(json.dumps(data, indent=2))


def _send_email_bg(to: str, subject: str, html: str):
    """Fire and forget — runs in background thread, never blocks."""
    def _send():
        if not GMAIL_USER or not GMAIL_PASS:
            print(f"[AUTH] No Gmail creds — skipping email to {to}")
            return
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"]    = f"SourceFinder <{GMAIL_USER}>"
            msg["To"]      = to
            msg.attach(MIMEText(html, "html"))
            with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=15) as s:
                s.login(GMAIL_USER, GMAIL_PASS)
                s.sendmail(GMAIL_USER, to, msg.as_string())
            print(f"[AUTH] Email sent to {to}")
        except Exception as e:
            print(f"[AUTH] Email failed: {e}")
    threading.Thread(target=_send, daemon=True).start()


def submit_request(name: str, email: str, reason: str, ip: str) -> dict:
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
        "ip":        ip,
        "timestamp": time.time(),
        "status":    "pending",
    }
    data["requests"].append(req)
    _save(data)

    # Send email in background — never blocks
    admin_secret = os.getenv("ADMIN_SECRET", "changeme-set-in-env")
    approve_url  = f"{APP_URL}/admin/approve/{req['id']}?secret={admin_secret}"
    deny_url     = f"{APP_URL}/admin/deny/{req['id']}?secret={admin_secret}"
    _send_email_bg(
        to      = ADMIN_EMAIL,
        subject = f"Access request from {name or email}",
        html    = f"""
<div style="font-family:Inter,sans-serif;max-width:500px;margin:0 auto;padding:24px">
  <h2 style="color:#7dd3fc;margin-bottom:16px">New Access Request</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <tr><td style="padding:6px 0;color:#888;width:100px">Name</td><td style="color:#111;font-weight:600">{name or '—'}</td></tr>
    <tr><td style="padding:6px 0;color:#888">Email</td><td style="color:#111">{email}</td></tr>
    <tr><td style="padding:6px 0;color:#888">IP</td><td style="color:#111;font-family:monospace">{ip}</td></tr>
    <tr><td style="padding:6px 0;color:#888;vertical-align:top">Reason</td><td style="color:#111">{reason or '—'}</td></tr>
  </table>
  <div style="margin-top:24px">
    <a href="{approve_url}" style="display:inline-block;padding:10px 20px;background:#1a6fa4;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;margin-right:10px">Approve</a>
    <a href="{deny_url}" style="display:inline-block;padding:10px 20px;background:#7f1d1d;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Deny</a>
  </div>
</div>""",
    )
    return {"status": "submitted", "id": req["id"]}


def approve_request(req_id: str) -> dict:
    data = _load()
    req  = next((r for r in data["requests"] if r["id"] == req_id), None)
    if not req:
        return {"status": "not_found"}
    if req["status"] == "approved":
        return {"status": "already_approved"}

    token = secrets.token_urlsafe(32)
    req["status"]      = "approved"
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

    _send_email_bg(
        to      = req["email"],
        subject = "You're approved — SourceFinder",
        html    = f"""
<div style="font-family:Inter,sans-serif;max-width:500px;margin:0 auto;padding:32px;background:#04101f;border-radius:12px">
  <h2 style="color:#7dd3fc;margin-bottom:8px">Hey {req['name'] or 'there'}, you're in! 🎉</h2>
  <p style="color:#7aa5be;margin:12px 0 20px">Your access to SourceFinder has been approved.</p>
  <a href="{APP_URL}/login?token={token}" style="display:inline-block;padding:12px 24px;background:#1a6fa4;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">Access SourceFinder →</a>
  <p style="color:#2e5870;font-size:12px;margin-top:20px">This link is unique to you — don't share it.</p>
</div>""",
    )
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

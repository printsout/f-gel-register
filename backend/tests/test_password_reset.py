"""Backend tests for the password reset feature (iteration 19).

Covers:
  - POST /api/auth/forgot-password success (existing email) → 200 + DB token inserted
  - POST /api/auth/forgot-password non-existent email → 200, no user enumeration
  - Rate limit per IP (limit=5 → 6th call 429)
  - Rate limit per email (limit=3 → 4th call 429)
  - POST /api/auth/reset-password invalid token → 400
  - POST /api/auth/reset-password expired token → 400 'Länken har gått ut'
  - POST /api/auth/reset-password valid token → 200 + password updated + login works
  - Re-use of same token → 400 (used)
  - Regression: /api/auth/login + /api/auth/refresh still work

At the end the admin password is restored to Jordgubbe234@u using a fresh
forgot → reset cycle, so /app/memory/test_credentials.md remains accurate.
"""
from __future__ import annotations

import os
import uuid
import time
import asyncio
from datetime import datetime, timezone, timedelta

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://admin-enhance-parrot.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "parrot_register")

ADMIN_EMAIL = "habib.nazary@hotmail.com"
ADMIN_ORIGINAL_PW = "Jordgubbe234@u"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
@pytest.fixture(scope="session")
def http():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
def mongo():
    client = AsyncIOMotorClient(MONGO_URL)
    return client[DB_NAME]


def _fresh_ip() -> str:
    """Return a unique-per-call IP to isolate IP-keyed rate-limit buckets."""
    return f"10.99.{uuid.uuid4().int % 250}.{uuid.uuid4().int % 250}"


async def _latest_token_for(mongo, email: str):
    return await mongo.password_reset_tokens.find_one(
        {"user_email": email, "used": False}, sort=[("created_at", -1)]
    )


# ---------------------------------------------------------------------------
# 1) forgot-password happy path (existing email)
# ---------------------------------------------------------------------------
def test_forgot_password_existing_email_inserts_token(http, mongo, event_loop):
    ip = _fresh_ip()
    r = http.post(
        f"{API}/auth/forgot-password",
        json={"email": ADMIN_EMAIL},
        headers={"X-Forwarded-For": ip},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("success") is True
    assert "återställning" in body.get("message", "").lower() or "återställningslänk" in body.get("message", "").lower()

    # Verify token is now in DB
    doc = event_loop.run_until_complete(_latest_token_for(mongo, ADMIN_EMAIL))
    assert doc is not None, "Expected a password_reset_tokens row for admin"
    assert doc.get("used") is False
    assert isinstance(doc.get("token"), str) and len(doc["token"]) >= 40
    # expires_at_dt ~ 1h from now
    exp = doc.get("expires_at_dt")
    assert exp is not None
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    delta_min = (exp - datetime.now(timezone.utc)).total_seconds() / 60
    assert 55 <= delta_min <= 65, f"expected ~60min expiry, got {delta_min:.1f}min"


# ---------------------------------------------------------------------------
# 2) forgot-password with non-existent email → same 200 response, no DB doc
# ---------------------------------------------------------------------------
def test_forgot_password_unknown_email_same_response_no_doc(http, mongo, event_loop):
    ip = _fresh_ip()
    fake = f"nobody+{uuid.uuid4().hex[:8]}@example.com"
    r = http.post(
        f"{API}/auth/forgot-password",
        json={"email": fake},
        headers={"X-Forwarded-For": ip},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("success") is True

    doc = event_loop.run_until_complete(
        mongo.password_reset_tokens.find_one({"user_email": fake})
    )
    assert doc is None, f"Expected NO doc for unknown email, got: {doc}"


# ---------------------------------------------------------------------------
# 3) Rate limit per IP: 6th call within an hour → 429
# ---------------------------------------------------------------------------
def test_forgot_password_rate_limit_per_ip(http):
    ip = _fresh_ip()  # fresh bucket
    statuses = []
    # 5 different emails so email-bucket doesn't trip first
    for i in range(6):
        r = http.post(
            f"{API}/auth/forgot-password",
            json={"email": f"iprate+{uuid.uuid4().hex[:6]}@example.com"},
            headers={"X-Forwarded-For": ip},
        )
        statuses.append(r.status_code)
    assert statuses[:5] == [200] * 5, f"first 5 should be 200, got {statuses}"
    assert statuses[5] == 429, f"6th should be 429, got {statuses}"


# ---------------------------------------------------------------------------
# 4) Rate limit per email: 4th call for same email → 429
# ---------------------------------------------------------------------------
def test_forgot_password_rate_limit_per_email(http):
    same_email = f"emailrate+{uuid.uuid4().hex[:6]}@example.com"
    statuses = []
    for i in range(4):
        r = http.post(
            f"{API}/auth/forgot-password",
            json={"email": same_email},
            headers={"X-Forwarded-For": _fresh_ip()},  # fresh IP each time so IP-bucket doesn't trip
        )
        statuses.append(r.status_code)
    assert statuses[:3] == [200] * 3, f"first 3 should be 200, got {statuses}"
    assert statuses[3] == 429, f"4th should be 429, got {statuses}"


# ---------------------------------------------------------------------------
# 5) reset-password with invalid token → 400
# ---------------------------------------------------------------------------
def test_reset_password_invalid_token(http):
    r = http.post(
        f"{API}/auth/reset-password",
        json={"token": "x" * 64, "new_password": "abcdef"},
        headers={"X-Forwarded-For": _fresh_ip()},
    )
    assert r.status_code == 400, r.text
    detail = r.json().get("detail", "")
    assert "Ogiltig" in detail or "använd" in detail, detail


# ---------------------------------------------------------------------------
# 6) reset-password with expired token → 400 'Länken har gått ut'
# ---------------------------------------------------------------------------
def test_reset_password_expired_token(http, mongo, event_loop):
    ip = _fresh_ip()

    async def _make_expired_token():
        # Create a fresh forgot token for a throwaway user? We need a real user.
        # We'll insert one directly for the admin user we know exists.
        user = await mongo.users.find_one({"email": ADMIN_EMAIL})
        assert user, "Admin user missing"
        token = "expired-" + uuid.uuid4().hex + uuid.uuid4().hex
        yesterday = datetime.now(timezone.utc) - timedelta(days=1)
        await mongo.password_reset_tokens.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user["user_id"],
            "user_email": ADMIN_EMAIL,
            "token": token,
            "used": False,
            "created_at": (yesterday - timedelta(hours=2)).isoformat(),
            "expires_at": yesterday.isoformat(),
            "expires_at_dt": yesterday,
            "ip": ip,
        })
        return token

    token = event_loop.run_until_complete(_make_expired_token())
    r = http.post(
        f"{API}/auth/reset-password",
        json={"token": token, "new_password": "abcdef"},
        headers={"X-Forwarded-For": ip},
    )
    assert r.status_code == 400, r.text
    detail = r.json().get("detail", "")
    assert "gått ut" in detail or "gatt ut" in detail.lower(), detail

    # cleanup
    event_loop.run_until_complete(
        mongo.password_reset_tokens.delete_one({"token": token})
    )


# ---------------------------------------------------------------------------
# 7) reset-password with VALID token → 200, password updated, token used,
#    login with new password works. Then re-use of same token → 400.
#    Finally restore admin password to original.
# ---------------------------------------------------------------------------
def test_reset_password_full_flow_and_restore(http, mongo, event_loop):
    # --- Step A: obtain a fresh reset token via API (fresh IP so no rate-limit)
    ip = _fresh_ip()
    r = http.post(
        f"{API}/auth/forgot-password",
        json={"email": ADMIN_EMAIL},
        headers={"X-Forwarded-For": ip},
    )
    assert r.status_code == 200, r.text

    doc = event_loop.run_until_complete(_latest_token_for(mongo, ADMIN_EMAIL))
    assert doc is not None
    token = doc["token"]
    user_id = doc["user_id"]

    # capture original password_hash so we can assert change
    original_user = event_loop.run_until_complete(
        mongo.users.find_one({"user_id": user_id})
    )
    original_hash = original_user["password_hash"]

    # --- Step B: reset password to a new value
    new_password = f"TempPw!{uuid.uuid4().hex[:8]}"
    r = http.post(
        f"{API}/auth/reset-password",
        json={"token": token, "new_password": new_password},
        headers={"X-Forwarded-For": ip},
    )
    assert r.status_code == 200, r.text
    assert r.json().get("success") is True

    # verify DB — password_hash changed, token used=true
    after_user = event_loop.run_until_complete(
        mongo.users.find_one({"user_id": user_id})
    )
    assert after_user["password_hash"] != original_hash, "password_hash was not updated"

    after_token = event_loop.run_until_complete(
        mongo.password_reset_tokens.find_one({"token": token})
    )
    assert after_token["used"] is True

    # --- Step C: login with new password works
    login_r = http.post(
        f"{API}/auth/login",
        json={"email": ADMIN_EMAIL, "password": new_password},
        headers={"X-Forwarded-For": _fresh_ip()},
    )
    assert login_r.status_code == 200, f"login with new pw failed: {login_r.status_code} {login_r.text}"

    # --- Step D: re-using the same token → 400
    reuse_r = http.post(
        f"{API}/auth/reset-password",
        json={"token": token, "new_password": "someOther1"},
        headers={"X-Forwarded-For": ip},
    )
    assert reuse_r.status_code == 400, reuse_r.text
    detail = reuse_r.json().get("detail", "")
    assert "använd" in detail or "Ogiltig" in detail

    # --- Step E: RESTORE admin password back to original via another reset cycle
    r2 = http.post(
        f"{API}/auth/forgot-password",
        json={"email": ADMIN_EMAIL},
        headers={"X-Forwarded-For": _fresh_ip()},
    )
    assert r2.status_code == 200
    doc2 = event_loop.run_until_complete(_latest_token_for(mongo, ADMIN_EMAIL))
    assert doc2 is not None
    token2 = doc2["token"]
    r3 = http.post(
        f"{API}/auth/reset-password",
        json={"token": token2, "new_password": ADMIN_ORIGINAL_PW},
        headers={"X-Forwarded-For": _fresh_ip()},
    )
    assert r3.status_code == 200, r3.text

    # sanity — original login works again
    final_login = http.post(
        f"{API}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_ORIGINAL_PW},
        headers={"X-Forwarded-For": _fresh_ip()},
    )
    assert final_login.status_code == 200, f"restore login failed: {final_login.text}"


# ---------------------------------------------------------------------------
# 8) Regression: /api/auth/login + /api/auth/refresh + /api/auth/me still work
# ---------------------------------------------------------------------------
def test_regression_login_refresh_me(http):
    s = requests.Session()
    r = s.post(
        f"{API}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_ORIGINAL_PW},
        headers={"X-Forwarded-For": _fresh_ip(), "Content-Type": "application/json"},
    )
    assert r.status_code == 200, f"admin login regression failed: {r.status_code} {r.text}"
    # cookies should be set
    assert any(c.name in ("access_token", "refresh_token") for c in s.cookies), s.cookies

    me = s.get(f"{API}/auth/me")
    assert me.status_code == 200, me.text
    assert me.json().get("email", "").lower() == ADMIN_EMAIL.lower()

    ref = s.post(f"{API}/auth/refresh")
    assert ref.status_code == 200, f"refresh regression failed: {ref.status_code} {ref.text}"

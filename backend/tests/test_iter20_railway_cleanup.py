"""
Iter 20 — Post Railway-cleanup regression tests.
Covers: health, public prices, public site-texts, admin auth (Bearer flow),
2FA setup/status, password strength on register, admin price update, admin site-text update.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback to reading frontend .env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

API = f"{BASE_URL}/api"

ADMIN_EMAIL = "habib.nazary@hotmail.com"
ADMIN_PASSWORD = "Jordgubbe234@u"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "access_token" in data and data["access_token"], "no access_token returned"
    assert "refresh_token" in data and data["refresh_token"], "no refresh_token returned"
    return data["access_token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ---- 1. Health ----
def test_api_root_healthy():
    r = requests.get(f"{API}/", timeout=15)
    assert r.status_code == 200, f"root not healthy: {r.status_code} {r.text[:200]}"


# ---- 2. Public prices ----
def test_public_prices():
    r = requests.get(f"{API}/settings/prices", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert "registration_fee_kr" in data
    assert "membership_fee_kr" in data
    assert isinstance(data["registration_fee_kr"], int)
    assert isinstance(data["membership_fee_kr"], int)


# ---- 3. Public site-texts ----
def test_public_site_texts():
    r = requests.get(f"{API}/site-texts", timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), dict)


# ---- 4. Admin login returns Bearer tokens ----
def test_admin_login_returns_tokens(admin_token):
    assert admin_token and isinstance(admin_token, str) and len(admin_token) > 20


# ---- 5. 2FA status ----
def test_2fa_status(admin_headers):
    r = requests.get(f"{API}/auth/2fa/status", headers=admin_headers, timeout=15)
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    data = r.json()
    assert "enabled" in data
    assert isinstance(data["enabled"], bool)


# ---- 6. 2FA setup ----
def test_2fa_setup(admin_headers):
    r = requests.post(f"{API}/auth/2fa/setup", headers=admin_headers, timeout=15)
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    data = r.json()
    assert "secret" in data and data["secret"]
    assert "otpauth_uri" in data and data["otpauth_uri"].startswith("otpauth://")


# ---- 7. Register with weak password -> 400 Swedish ----
def test_register_weak_password():
    payload = {
        "email": f"weakpw+{uuid.uuid4().hex[:8]}@example.com",
        "password": "weak",
        "first_name": "Test",
        "last_name": "Weak",
    }
    r = requests.post(f"{API}/auth/register", json=payload, timeout=15)
    assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
    # Swedish message about password strength
    txt = r.text.lower()
    assert any(w in txt for w in ["lösenord", "losenord", "tecken", "svagt", "starkt"]), f"no swedish pw message: {r.text}"


# ---- 8. Register with strong password -> success + access_token ----
_created_email = None
_created_token = None


def test_register_strong_password():
    global _created_email, _created_token
    email = f"strongpw+{uuid.uuid4().hex[:8]}@example.com"
    payload = {
        "email": email,
        "password": "Str0ng!Pass2026",
        "first_name": "Test",
        "last_name": "Strong",
    }
    r = requests.post(f"{API}/auth/register", json=payload, timeout=30)
    assert r.status_code in (200, 201), f"register failed: {r.status_code} {r.text}"
    data = r.json()
    assert "access_token" in data and data["access_token"], f"no access_token: {data}"
    _created_email = email
    _created_token = data["access_token"]


# ---- 9. Admin PATCH prices -> reflects in public GET ----
def test_admin_update_prices(admin_headers):
    # Get current
    r0 = requests.get(f"{API}/settings/prices", timeout=15)
    original = r0.json()
    try:
        new_reg = 333
        new_mem = 111
        r = requests.patch(
            f"{API}/admin/settings/prices",
            headers=admin_headers,
            json={"registration_fee_kr": new_reg, "membership_fee_kr": new_mem},
            timeout=15,
        )
        assert r.status_code == 200, f"patch failed: {r.status_code} {r.text}"
        data = r.json()
        assert data["registration_fee_kr"] == new_reg
        assert data["membership_fee_kr"] == new_mem

        # Public reflects
        r2 = requests.get(f"{API}/settings/prices", timeout=15)
        assert r2.status_code == 200
        pub = r2.json()
        assert pub["registration_fee_kr"] == new_reg
        assert pub["membership_fee_kr"] == new_mem
    finally:
        # Restore original values
        requests.patch(
            f"{API}/admin/settings/prices",
            headers=admin_headers,
            json={
                "registration_fee_kr": int(original["registration_fee_kr"]),
                "membership_fee_kr": int(original["membership_fee_kr"]),
            },
            timeout=15,
        )


# ---- 10. Admin PATCH site-text -> reflects in public GET ----
def test_admin_update_site_text(admin_headers):
    key = f"TEST_iter20_{uuid.uuid4().hex[:8]}"
    value = "Testvärde från iter 20"
    r = requests.patch(
        f"{API}/admin/site-texts/{key}",
        headers=admin_headers,
        json={"value": value},
        timeout=15,
    )
    assert r.status_code == 200, f"patch failed: {r.status_code} {r.text}"
    data = r.json()
    assert data.get("key") == key
    assert data.get("value") == value

    # Public reflects
    r2 = requests.get(f"{API}/site-texts", timeout=15)
    assert r2.status_code == 200
    pub = r2.json()
    assert key in pub, f"key {key} not found in public site-texts"
    assert pub[key] == value

    # Cleanup via direct mongo (no delete endpoint) — leave as TEST_ prefixed


# ---- 11. Cleanup created test user ----
def test_cleanup_created_user():
    """Best-effort cleanup: delete created test user from Mongo."""
    global _created_email
    if not _created_email:
        pytest.skip("no created user to clean up")
    import subprocess
    # use mongosh from container
    db_name = os.environ.get("DB_NAME", "test_database")
    with open("/app/backend/.env") as f:
        for line in f:
            if line.startswith("DB_NAME="):
                db_name = line.split("=", 1)[1].strip()
    cmd = f'mongosh --quiet {db_name} --eval \'db.users.deleteOne({{email: "{_created_email}"}}); db.site_texts.deleteMany({{key: /^TEST_iter20_/}})\''
    try:
        subprocess.run(cmd, shell=True, timeout=10, check=False)
    except Exception:
        pass

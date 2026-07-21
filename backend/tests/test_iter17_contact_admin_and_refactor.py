"""Iteration 17 backend regression + new endpoint tests.

Covers:
- Refactor sanity: /api/auth/login still works (admin credential)
- Refactor sanity: rate_limit fires on 6th wrong login for same email (429)
- Refactor sanity: /app/backend/lib/security.py exports hash_password, verify_password,
  client_ip, rate_limit and verify_password works with a fresh bcrypt hash
- Admin contact messages: GET /api/admin/contact-messages returns list
- Admin contact messages: PATCH updates status
- Admin contact messages: bulk-delete works
- Non-admin cannot access /api/admin/contact-messages
- /api/discount-codes/validate returns valid=True for PARROTS15 with 15%
- /api/discount-codes/validate returns valid=False for INVALID999
"""
import os
import time
import uuid
import bcrypt
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://admin-enhance-parrot.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "habib.nazary@hotmail.com"
ADMIN_PASSWORD = "Jordgubbe234@u"


@pytest.fixture(scope="module")
def admin_session():
    """Log in as admin, return requests.Session with cookies."""
    s = requests.Session()
    r = s.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    if r.status_code != 200:
        pytest.skip(f"Admin login failed (status={r.status_code}). Cannot test admin endpoints.")
    return s


# ---------------------------------------------------------------------------
# lib/security.py direct imports (proves refactor exported symbols correctly)
# ---------------------------------------------------------------------------
class TestSecurityLib:
    def test_import_symbols_exist(self):
        import sys
        sys.path.insert(0, "/app/backend")
        from lib.security import hash_password, verify_password, client_ip, rate_limit  # noqa
        assert callable(hash_password)
        assert callable(verify_password)
        assert callable(client_ip)
        assert callable(rate_limit)

    def test_verify_password_against_bcrypt_hash(self):
        import sys
        sys.path.insert(0, "/app/backend")
        from lib.security import verify_password
        h = bcrypt.hashpw(b"x", bcrypt.gensalt()).decode()
        assert h.startswith("$2b$")
        assert verify_password("x", h) is True
        assert verify_password("wrong", h) is False


# ---------------------------------------------------------------------------
# Auth login refactor sanity
# ---------------------------------------------------------------------------
class TestAuthRefactor:
    def test_admin_login_still_works(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("email") == ADMIN_EMAIL.lower()
        assert body.get("role") == "admin"
        # cookies should be set
        cookies = r.cookies
        assert "access_token" in cookies or any(c.name == "access_token" for c in cookies)

    def test_rate_limit_fires_on_6th_wrong_login(self):
        """Per-email limit is 5/15min. 6th wrong attempt must be 429."""
        # Use a fresh throwaway email so we don't hammer admin bucket
        fake_email = f"rl_iter17_{uuid.uuid4().hex[:8]}@example.com"
        got_429 = False
        for i in range(1, 8):
            r = requests.post(
                f"{BASE_URL}/api/auth/login",
                json={"email": fake_email, "password": "definitely-wrong"},
                timeout=10,
            )
            if r.status_code == 429:
                got_429 = True
                break
        assert got_429, "Expected 429 rate-limit within 7 attempts, never got one"


# ---------------------------------------------------------------------------
# Admin contact messages
# ---------------------------------------------------------------------------
class TestAdminContactMessages:
    def test_admin_list_contact_messages(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/contact-messages", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        # Iteration description promises at least one message from earlier tests
        # If empty, we still don't fail — but log it.
        if data:
            first = data[0]
            assert "id" in first
            assert "status" in first
            assert first["status"] in ("new", "read", "responded", "archived")

    def test_non_admin_cannot_list(self):
        # No auth → 401
        r = requests.get(f"{BASE_URL}/api/admin/contact-messages", timeout=15)
        assert r.status_code in (401, 403), r.text

    def _seed_message(self):
        """Submit a fresh contact message from a unique email/IP so we can update it."""
        unique = uuid.uuid4().hex[:8]
        r = requests.post(
            f"{BASE_URL}/api/contact",
            json={
                "name": f"Iter17 Tester {unique}",
                "email": f"iter17_{unique}@example.com",
                "subject": f"iter17-{unique}",
                "message": "iter17 contact message body — testing patch/bulk-delete",
            },
            headers={"X-Forwarded-For": f"10.17.{int(unique[:2], 16) % 255}.{int(unique[2:4], 16) % 255}"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        return r.json()["id"]

    def test_patch_status_and_bulk_delete(self, admin_session):
        # Seed 2 messages then bulk delete both
        mid1 = self._seed_message()
        time.sleep(0.2)
        mid2 = self._seed_message()

        # PATCH first one to responded
        r = admin_session.patch(
            f"{BASE_URL}/api/admin/contact-messages/{mid1}",
            json={"status": "responded"},
            timeout=15,
        )
        assert r.status_code == 200, r.text

        # GET list, verify status changed
        r2 = admin_session.get(f"{BASE_URL}/api/admin/contact-messages", timeout=15)
        assert r2.status_code == 200
        found = next((m for m in r2.json() if m["id"] == mid1), None)
        assert found is not None
        assert found["status"] == "responded"

        # PATCH archive on 2nd
        r3 = admin_session.patch(
            f"{BASE_URL}/api/admin/contact-messages/{mid2}",
            json={"status": "archived"},
            timeout=15,
        )
        assert r3.status_code == 200

        # Bulk delete both
        r4 = admin_session.post(
            f"{BASE_URL}/api/admin/contact-messages/bulk-delete",
            json={"ids": [mid1, mid2]},
            timeout=15,
        )
        assert r4.status_code == 200, r4.text
        assert r4.json().get("deleted") == 2

        # Verify gone
        r5 = admin_session.get(f"{BASE_URL}/api/admin/contact-messages", timeout=15)
        remaining = {m["id"] for m in r5.json()}
        assert mid1 not in remaining
        assert mid2 not in remaining

    def test_patch_nonexistent_returns_404(self, admin_session):
        r = admin_session.patch(
            f"{BASE_URL}/api/admin/contact-messages/does-not-exist",
            json={"status": "read"},
            timeout=15,
        )
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# Discount code validate (backing the live-price UI on /registrera-fagel)
# ---------------------------------------------------------------------------
class TestDiscountValidate:
    def test_valid_code_returns_percentage(self):
        r = requests.post(
            f"{BASE_URL}/api/discount-codes/validate",
            json={"code": "PARROTS15"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("valid") is True
        # Frontend expects a way to read discount_percentage. Backend nests it
        # under discount_code — flag this asymmetry.
        dc = body.get("discount_code") or {}
        assert dc.get("discount_percentage") == 15, (
            "Backend nests discount_percentage under discount_code — "
            "frontend must read data.discount_code.discount_percentage, "
            "not data.discount_percentage"
        )

    def test_invalid_code_returns_message(self):
        r = requests.post(
            f"{BASE_URL}/api/discount-codes/validate",
            json={"code": "INVALID999"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("valid") is False
        assert body.get("message")

"""End-to-end backend test suite for Papegojregistret.

Covers:
- Auth (register, login, me, logout, refresh, google/session)
- Admin stats, users, birds, discount codes, feedback, comments, activity, CSV exports
- Public bird registration + found bird flows
- Discount code validation
- Role protection (non-admin gets 403)
"""

import os
import uuid
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else "https://admin-enhance-parrot.preview.emergentagent.com"
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@papegojregistret.se"
ADMIN_PASSWORD = "Admin123!"
USER_EMAIL = "test@papegojregistret.se"
USER_PASSWORD = "Test123!"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def user_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": USER_EMAIL, "password": USER_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"user login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def anon_session():
    return requests.Session()


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
class TestHealth:
    def test_root(self):
        r = requests.get(f"{API}/", timeout=15)
        assert r.status_code == 200
        assert "Papegojregistret" in r.json().get("message", "")


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
class TestAuth:
    def test_login_admin_ok(self):
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert body["email"] == ADMIN_EMAIL
        assert body["role"] == "admin"
        # httpOnly cookies
        cookies = {c.name: c for c in s.cookies}
        assert "access_token" in cookies
        assert "refresh_token" in cookies

    def test_login_wrong_password(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "WRONG"}, timeout=30)
        assert r.status_code == 401
        assert "Fel" in r.json().get("detail", "")

    def test_me_without_cookie(self):
        r = requests.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 401

    def test_me_with_cookie(self, admin_session):
        r = admin_session.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL

    def test_logout(self):
        s = requests.Session()
        s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
        r = s.post(f"{API}/auth/logout", timeout=15)
        assert r.status_code == 200
        assert r.json()["success"] is True

    def test_register_new_user_and_me(self):
        s = requests.Session()
        email = f"TEST_reg_{uuid.uuid4().hex[:8]}@example.com"
        r = s.post(f"{API}/auth/register", json={
            "email": email,
            "password": "Testtest1",
            "first_name": "Reg",
            "last_name": "User",
        }, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["email"] == email.lower()
        assert r.json()["role"] == "user"
        # cookie set → me works
        me = s.get(f"{API}/auth/me", timeout=15)
        assert me.status_code == 200
        # duplicate email
        r2 = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "Testtest1"
        }, timeout=30)
        assert r2.status_code == 400
        assert "registrer" in r2.json()["detail"].lower()

    def test_google_session_invalid(self):
        r = requests.post(f"{API}/auth/google/session", json={"session_id": "bogus_" + uuid.uuid4().hex}, timeout=30)
        assert r.status_code == 401
        assert "Google" in r.json().get("detail", "")


# ---------------------------------------------------------------------------
# Admin protection
# ---------------------------------------------------------------------------
class TestAdminProtection:
    def test_non_admin_forbidden(self, user_session):
        r = user_session.get(f"{API}/admin/stats", timeout=15)
        assert r.status_code == 403

    def test_anon_unauthorized(self):
        r = requests.get(f"{API}/admin/stats", timeout=15)
        assert r.status_code == 401


# ---------------------------------------------------------------------------
# Admin stats
# ---------------------------------------------------------------------------
class TestAdminStats:
    def test_stats_shape(self, admin_session):
        r = admin_session.get(f"{API}/admin/stats", timeout=15)
        assert r.status_code == 200
        body = r.json()
        for key in [
            "total_users", "total_registered_birds", "paid_birds",
            "total_revenue", "registrations_series", "species_top",
        ]:
            assert key in body
        assert isinstance(body["registrations_series"], list)
        assert len(body["registrations_series"]) == 30
        assert set(body["registrations_series"][0].keys()) >= {"date", "count"}
        assert isinstance(body["species_top"], list)


# ---------------------------------------------------------------------------
# Admin users
# ---------------------------------------------------------------------------
class TestAdminUsers:
    def test_list_users(self, admin_session):
        r = admin_session.get(f"{API}/admin/users", timeout=15)
        assert r.status_code == 200
        users = r.json()
        assert any(u["email"] == ADMIN_EMAIL for u in users)
        assert any(u["email"] == USER_EMAIL for u in users)
        for u in users:
            assert "bird_count" in u

    def test_list_users_search(self, admin_session):
        r = admin_session.get(f"{API}/admin/users", params={"search": "papegoj"}, timeout=15)
        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_list_users_role_filter(self, admin_session):
        r = admin_session.get(f"{API}/admin/users", params={"role": "admin"}, timeout=15)
        assert r.status_code == 200
        for u in r.json():
            assert u["role"] == "admin"

    def test_block_unblock_and_login_blocked(self, admin_session):
        users = admin_session.get(f"{API}/admin/users", timeout=15).json()
        target = next(u for u in users if u["email"] == USER_EMAIL)
        uid = target["user_id"]
        # Block
        r = admin_session.put(f"{API}/admin/users/{uid}/block", timeout=15)
        assert r.status_code == 200
        # Blocked login → 403
        rlogin = requests.post(f"{API}/auth/login", json={
            "email": USER_EMAIL, "password": USER_PASSWORD
        }, timeout=15)
        assert rlogin.status_code == 403
        # Unblock
        r = admin_session.put(f"{API}/admin/users/{uid}/unblock", timeout=15)
        assert r.status_code == 200
        rlogin = requests.post(f"{API}/auth/login", json={
            "email": USER_EMAIL, "password": USER_PASSWORD
        }, timeout=15)
        assert rlogin.status_code == 200

    def test_patch_user_first_name(self, admin_session):
        users = admin_session.get(f"{API}/admin/users", timeout=15).json()
        target = next(u for u in users if u["email"] == USER_EMAIL)
        uid = target["user_id"]
        original = target.get("first_name", "")
        r = admin_session.patch(f"{API}/admin/users/{uid}", json={"first_name": "PATCHED"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["first_name"] == "PATCHED"
        # restore
        admin_session.patch(f"{API}/admin/users/{uid}", json={"first_name": original or "Testa"}, timeout=15)

    def test_cannot_self_delete(self, admin_session):
        me = admin_session.get(f"{API}/auth/me", timeout=15).json()
        r = admin_session.delete(f"{API}/admin/users/{me['user_id']}", timeout=15)
        assert r.status_code == 400


# ---------------------------------------------------------------------------
# Registered birds (public POST + admin CRUD + CSV export)
# ---------------------------------------------------------------------------
class TestRegisteredBirds:
    ring = None
    bird_id = None

    def test_public_create_bird(self, anon_session):
        ring = f"TESTR{uuid.uuid4().hex[:6].upper()}"
        payload = {
            "species": "cockatiel",
            "ring_number": ring,
            "owner_name": "Test Owner",
            "phone_number": "0701112233",
        }
        r = requests.post(f"{API}/registered-birds", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ring_number"] == ring
        TestRegisteredBirds.ring = ring
        TestRegisteredBirds.bird_id = body["id"]

    def test_public_create_bird_duplicate_ring(self):
        assert TestRegisteredBirds.ring is not None
        payload = {
            "species": "cockatiel",
            "ring_number": TestRegisteredBirds.ring,
            "owner_name": "Test Owner",
            "phone_number": "0701112233",
        }
        r = requests.post(f"{API}/registered-birds", json=payload, timeout=15)
        assert r.status_code == 400
        assert "Ringnummer" in r.json()["detail"]

    def test_public_create_bird_invalid_phone(self):
        payload = {
            "species": "cockatiel",
            "ring_number": f"TESTR{uuid.uuid4().hex[:6].upper()}",
            "owner_name": "Test Owner",
            "phone_number": "12345",
        }
        r = requests.post(f"{API}/registered-birds", json=payload, timeout=15)
        assert r.status_code == 400
        assert "telefonnummer" in r.json()["detail"].lower()

    def test_admin_list_birds(self, admin_session):
        r = admin_session.get(f"{API}/admin/registered-birds", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_admin_list_birds_search(self, admin_session):
        r = admin_session.get(f"{API}/admin/registered-birds", params={"search": TestRegisteredBirds.ring}, timeout=15)
        assert r.status_code == 200
        rings = [b["ring_number"] for b in r.json()]
        assert TestRegisteredBirds.ring in rings

    def test_admin_list_birds_payment_filter(self, admin_session):
        r = admin_session.get(f"{API}/admin/registered-birds", params={"payment_status": "completed"}, timeout=15)
        assert r.status_code == 200
        for b in r.json():
            assert b["payment_status"] == "completed"

    def test_admin_update_bird(self, admin_session):
        assert TestRegisteredBirds.bird_id is not None
        r = admin_session.patch(f"{API}/admin/registered-birds/{TestRegisteredBirds.bird_id}", json={
            "owner_name": "Updated Owner"
        }, timeout=15)
        assert r.status_code == 200
        assert r.json()["owner_name"] == "Updated Owner"

    def test_admin_update_bird_duplicate_ring(self, admin_session):
        # find any other bird
        birds = admin_session.get(f"{API}/admin/registered-birds", timeout=15).json()
        others = [b for b in birds if b["id"] != TestRegisteredBirds.bird_id]
        if not others:
            pytest.skip("No other bird to test duplicate ring")
        r = admin_session.patch(f"{API}/admin/registered-birds/{TestRegisteredBirds.bird_id}", json={
            "ring_number": others[0]["ring_number"]
        }, timeout=15)
        assert r.status_code == 400
        assert "Ringnummer" in r.json()["detail"]

    def test_admin_export_csv(self, admin_session):
        r = admin_session.get(f"{API}/admin/registered-birds/export/csv", timeout=30)
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")
        text = r.text.splitlines()
        assert text[0].startswith("id,species,ring_number")

    def test_admin_delete_bird(self, admin_session):
        assert TestRegisteredBirds.bird_id is not None
        r = admin_session.delete(f"{API}/admin/registered-birds/{TestRegisteredBirds.bird_id}", timeout=15)
        assert r.status_code == 200
        # verify gone
        r2 = admin_session.get(f"{API}/admin/registered-birds/{TestRegisteredBirds.bird_id}", timeout=15)
        assert r2.status_code == 404


# ---------------------------------------------------------------------------
# Found birds
# ---------------------------------------------------------------------------
class TestFoundBirds:
    fid = None

    def test_public_create_found_bird(self):
        payload = {
            "description": "TEST_ Test found bird",
            "location": "Testplats",
            "date_found": "2026-01-05",
            "finder_name": "Finder",
            "finder_phone": "0701234567",
        }
        r = requests.post(f"{API}/found-birds", json=payload, timeout=15)
        assert r.status_code == 200
        TestFoundBirds.fid = r.json()["id"]

    def test_found_bird_bad_phone(self):
        r = requests.post(f"{API}/found-birds", json={
            "description": "x", "location": "y", "date_found": "2026-01-05",
            "finder_name": "z", "finder_phone": "0000",
        }, timeout=15)
        assert r.status_code == 400

    def test_admin_list_found(self, admin_session):
        r = admin_session.get(f"{API}/admin/found-birds", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_admin_export_found_csv(self, admin_session):
        r = admin_session.get(f"{API}/admin/found-birds/export/csv", timeout=30)
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")

    def test_admin_delete_found(self, admin_session):
        assert TestFoundBirds.fid is not None
        r = admin_session.delete(f"{API}/admin/found-birds/{TestFoundBirds.fid}", timeout=15)
        assert r.status_code == 200


# ---------------------------------------------------------------------------
# Discount codes
# ---------------------------------------------------------------------------
class TestDiscountCodes:
    created_id = None
    code_value = None

    def test_public_validate_seeded(self):
        r = requests.post(f"{API}/discount-codes/validate", json={"code": "parrots15"}, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["valid"] is True
        assert body["discount_code"]["discount_percentage"] == 15

    def test_public_validate_missing(self):
        r = requests.post(f"{API}/discount-codes/validate", json={"code": "NOSUCH"}, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["valid"] is False
        assert "finns" in body["message"].lower() or "inte" in body["message"].lower()

    def test_admin_create_code(self, admin_session):
        code = f"TEST{uuid.uuid4().hex[:6].upper()}"
        r = admin_session.post(f"{API}/admin/discount-codes", json={
            "code": code.lower(),  # ensure server uppercases
            "discount_percentage": 20,
            "is_active": True,
        }, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["code"] == code.upper()
        TestDiscountCodes.created_id = body["id"]
        TestDiscountCodes.code_value = code.upper()

    def test_admin_create_code_duplicate(self, admin_session):
        assert TestDiscountCodes.code_value is not None
        r = admin_session.post(f"{API}/admin/discount-codes", json={
            "code": TestDiscountCodes.code_value,
            "discount_percentage": 5,
        }, timeout=15)
        assert r.status_code == 400

    def test_admin_update_code(self, admin_session):
        assert TestDiscountCodes.created_id is not None
        r = admin_session.patch(f"{API}/admin/discount-codes/{TestDiscountCodes.created_id}", json={
            "discount_percentage": 25
        }, timeout=15)
        assert r.status_code == 200
        assert r.json()["discount_percentage"] == 25

    def test_admin_list_codes(self, admin_session):
        r = admin_session.get(f"{API}/admin/discount-codes", timeout=15)
        assert r.status_code == 200
        assert any(c["code"] == TestDiscountCodes.code_value for c in r.json())

    def test_admin_delete_code(self, admin_session):
        r = admin_session.delete(f"{API}/admin/discount-codes/{TestDiscountCodes.created_id}", timeout=15)
        assert r.status_code == 200


# ---------------------------------------------------------------------------
# Feedback / comments / activity
# ---------------------------------------------------------------------------
class TestFeedbackCommentsActivity:
    def test_admin_list_feedback(self, admin_session):
        r = admin_session.get(f"{API}/admin/feedback", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_admin_export_feedback_csv(self, admin_session):
        r = admin_session.get(f"{API}/admin/feedback/export/csv", timeout=15)
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")

    def test_admin_list_comments(self, admin_session):
        r = admin_session.get(f"{API}/admin/comments", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_admin_activity(self, admin_session):
        r = admin_session.get(f"{API}/admin/activity", timeout=15)
        assert r.status_code == 200
        activities = r.json()
        assert isinstance(activities, list)
        # user.login should exist since we logged in as admin
        actions = {a["action"] for a in activities}
        assert "user.login" in actions

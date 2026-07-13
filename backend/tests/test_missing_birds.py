"""Missing-bird (private) feature backend tests.

Covers:
- POST /api/missing-birds (public, phone validation)
- GET /api/admin/missing-birds (admin only, status/search filters)
- PATCH /api/admin/missing-birds/{id} (found sets found_at)
- POST /api/admin/missing-birds/{id}/notify
- DELETE /api/admin/missing-birds/{id}
- GET /api/admin/missing-birds/export/csv
- Privacy: reports do NOT leak into /found-birds or /posts
- /admin/stats now includes missing_searching and missing_found
"""

import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://admin-enhance-parrot.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@papegojregistret.se"
ADMIN_PASSWORD = "Admin123!"
USER_EMAIL = "test@papegojregistret.se"
USER_PASSWORD = "Test123!"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def user_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": USER_EMAIL, "password": USER_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return s


def _payload(**overrides):
    base = {
        "owner_name": f"TEST_Owner_{uuid.uuid4().hex[:6]}",
        "contact_phone": "0701234567",
        "contact_email": "test_missing@example.com",
        "species": "Ara – Blå och gul",
        "ring_number": f"TESTM{uuid.uuid4().hex[:6].upper()}",
        "description": "Grön/blå, kan säga hej",
        "last_seen_location": "Södermalm, Stockholm",
        "last_seen_date": "2026-01-05",
        "reward_offered": "500 kr",
    }
    base.update(overrides)
    return base


# --------------- Public POST ------------------
class TestMissingReportPublic:
    def test_create_ok_defaults(self):
        r = requests.post(f"{API}/missing-birds", json=_payload(), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "searching"
        assert body["found_at"] is None
        assert body["notified_at"] is None
        assert body["notification_message"] is None
        assert "id" in body
        assert body["contact_phone"] == "0701234567"
        # cleanup
        s = requests.Session()
        s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
        s.delete(f"{API}/admin/missing-birds/{body['id']}", timeout=15)

    def test_create_bad_phone(self):
        r = requests.post(f"{API}/missing-birds", json=_payload(contact_phone="12345"), timeout=15)
        assert r.status_code == 400
        assert "telefonnummer" in r.json()["detail"].lower()

    def test_create_missing_required(self):
        bad = _payload()
        del bad["species"]
        r = requests.post(f"{API}/missing-birds", json=bad, timeout=15)
        assert r.status_code == 422

    def test_create_optional_fields_omitted(self):
        payload = _payload()
        for k in ("contact_email", "ring_number", "reward_offered"):
            payload.pop(k, None)
        r = requests.post(f"{API}/missing-birds", json=payload, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["contact_email"] is None
        assert body["ring_number"] is None
        assert body["reward_offered"] is None
        # cleanup
        s = requests.Session()
        s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
        s.delete(f"{API}/admin/missing-birds/{body['id']}", timeout=15)


# --------------- Admin auth --------------
class TestMissingAdminAuth:
    def test_anonymous_401(self):
        r = requests.get(f"{API}/admin/missing-birds", timeout=15)
        assert r.status_code == 401

    def test_non_admin_403(self, user_session):
        r = user_session.get(f"{API}/admin/missing-birds", timeout=15)
        assert r.status_code == 403


# --------------- Admin CRUD lifecycle ---------------
class TestMissingLifecycle:
    report_id = None

    def test_create_for_admin_view(self, admin_session):
        payload = _payload(owner_name="TEST_LC_Owner", species="TEST_lifecycle_species")
        r = requests.post(f"{API}/missing-birds", json=payload, timeout=15)
        assert r.status_code == 200
        TestMissingLifecycle.report_id = r.json()["id"]

    def test_admin_list_default_all(self, admin_session):
        r = admin_session.get(f"{API}/admin/missing-birds", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert any(x["id"] == TestMissingLifecycle.report_id for x in data)

    def test_admin_list_filter_searching(self, admin_session):
        r = admin_session.get(f"{API}/admin/missing-birds", params={"status": "searching"}, timeout=15)
        assert r.status_code == 200
        for x in r.json():
            assert x["status"] == "searching"
        assert any(x["id"] == TestMissingLifecycle.report_id for x in r.json())

    def test_admin_list_search(self, admin_session):
        r = admin_session.get(f"{API}/admin/missing-birds", params={"search": "TEST_lifecycle"}, timeout=15)
        assert r.status_code == 200
        assert any(x["id"] == TestMissingLifecycle.report_id for x in r.json())

    def test_admin_notify(self, admin_session):
        rid = TestMissingLifecycle.report_id
        r = admin_session.post(f"{API}/admin/missing-birds/{rid}/notify", json={"message": "Hej – vi ringer"}, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["notification_message"] == "Hej – vi ringer"
        assert body["notified_at"] is not None

    def test_admin_update_status_found_sets_found_at(self, admin_session):
        rid = TestMissingLifecycle.report_id
        r = admin_session.patch(f"{API}/admin/missing-birds/{rid}", json={"status": "found", "admin_notes": "Hittad OK"}, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "found"
        assert body["found_at"] is not None
        assert body["admin_notes"] == "Hittad OK"

    def test_admin_list_filter_found_contains_report(self, admin_session):
        r = admin_session.get(f"{API}/admin/missing-birds", params={"status": "found"}, timeout=15)
        assert r.status_code == 200
        assert any(x["id"] == TestMissingLifecycle.report_id for x in r.json())

    def test_admin_update_status_closed(self, admin_session):
        rid = TestMissingLifecycle.report_id
        r = admin_session.patch(f"{API}/admin/missing-birds/{rid}", json={"status": "closed"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "closed"

    def test_admin_update_empty_400(self, admin_session):
        rid = TestMissingLifecycle.report_id
        r = admin_session.patch(f"{API}/admin/missing-birds/{rid}", json={}, timeout=15)
        assert r.status_code == 400

    def test_admin_update_404(self, admin_session):
        r = admin_session.patch(f"{API}/admin/missing-birds/nonexistent-id", json={"status": "found"}, timeout=15)
        assert r.status_code == 404

    def test_admin_delete_report(self, admin_session):
        rid = TestMissingLifecycle.report_id
        r = admin_session.delete(f"{API}/admin/missing-birds/{rid}", timeout=15)
        assert r.status_code == 200
        # verify gone
        listing = admin_session.get(f"{API}/admin/missing-birds", timeout=15).json()
        assert not any(x["id"] == rid for x in listing)

    def test_admin_delete_404(self, admin_session):
        r = admin_session.delete(f"{API}/admin/missing-birds/does-not-exist", timeout=15)
        assert r.status_code == 404


# --------------- CSV export ---------------
class TestMissingCSV:
    def test_csv_export(self, admin_session):
        # ensure at least one row
        pl = _payload(owner_name="TEST_CSV_owner")
        r = requests.post(f"{API}/missing-birds", json=pl, timeout=15)
        assert r.status_code == 200
        rid = r.json()["id"]
        try:
            r = admin_session.get(f"{API}/admin/missing-birds/export/csv", timeout=30)
            assert r.status_code == 200
            assert "text/csv" in r.headers.get("content-type", "")
            lines = r.text.splitlines()
            assert lines[0].startswith("id,owner_name,contact_phone,contact_email,species,ring_number,last_seen_location,last_seen_date,status,found_at,notified_at,created_at")
            assert any("TEST_CSV_owner" in ln for ln in lines[1:])
        finally:
            admin_session.delete(f"{API}/admin/missing-birds/{rid}", timeout=15)

    def test_csv_requires_admin(self, user_session):
        r = user_session.get(f"{API}/admin/missing-birds/export/csv", timeout=15)
        assert r.status_code == 403


# --------------- Privacy: no leak ---------------
class TestMissingPrivacy:
    def test_missing_report_not_in_found_birds(self, admin_session):
        pl = _payload(owner_name="TEST_LEAK", species="TEST_leak_species", description="TEST_leak_description")
        r = requests.post(f"{API}/missing-birds", json=pl, timeout=15)
        assert r.status_code == 200
        rid = r.json()["id"]
        try:
            r = requests.get(f"{API}/found-birds", timeout=15)
            assert r.status_code == 200
            data = r.json()
            # No trace: no matching id, description or owner leak
            ids = [d.get("id") for d in data]
            assert rid not in ids
            # Search endpoint too
            r = requests.get(f"{API}/found-birds", params={"search": "TEST_leak"}, timeout=15)
            assert r.status_code == 200
            assert len(r.json()) == 0

            # Not in posts either
            r = requests.get(f"{API}/posts", params={"search": "TEST_leak"}, timeout=15)
            assert r.status_code == 200
            assert len(r.json()) == 0

            # Not in public birds gallery
            r = requests.get(f"{API}/public-birds", timeout=15)
            assert r.status_code == 200
            # No entry with our species/owner-marker
            for b in r.json():
                assert b.get("species") != "TEST_leak_species"
        finally:
            admin_session.delete(f"{API}/admin/missing-birds/{rid}", timeout=15)


# --------------- Admin stats includes missing counts ---------------
class TestAdminStatsMissing:
    def test_stats_includes_missing(self, admin_session):
        r = admin_session.get(f"{API}/admin/stats", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "missing_searching" in body
        assert "missing_found" in body
        assert isinstance(body["missing_searching"], int)
        assert isinstance(body["missing_found"], int)

    def test_stats_missing_counts_increase(self, admin_session):
        before = admin_session.get(f"{API}/admin/stats", timeout=15).json()
        pl = _payload(owner_name="TEST_stats_owner")
        r = requests.post(f"{API}/missing-birds", json=pl, timeout=15)
        assert r.status_code == 200
        rid = r.json()["id"]
        try:
            after = admin_session.get(f"{API}/admin/stats", timeout=15).json()
            assert after["missing_searching"] >= before["missing_searching"] + 1
            # Mark as found and re-check
            admin_session.patch(f"{API}/admin/missing-birds/{rid}", json={"status": "found"}, timeout=15)
            after2 = admin_session.get(f"{API}/admin/stats", timeout=15).json()
            assert after2["missing_found"] >= after["missing_found"] + 1
        finally:
            admin_session.delete(f"{API}/admin/missing-birds/{rid}", timeout=15)

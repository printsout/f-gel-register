"""Backend tests for ring_number normalization / uniqueness (bug fix iteration).

Covers:
- POST /registered-birds: rejects duplicates (exact, lowercase, whitespace variants)
- POST /registered-birds: normalizes response ring_number to uppercase + stripped
- PATCH /admin/registered-birds/{id}: rejects duplicates across case
- PATCH /admin/registered-birds/{id}: allows update of a bird's own ring in a different case
- Startup migration: all existing (seeded) ring_numbers are uppercased
"""

import os
import uuid
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else "https://admin-enhance-parrot.preview.emergentagent.com"
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@papegojregistret.se"
ADMIN_PASSWORD = "Admin123!"

SEEDED_RINGS = {"SE100000", "SE100001", "SE100002", "SE100003", "SE100004"}


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return s


def _bird_payload(ring: str) -> dict:
    return {
        "species": "Grå jako",
        "ring_number": ring,
        "owner_name": "Test Owner",
        "phone_number": "0701234567",
        "additional_info": "unit test",
        "image_urls": [],
    }


# ---------------------------------------------------------------------------
# Migration: all seeded/existing ring numbers must be uppercase
# ---------------------------------------------------------------------------
class TestStartupMigration:
    def test_all_existing_ring_numbers_are_uppercased(self, admin_session):
        r = admin_session.get(f"{API}/admin/registered-birds", timeout=30)
        assert r.status_code == 200, r.text
        birds = r.json()
        assert isinstance(birds, list) and len(birds) >= 1
        rings = [b.get("ring_number") for b in birds if b.get("ring_number")]
        assert rings, "no ring numbers returned"
        for rn in rings:
            assert rn == rn.upper(), f"ring {rn!r} is not uppercased"
            assert rn.strip() == rn, f"ring {rn!r} has surrounding whitespace"
            assert " " not in rn, f"ring {rn!r} contains whitespace"

    def test_seeded_ring_numbers_present_uppercased(self, admin_session):
        r = admin_session.get(f"{API}/admin/registered-birds", timeout=30)
        assert r.status_code == 200
        rings = {b["ring_number"] for b in r.json() if b.get("ring_number")}
        # Every seeded ring must be present and already uppercase
        missing = SEEDED_RINGS - rings
        assert not missing, f"seeded rings missing after migration: {missing}. Got: {rings}"


# ---------------------------------------------------------------------------
# POST /registered-birds: duplicate detection across case & whitespace
# ---------------------------------------------------------------------------
class TestCreateDuplicateBlocking:
    def test_exact_duplicate_blocked(self):
        r = requests.post(f"{API}/registered-birds", json=_bird_payload("SE100000"), timeout=30)
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
        detail = r.json().get("detail", "")
        assert "SE100000" in detail
        assert "redan registrerat" in detail.lower() or "redan registrerat" in detail

    def test_lowercase_duplicate_blocked(self):
        r = requests.post(f"{API}/registered-birds", json=_bird_payload("se100000"), timeout=30)
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
        detail = r.json().get("detail", "")
        # error must reference the NORMALIZED (uppercase) value
        assert "SE100000" in detail, f"error should contain normalized value: {detail}"

    def test_whitespace_duplicate_blocked(self):
        r = requests.post(f"{API}/registered-birds", json=_bird_payload(" SE 100000 "), timeout=30)
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
        detail = r.json().get("detail", "")
        assert "SE100000" in detail

    def test_mixed_case_whitespace_duplicate_blocked(self):
        r = requests.post(f"{API}/registered-birds", json=_bird_payload("  Se 100 000 "), timeout=30)
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"


# ---------------------------------------------------------------------------
# POST /registered-birds: fresh ring gets normalized on write
# ---------------------------------------------------------------------------
class TestCreateNormalization:
    _created_id = None
    _ring = f"RB-2026-{uuid.uuid4().hex[:6].upper()}"

    def test_create_fresh_ring_stored_normalized(self, admin_session):
        r = requests.post(f"{API}/registered-birds", json=_bird_payload(TestCreateNormalization._ring), timeout=30)
        assert r.status_code == 200, f"create failed: {r.status_code} {r.text}"
        body = r.json()
        assert body["ring_number"] == TestCreateNormalization._ring
        assert body["ring_number"] == body["ring_number"].upper()
        assert " " not in body["ring_number"]
        assert "_id" not in body  # ensure Mongo _id stripped
        TestCreateNormalization._created_id = body["id"]

        # GET admin list, must contain that ring uppercase
        gr = admin_session.get(f"{API}/admin/registered-birds", timeout=30)
        assert gr.status_code == 200
        rings = {b["ring_number"] for b in gr.json() if b.get("ring_number")}
        assert TestCreateNormalization._ring in rings

    def test_lowercase_of_new_ring_blocked(self):
        assert TestCreateNormalization._created_id, "prior create must have run"
        low = TestCreateNormalization._ring.lower()
        r = requests.post(f"{API}/registered-birds", json=_bird_payload(low), timeout=30)
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
        detail = r.json().get("detail", "")
        assert TestCreateNormalization._ring in detail

    def test_whitespace_variant_of_new_ring_blocked(self):
        assert TestCreateNormalization._created_id
        spaced = " " + TestCreateNormalization._ring.replace("-", " - ") + " "
        r = requests.post(f"{API}/registered-birds", json=_bird_payload(spaced), timeout=30)
        # spaces are collapsed by normalize -> RB-2026-XYZ so should collide
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"

    def test_cleanup_created(self, admin_session):
        if TestCreateNormalization._created_id:
            r = admin_session.delete(f"{API}/admin/registered-birds/{TestCreateNormalization._created_id}", timeout=30)
            assert r.status_code in (200, 204)


# ---------------------------------------------------------------------------
# PATCH /admin/registered-birds/{id}
# ---------------------------------------------------------------------------
class TestAdminPatchNormalization:
    _bird_a_id = None
    _bird_b_id = None
    _ring_a = f"TESTA-{uuid.uuid4().hex[:6].upper()}"
    _ring_b = f"TESTB-{uuid.uuid4().hex[:6].upper()}"

    def test_setup_two_birds(self, admin_session):
        ra = requests.post(f"{API}/registered-birds", json=_bird_payload(TestAdminPatchNormalization._ring_a), timeout=30)
        assert ra.status_code == 200, ra.text
        TestAdminPatchNormalization._bird_a_id = ra.json()["id"]

        rb = requests.post(f"{API}/registered-birds", json=_bird_payload(TestAdminPatchNormalization._ring_b), timeout=30)
        assert rb.status_code == 200, rb.text
        TestAdminPatchNormalization._bird_b_id = rb.json()["id"]

    def test_patch_to_other_birds_lowercase_ring_blocked(self, admin_session):
        # try to change bird B's ring to the lowercase version of A's ring
        low_a = TestAdminPatchNormalization._ring_a.lower()
        r = admin_session.patch(
            f"{API}/admin/registered-birds/{TestAdminPatchNormalization._bird_b_id}",
            json={"ring_number": low_a},
            timeout=30,
        )
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
        detail = r.json().get("detail", "")
        assert TestAdminPatchNormalization._ring_a in detail
        assert "redan registrerat" in detail

    def test_patch_own_ring_different_case_allowed(self, admin_session):
        # PATCH bird A with its own ring in lowercase → normalized to same value, allowed
        low_a = TestAdminPatchNormalization._ring_a.lower()
        r = admin_session.patch(
            f"{API}/admin/registered-birds/{TestAdminPatchNormalization._bird_a_id}",
            json={"ring_number": low_a},
            timeout=30,
        )
        assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text}"
        body = r.json()
        assert body["ring_number"] == TestAdminPatchNormalization._ring_a, f"ring not normalized: {body['ring_number']!r}"

        # GET to confirm persistence
        g = admin_session.get(
            f"{API}/admin/registered-birds/{TestAdminPatchNormalization._bird_a_id}",
            timeout=30,
        )
        assert g.status_code == 200
        assert g.json()["ring_number"] == TestAdminPatchNormalization._ring_a

    def test_patch_with_whitespace_ring_normalized(self, admin_session):
        # PATCH bird A own ring with whitespace variant
        spaced = f"  {TestAdminPatchNormalization._ring_a.lower()}  "
        r = admin_session.patch(
            f"{API}/admin/registered-birds/{TestAdminPatchNormalization._bird_a_id}",
            json={"ring_number": spaced},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        assert r.json()["ring_number"] == TestAdminPatchNormalization._ring_a

    def test_patch_to_seeded_ring_lowercase_blocked(self, admin_session):
        # bird A tries to steal seeded SE100001 via lowercase
        r = admin_session.patch(
            f"{API}/admin/registered-birds/{TestAdminPatchNormalization._bird_a_id}",
            json={"ring_number": "se100001"},
            timeout=30,
        )
        assert r.status_code == 400
        detail = r.json().get("detail", "")
        assert "SE100001" in detail
        assert "redan registrerat" in detail

    def test_cleanup(self, admin_session):
        for bid in (TestAdminPatchNormalization._bird_a_id, TestAdminPatchNormalization._bird_b_id):
            if bid:
                admin_session.delete(f"{API}/admin/registered-birds/{bid}", timeout=30)

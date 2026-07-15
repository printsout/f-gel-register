"""Backend tests for Homepage builder feature.

Coverage:
- GET /api/homepage (public) returns only visible sections in sort_order.
- GET /api/admin/homepage returns all sections (admin only, 403 otherwise).
- POST /api/admin/homepage creates section with valid type, 422 for invalid.
- PATCH /api/admin/homepage/{id} updates fields.
- POST /api/admin/homepage/reorder re-numbers sort_order.
- POST /api/admin/homepage/{id}/duplicate copies with "(kopia)" suffix.
- DELETE /api/admin/homepage/{id} removes section.
- Seeded 4 default sections on empty collection.
- Hidden sections excluded from public GET.
"""

import os
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else "https://admin-enhance-parrot.preview.emergentagent.com"
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@papegojregistret.se"
ADMIN_PASSWORD = "Admin123!"
USER_EMAIL = "test@papegojregistret.se"
USER_PASSWORD = "Test123!"


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
def public_session():
    return requests.Session()


# ---------------------------------------------------------------------------
# Public endpoint
# ---------------------------------------------------------------------------
class TestPublicHomepage:
    def test_public_get_returns_list_of_visible(self, public_session):
        r = public_session.get(f"{API}/homepage", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        # All returned sections must be visible
        for s in data:
            assert s.get("is_visible") is True, f"public GET returned hidden section: {s}"
            assert "_id" not in s

    def test_public_sorted_by_sort_order(self, public_session):
        r = public_session.get(f"{API}/homepage", timeout=30)
        data = r.json()
        orders = [s["sort_order"] for s in data]
        assert orders == sorted(orders), f"public sections not sorted: {orders}"


# ---------------------------------------------------------------------------
# Admin list & privacy
# ---------------------------------------------------------------------------
class TestAdminList:
    def test_admin_get_all_sections(self, admin_session):
        r = admin_session.get(f"{API}/admin/homepage", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 4  # at least the 4 seeded

    def test_admin_get_includes_hidden(self, admin_session, public_session):
        admin_r = admin_session.get(f"{API}/admin/homepage", timeout=30).json()
        public_r = public_session.get(f"{API}/homepage", timeout=30).json()
        assert len(admin_r) >= len(public_r)
        # Verify at least one hidden section exists in admin list (seeded text_block)
        hidden = [s for s in admin_r if not s.get("is_visible")]
        assert len(hidden) >= 1, "expected at least one hidden section (seeded text_block)"

    def test_non_admin_403_on_admin_endpoint(self, user_session):
        r = user_session.get(f"{API}/admin/homepage", timeout=30)
        assert r.status_code == 403

    def test_anonymous_401_on_admin_endpoint(self, public_session):
        r = public_session.get(f"{API}/admin/homepage", timeout=30)
        assert r.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Seed verification
# ---------------------------------------------------------------------------
class TestSeeding:
    def test_seeded_sections_exist(self, admin_session):
        r = admin_session.get(f"{API}/admin/homepage", timeout=30)
        data = r.json()
        types_present = {s["type"] for s in data}
        # Seeded types
        for t in ("hero", "emergency_cta", "features", "text_block"):
            assert t in types_present, f"seeded type {t} not found; got {types_present}"

    def test_seeded_text_block_is_hidden(self, admin_session):
        data = admin_session.get(f"{API}/admin/homepage", timeout=30).json()
        text_blocks = [s for s in data if s["type"] == "text_block"]
        assert text_blocks, "no text_block seeded"
        # At least one seeded text_block should be hidden
        assert any(not s["is_visible"] for s in text_blocks), "seeded text_block should be hidden"


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------
class TestCreate:
    created_ids = []

    def test_create_valid_hero(self, admin_session):
        payload = {"type": "hero", "label": "TEST_hero_section", "subtitle": "test", "config": {"title": "Hi"}}
        r = admin_session.post(f"{API}/admin/homepage", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["type"] == "hero"
        assert data["label"] == "TEST_hero_section"
        assert data["is_visible"] is True
        assert isinstance(data["sort_order"], int)
        assert data["config"] == {"title": "Hi"}
        assert "_id" not in data
        TestCreate.created_ids.append(data["id"])

    def test_create_places_at_end(self, admin_session):
        before = admin_session.get(f"{API}/admin/homepage", timeout=30).json()
        max_order = max(s["sort_order"] for s in before)
        payload = {"type": "cta_banner", "label": "TEST_cta_end"}
        r = admin_session.post(f"{API}/admin/homepage", json=payload, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["sort_order"] == max_order + 1
        TestCreate.created_ids.append(data["id"])

    def test_create_invalid_type_422(self, admin_session):
        r = admin_session.post(
            f"{API}/admin/homepage",
            json={"type": "not_a_type", "label": "Bad"},
            timeout=30,
        )
        assert r.status_code == 422

    def test_create_missing_label_422(self, admin_session):
        r = admin_session.post(f"{API}/admin/homepage", json={"type": "hero"}, timeout=30)
        assert r.status_code == 422

    def test_non_admin_cannot_create(self, user_session):
        r = user_session.post(
            f"{API}/admin/homepage",
            json={"type": "hero", "label": "nope"},
            timeout=30,
        )
        assert r.status_code == 403

    @classmethod
    def teardown_class(cls):
        # Cleanup
        s = requests.Session()
        s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
        for sid in cls.created_ids:
            try:
                s.delete(f"{API}/admin/homepage/{sid}", timeout=15)
            except Exception:
                pass


class TestUpdate:
    section_id = None

    @classmethod
    def setup_class(cls):
        s = requests.Session()
        s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
        r = s.post(f"{API}/admin/homepage", json={"type": "text_block", "label": "TEST_update_me"}, timeout=30)
        cls.section_id = r.json()["id"]
        cls.session = s

    @classmethod
    def teardown_class(cls):
        try:
            cls.session.delete(f"{API}/admin/homepage/{cls.section_id}", timeout=15)
        except Exception:
            pass

    def test_patch_label_and_subtitle(self):
        r = self.session.patch(
            f"{API}/admin/homepage/{self.section_id}",
            json={"label": "TEST_updated_label", "subtitle": "TEST_sub"},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["label"] == "TEST_updated_label"
        assert data["subtitle"] == "TEST_sub"

    def test_patch_is_visible_false(self):
        r = self.session.patch(
            f"{API}/admin/homepage/{self.section_id}",
            json={"is_visible": False},
            timeout=30,
        )
        assert r.status_code == 200
        assert r.json()["is_visible"] is False
        # Verify GET reflects change
        got = self.session.get(f"{API}/admin/homepage", timeout=30).json()
        me = next(s for s in got if s["id"] == self.section_id)
        assert me["is_visible"] is False

    def test_patch_config_accepts_dict(self):
        cfg = {"title": "T", "items": [{"a": 1}, {"b": 2}]}
        r = self.session.patch(
            f"{API}/admin/homepage/{self.section_id}",
            json={"config": cfg},
            timeout=30,
        )
        assert r.status_code == 200
        assert r.json()["config"] == cfg

    def test_patch_missing_returns_404(self):
        r = self.session.patch(
            f"{API}/admin/homepage/no-such-id",
            json={"label": "x"},
            timeout=30,
        )
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# Reorder
# ---------------------------------------------------------------------------
class TestReorder:
    ids = []

    @classmethod
    def setup_class(cls):
        s = requests.Session()
        s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
        cls.session = s
        # Snapshot current order (all sections)
        cls.initial = s.get(f"{API}/admin/homepage", timeout=30).json()

    def test_reverse_reorder_and_persistence(self):
        original = self.session.get(f"{API}/admin/homepage", timeout=30).json()
        ids = [s["id"] for s in original]
        reversed_ids = list(reversed(ids))
        r = self.session.post(f"{API}/admin/homepage/reorder", json={"ids": reversed_ids}, timeout=30)
        assert r.status_code == 200
        after = self.session.get(f"{API}/admin/homepage", timeout=30).json()
        new_ids = [s["id"] for s in after]
        assert new_ids == reversed_ids
        # sort_order re-numbered 0..N-1
        orders = [s["sort_order"] for s in after]
        assert orders == list(range(len(orders)))

    def test_restore_original_order(self):
        # restore
        original_ids = [s["id"] for s in self.initial]
        r = self.session.post(f"{API}/admin/homepage/reorder", json={"ids": original_ids}, timeout=30)
        assert r.status_code == 200
        after = self.session.get(f"{API}/admin/homepage", timeout=30).json()
        assert [s["id"] for s in after] == original_ids

    def test_non_admin_cannot_reorder(self):
        u = requests.Session()
        u.post(f"{API}/auth/login", json={"email": USER_EMAIL, "password": USER_PASSWORD}, timeout=30)
        r = u.post(f"{API}/admin/homepage/reorder", json={"ids": []}, timeout=30)
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# Duplicate
# ---------------------------------------------------------------------------
class TestDuplicate:
    created = []

    @classmethod
    def setup_class(cls):
        s = requests.Session()
        s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
        cls.session = s
        r = s.post(f"{API}/admin/homepage", json={"type": "features", "label": "TEST_dup_src", "config": {"items": [{"icon": "shield", "title": "A", "text": "b"}]}}, timeout=30)
        cls.source_id = r.json()["id"]
        cls.created.append(cls.source_id)

    @classmethod
    def teardown_class(cls):
        for sid in cls.created:
            try:
                cls.session.delete(f"{API}/admin/homepage/{sid}", timeout=15)
            except Exception:
                pass

    def test_duplicate_creates_copy_at_end(self):
        before = self.session.get(f"{API}/admin/homepage", timeout=30).json()
        max_order = max(s["sort_order"] for s in before)
        r = self.session.post(f"{API}/admin/homepage/{self.source_id}/duplicate", timeout=30)
        assert r.status_code == 200
        copy = r.json()
        assert copy["id"] != self.source_id
        assert copy["label"] == "TEST_dup_src (kopia)"
        assert copy["type"] == "features"
        assert copy["config"] == {"items": [{"icon": "shield", "title": "A", "text": "b"}]}
        assert copy["sort_order"] == max_order + 1
        TestDuplicate.created.append(copy["id"])

    def test_duplicate_missing_returns_404(self):
        r = self.session.post(f"{API}/admin/homepage/no-such-id/duplicate", timeout=30)
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------
class TestDelete:
    def test_delete_and_verify(self):
        s = requests.Session()
        s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
        # Create
        r = s.post(f"{API}/admin/homepage", json={"type": "text_block", "label": "TEST_del_me"}, timeout=30)
        sid = r.json()["id"]
        # Delete
        r = s.delete(f"{API}/admin/homepage/{sid}", timeout=30)
        assert r.status_code == 200
        # Verify gone
        all_after = s.get(f"{API}/admin/homepage", timeout=30).json()
        assert not any(x["id"] == sid for x in all_after)

    def test_delete_missing_returns_404(self):
        s = requests.Session()
        s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
        r = s.delete(f"{API}/admin/homepage/no-such-id", timeout=30)
        assert r.status_code == 404

    def test_non_admin_cannot_delete(self, user_session, admin_session):
        r = admin_session.post(f"{API}/admin/homepage", json={"type": "text_block", "label": "TEST_del_perm"}, timeout=30)
        sid = r.json()["id"]
        try:
            r = user_session.delete(f"{API}/admin/homepage/{sid}", timeout=30)
            assert r.status_code == 403
        finally:
            admin_session.delete(f"{API}/admin/homepage/{sid}", timeout=15)


# ---------------------------------------------------------------------------
# Privacy: hidden sections
# ---------------------------------------------------------------------------
class TestPrivacy:
    def test_hidden_section_hidden_from_public(self, admin_session, public_session):
        # Create hidden section
        r = admin_session.post(
            f"{API}/admin/homepage",
            json={"type": "text_block", "label": "TEST_hidden_priv", "is_visible": False, "config": {"title": "Hidden"}},
            timeout=30,
        )
        sid = r.json()["id"]
        try:
            pub = public_session.get(f"{API}/homepage", timeout=30).json()
            assert not any(x["id"] == sid for x in pub), "hidden section leaked to public GET"
            adm = admin_session.get(f"{API}/admin/homepage", timeout=30).json()
            assert any(x["id"] == sid for x in adm), "hidden section missing from admin GET"

            # Toggle visible and re-check public
            admin_session.patch(f"{API}/admin/homepage/{sid}", json={"is_visible": True}, timeout=30)
            pub2 = public_session.get(f"{API}/homepage", timeout=30).json()
            assert any(x["id"] == sid for x in pub2), "section did not re-appear in public after toggle"
        finally:
            admin_session.delete(f"{API}/admin/homepage/{sid}", timeout=15)

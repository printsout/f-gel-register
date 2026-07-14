"""Backend tests for CMS content pages (iteration 5).

Covers:
- Seed: exactly 7 default pages present with expected slugs.
- Public list GET /api/content (excludes content body).
- Public detail GET /api/content/{slug} (only if published, 404 if unpublished or missing).
- Admin GET /api/admin/content returns all pages (incl. unpublished).
- Non-admin gets 403 on admin endpoints.
- POST /api/admin/content normalises slug and rejects duplicates.
- PATCH /api/admin/content/{id} updates fields but cannot change slug.
- DELETE /api/admin/content/{id} removes page.
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

EXPECTED_SLUGS = {
    "om-oss",
    "kontakt",
    "faq",
    "kopvillkor",
    "returer",
    "frakt-leverans",
    "integritetspolicy",
}


# ----- fixtures -----
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
def created_pages(admin_session):
    """Collect ids of any TEST_-prefixed pages created during tests for cleanup."""
    created = []
    yield created
    # Teardown: delete all
    for pid in created:
        try:
            admin_session.delete(f"{API}/admin/content/{pid}", timeout=15)
        except Exception:
            pass


# ----- seed verification -----
class TestSeededPages:
    def test_admin_list_has_all_seeded_pages(self, admin_session):
        r = admin_session.get(f"{API}/admin/content", timeout=30)
        assert r.status_code == 200
        pages = r.json()
        assert isinstance(pages, list)
        slugs = {p["slug"] for p in pages}
        missing = EXPECTED_SLUGS - slugs
        assert not missing, f"Missing seeded slugs: {missing}. Got: {slugs}"

    def test_public_list_returns_only_published_without_body(self, admin_session):
        r = requests.get(f"{API}/content", timeout=30)
        assert r.status_code == 200
        pages = r.json()
        assert isinstance(pages, list)
        assert len(pages) >= 7
        for p in pages:
            assert p.get("is_published") is True
            assert "content" not in p, "public list should NOT include content body"
            assert "id" in p and "slug" in p and "title" in p

    @pytest.mark.parametrize("slug", sorted(EXPECTED_SLUGS))
    def test_public_page_returns_content(self, slug):
        r = requests.get(f"{API}/content/{slug}", timeout=30)
        assert r.status_code == 200, f"slug {slug} returned {r.status_code}"
        body = r.json()
        assert body["slug"] == slug
        assert isinstance(body.get("content"), str)
        assert len(body["content"]) > 0
        assert body.get("is_published") is True

    def test_public_page_nonexistent_returns_404(self):
        r = requests.get(f"{API}/content/this-does-not-exist-xyz", timeout=30)
        assert r.status_code == 404


# ----- admin endpoints permissions -----
class TestAdminPermissions:
    def test_non_admin_cannot_list_admin_content(self, user_session):
        r = user_session.get(f"{API}/admin/content", timeout=30)
        assert r.status_code == 403

    def test_non_admin_cannot_create(self, user_session):
        r = user_session.post(
            f"{API}/admin/content",
            json={"slug": "TEST_should-not-create", "title": "TEST_x", "content": ""},
            timeout=30,
        )
        assert r.status_code == 403

    def test_unauthenticated_cannot_list_admin(self):
        r = requests.get(f"{API}/admin/content", timeout=30)
        assert r.status_code in (401, 403)


# ----- create / update / delete -----
class TestContentCRUD:
    def test_create_normalises_slug(self, admin_session, created_pages):
        payload = {
            "slug": "  TEST_ Åtta Ölar & Öar  ",
            "title": "TEST_Åtta Ölar",
            "content": "# Hej\n\nInnehåll här.",
            "is_published": True,
        }
        r = admin_session.post(f"{API}/admin/content", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        created_pages.append(data["id"])
        # åä→a, ö→o, spaces & special chars→-, no double dashes
        assert data["slug"].startswith("test-atta-olar"), f"Slug was: {data['slug']}"
        assert "--" not in data["slug"]
        assert data["slug"] == data["slug"].lower()
        assert data["title"] == payload["title"]
        assert data["content"] == payload["content"]

    def test_create_duplicate_slug_returns_400(self, admin_session, created_pages):
        payload = {"slug": "TEST_dup", "title": "TEST_First", "content": "x"}
        r1 = admin_session.post(f"{API}/admin/content", json=payload, timeout=30)
        assert r1.status_code == 200
        created_pages.append(r1.json()["id"])
        r2 = admin_session.post(f"{API}/admin/content", json=payload, timeout=30)
        assert r2.status_code == 400
        assert "slug" in r2.text.lower() or "finns" in r2.text.lower()

    def test_patch_updates_title_content_publish(self, admin_session, created_pages):
        # create
        r = admin_session.post(
            f"{API}/admin/content",
            json={"slug": "TEST_patch-me", "title": "TEST_before", "content": "before", "is_published": True},
            timeout=30,
        )
        assert r.status_code == 200
        pid = r.json()["id"]
        created_pages.append(pid)

        # patch
        r2 = admin_session.patch(
            f"{API}/admin/content/{pid}",
            json={"title": "TEST_after", "content": "after body", "is_published": False},
            timeout=30,
        )
        assert r2.status_code == 200
        updated = r2.json()
        assert updated["title"] == "TEST_after"
        assert updated["content"] == "after body"
        assert updated["is_published"] is False
        # slug unchanged (normalisation converts underscore→dash on create)
        assert updated["slug"] == "test-patch-me"

    def test_patch_does_not_change_slug(self, admin_session, created_pages):
        r = admin_session.post(
            f"{API}/admin/content",
            json={"slug": "TEST_slug-locked", "title": "TEST_x", "content": "x"},
            timeout=30,
        )
        assert r.status_code == 200
        pid = r.json()["id"]
        original_slug = r.json()["slug"]
        created_pages.append(pid)

        # Attempt to change slug via patch — API accepts (ignored) because ContentPageUpdate has no slug field.
        r2 = admin_session.patch(
            f"{API}/admin/content/{pid}",
            json={"slug": "TEST_changed-slug", "title": "TEST_y"},
            timeout=30,
        )
        assert r2.status_code == 200
        assert r2.json()["slug"] == original_slug, "slug must not change via PATCH"

    def test_unpublished_returns_404_on_public_detail(self, admin_session, created_pages):
        r = admin_session.post(
            f"{API}/admin/content",
            json={"slug": "TEST_draft-page", "title": "TEST_draft", "content": "hidden", "is_published": False},
            timeout=30,
        )
        assert r.status_code == 200
        pid = r.json()["id"]
        slug = r.json()["slug"]
        created_pages.append(pid)

        r_pub = requests.get(f"{API}/content/{slug}", timeout=30)
        assert r_pub.status_code == 404, "Unpublished pages must be 404 on public detail"

        # Public list also should not include it
        r_list = requests.get(f"{API}/content", timeout=30)
        assert r_list.status_code == 200
        slugs = {p["slug"] for p in r_list.json()}
        assert slug not in slugs

    def test_delete_removes_page(self, admin_session):
        r = admin_session.post(
            f"{API}/admin/content",
            json={"slug": "TEST_to-delete", "title": "TEST_del", "content": "bye", "is_published": True},
            timeout=30,
        )
        assert r.status_code == 200
        pid = r.json()["id"]
        slug = r.json()["slug"]

        rd = admin_session.delete(f"{API}/admin/content/{pid}", timeout=30)
        assert rd.status_code == 200

        r_pub = requests.get(f"{API}/content/{slug}", timeout=30)
        assert r_pub.status_code == 404

    def test_non_admin_cannot_delete(self, admin_session, user_session, created_pages):
        r = admin_session.post(
            f"{API}/admin/content",
            json={"slug": "TEST_no-del", "title": "TEST_x", "content": "x"},
            timeout=30,
        )
        assert r.status_code == 200
        pid = r.json()["id"]
        created_pages.append(pid)

        rd = user_session.delete(f"{API}/admin/content/{pid}", timeout=30)
        assert rd.status_code == 403


# ----- regression: ordering /content vs /content/{slug} -----
class TestRoutingRegression:
    def test_list_endpoint_still_works_after_detail_registered(self):
        r = requests.get(f"{API}/content", timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_detail_uppercase_slug_is_normalised(self):
        # Fetch existing seeded page using upper-case + Swedish letters variant.
        r = requests.get(f"{API}/content/OM-OSS", timeout=30)
        # normalisation lower-cases it → should hit om-oss
        assert r.status_code == 200
        assert r.json()["slug"] == "om-oss"

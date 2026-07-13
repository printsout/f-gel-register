"""Iteration 3: Community posts moderation flow tests.

Covers:
- POST /api/posts (auth required, pending status, image cap)
- POST /api/posts bird_id validation (own bird / non-existent / other user's / admin)
- GET /api/posts (public, approved only)
- GET /api/my-posts (auth, all statuses)
- DELETE /api/posts/{id} (own/other/admin)
- Admin moderation: GET /api/admin/posts, approve, reject, delete
- Admin stats updated with pending_posts/approved_posts
"""

import os
import uuid
import pytest
import requests

BASE_URL = (
    os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
    if os.environ.get("REACT_APP_BACKEND_URL")
    else "https://admin-enhance-parrot.preview.emergentagent.com"
)
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@papegojregistret.se"
ADMIN_PASSWORD = "Admin123!"
USER_EMAIL = "test@papegojregistret.se"
USER_PASSWORD = "Test123!"

TINY_PNG = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
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


@pytest.fixture(scope="module")
def other_user_session():
    s = requests.Session()
    email = f"TEST_postuser_{uuid.uuid4().hex[:8]}@example.com"
    r = s.post(
        f"{API}/auth/register",
        json={"email": email, "password": "Testtest1", "first_name": "Other", "last_name": "Poster"},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def user_bird_id(user_session):
    birds = user_session.get(f"{API}/my-birds", timeout=15).json()
    assert isinstance(birds, list) and len(birds) >= 1
    return birds[0]["id"]


# ---------------------------------------------------------------------------
# Create posts
# ---------------------------------------------------------------------------
class TestCreatePost:
    def test_create_requires_auth(self):
        r = requests.post(f"{API}/posts", json={"title": "T", "content": "C"}, timeout=15)
        assert r.status_code == 401

    def test_create_minimal_ok(self, user_session):
        payload = {"title": "TEST post no bird", "content": "Hej papegoja", "image_urls": []}
        r = user_session.post(f"{API}/posts", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["status"] == "pending"
        assert b["title"] == "TEST post no bird"
        assert b["author_email"] == USER_EMAIL
        assert b["user_id"]
        assert b["bird_id"] is None
        assert b["bird_species"] is None
        assert b["image_urls"] == []

    def test_create_with_own_bird(self, user_session, user_bird_id):
        r = user_session.post(f"{API}/posts", json={
            "bird_id": user_bird_id,
            "title": "TEST post with bird",
            "content": "Med min fågel",
            "image_urls": [TINY_PNG],
        }, timeout=15)
        assert r.status_code == 200
        b = r.json()
        assert b["bird_id"] == user_bird_id
        assert b["bird_species"]
        assert b["image_urls"] == [TINY_PNG]
        assert b["status"] == "pending"

    def test_create_with_nonexistent_bird_404(self, user_session):
        r = user_session.post(f"{API}/posts", json={
            "bird_id": "nonexistent-id",
            "title": "T",
            "content": "C",
        }, timeout=15)
        assert r.status_code == 404

    def test_create_with_others_bird_forbidden(self, other_user_session, user_bird_id):
        r = other_user_session.post(f"{API}/posts", json={
            "bird_id": user_bird_id,
            "title": "TEST hijack",
            "content": "not my bird",
        }, timeout=15)
        assert r.status_code == 403

    def test_admin_can_create_for_anyone(self, admin_session, user_bird_id):
        r = admin_session.post(f"{API}/posts", json={
            "bird_id": user_bird_id,
            "title": "TEST admin post",
            "content": "admin posting for user bird",
        }, timeout=15)
        assert r.status_code == 200
        assert r.json()["bird_id"] == user_bird_id

    def test_max_8_images(self, user_session):
        r = user_session.post(f"{API}/posts", json={
            "title": "TEST too many",
            "content": "x",
            "image_urls": [TINY_PNG] * 9,
        }, timeout=15)
        assert r.status_code == 400
        assert "8" in r.json().get("detail", "")


# ---------------------------------------------------------------------------
# Public GET /api/posts - approved only
# ---------------------------------------------------------------------------
class TestPublicPosts:
    def test_pending_not_public(self, user_session):
        r = user_session.post(f"{API}/posts", json={
            "title": f"TEST pending {uuid.uuid4().hex[:6]}",
            "content": "should be hidden",
        }, timeout=15)
        assert r.status_code == 200
        pid = r.json()["id"]

        r2 = requests.get(f"{API}/posts", timeout=15)
        assert r2.status_code == 200
        posts = r2.json()
        assert isinstance(posts, list)
        for p in posts:
            assert p["status"] == "approved"
        assert not any(p["id"] == pid for p in posts)

    def test_public_hides_moderator_fields(self):
        r = requests.get(f"{API}/posts", timeout=15)
        for p in r.json():
            assert "moderated_by" not in p
            assert "moderated_by_email" not in p


# ---------------------------------------------------------------------------
# GET /api/my-posts
# ---------------------------------------------------------------------------
class TestMyPosts:
    def test_my_posts_requires_auth(self):
        r = requests.get(f"{API}/my-posts", timeout=15)
        assert r.status_code == 401

    def test_my_posts_returns_own(self, user_session):
        r = user_session.get(f"{API}/my-posts", timeout=15)
        assert r.status_code == 200
        posts = r.json()
        assert isinstance(posts, list)
        me = user_session.get(f"{API}/auth/me", timeout=15).json()
        for p in posts:
            assert p["user_id"] == me["user_id"]
        # At least one pending from earlier
        assert any(p["status"] == "pending" for p in posts)


# ---------------------------------------------------------------------------
# Delete own post
# ---------------------------------------------------------------------------
class TestDeletePost:
    def test_owner_can_delete(self, user_session):
        r = user_session.post(f"{API}/posts", json={"title": "TEST del", "content": "x"}, timeout=15)
        pid = r.json()["id"]
        rd = user_session.delete(f"{API}/posts/{pid}", timeout=15)
        assert rd.status_code == 200
        # Verify gone from my-posts
        mine = user_session.get(f"{API}/my-posts", timeout=15).json()
        assert not any(p["id"] == pid for p in mine)

    def test_other_user_cannot_delete(self, user_session, other_user_session):
        r = user_session.post(f"{API}/posts", json={"title": "TEST noDelByOther", "content": "x"}, timeout=15)
        pid = r.json()["id"]
        rd = other_user_session.delete(f"{API}/posts/{pid}", timeout=15)
        assert rd.status_code == 403

    def test_admin_can_delete_any(self, user_session, admin_session):
        r = user_session.post(f"{API}/posts", json={"title": "TEST adminDel", "content": "x"}, timeout=15)
        pid = r.json()["id"]
        rd = admin_session.delete(f"{API}/posts/{pid}", timeout=15)
        assert rd.status_code == 200


# ---------------------------------------------------------------------------
# Admin moderation
# ---------------------------------------------------------------------------
class TestAdminModeration:
    def test_admin_list_all(self, admin_session):
        r = admin_session.get(f"{API}/admin/posts", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_non_admin_forbidden(self, user_session):
        r = user_session.get(f"{API}/admin/posts", timeout=15)
        assert r.status_code == 403

    def test_admin_list_pending_filter(self, admin_session):
        r = admin_session.get(f"{API}/admin/posts", params={"status": "pending"}, timeout=15)
        assert r.status_code == 200
        for p in r.json():
            assert p["status"] == "pending"

    def test_approve_flow(self, user_session, admin_session):
        # Create pending
        r = user_session.post(f"{API}/posts", json={
            "title": f"TEST approve {uuid.uuid4().hex[:6]}",
            "content": "content for approval",
        }, timeout=15)
        pid = r.json()["id"]

        # Not in public yet
        pub = requests.get(f"{API}/posts", timeout=15).json()
        assert not any(p["id"] == pid for p in pub)

        # Approve
        ra = admin_session.post(f"{API}/admin/posts/{pid}/approve", timeout=15)
        assert ra.status_code == 200

        # Now appears public
        pub2 = requests.get(f"{API}/posts", timeout=15).json()
        found = [p for p in pub2 if p["id"] == pid]
        assert len(found) == 1
        assert found[0]["status"] == "approved"

        # Admin sees moderated_by fields
        admin_view = admin_session.get(f"{API}/admin/posts", params={"status": "approved"}, timeout=15).json()
        target = next((p for p in admin_view if p["id"] == pid), None)
        assert target is not None
        assert target["moderated_by_email"] == ADMIN_EMAIL
        assert target["moderated_at"]

    def test_reject_flow(self, user_session, admin_session):
        r = user_session.post(f"{API}/posts", json={
            "title": f"TEST reject {uuid.uuid4().hex[:6]}",
            "content": "content for rejection",
        }, timeout=15)
        pid = r.json()["id"]

        rj = admin_session.post(f"{API}/admin/posts/{pid}/reject", json={"reason": "Ej relevant"}, timeout=15)
        assert rj.status_code == 200

        # Not in public
        pub = requests.get(f"{API}/posts", timeout=15).json()
        assert not any(p["id"] == pid for p in pub)

        # User sees rejected in my-posts with reason
        mine = user_session.get(f"{API}/my-posts", timeout=15).json()
        target = next((p for p in mine if p["id"] == pid), None)
        assert target is not None
        assert target["status"] == "rejected"
        assert target["reject_reason"] == "Ej relevant"

    def test_approve_missing_404(self, admin_session):
        r = admin_session.post(f"{API}/admin/posts/nonexistent-xyz/approve", timeout=15)
        assert r.status_code == 404

    def test_admin_delete_post(self, user_session, admin_session):
        r = user_session.post(f"{API}/posts", json={"title": "TEST admdel", "content": "x"}, timeout=15)
        pid = r.json()["id"]
        rd = admin_session.delete(f"{API}/admin/posts/{pid}", timeout=15)
        assert rd.status_code == 200


# ---------------------------------------------------------------------------
# Admin stats includes pending_posts / approved_posts
# ---------------------------------------------------------------------------
class TestAdminStats:
    def test_stats_has_post_counts(self, admin_session):
        r = admin_session.get(f"{API}/admin/stats", timeout=15)
        assert r.status_code == 200
        b = r.json()
        assert "pending_posts" in b
        assert "approved_posts" in b
        assert isinstance(b["pending_posts"], int)
        assert isinstance(b["approved_posts"], int)

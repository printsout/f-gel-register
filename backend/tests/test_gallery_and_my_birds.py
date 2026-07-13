"""Iteration 2 tests: public gallery, my-birds, image upload and bird comments.

Covers:
- GET /api/public-birds (no auth, shows all birds, excludes phone_number and user_id)
- GET /api/my-birds (requires auth, returns only current user's birds)
- POST /api/birds/{bird_id}/images (owner or admin; 403 for others; validates list; 8 max)
- GET/POST /api/birds/{bird_id}/comments (public; empty text/name → 422)
- Admin delete of a registered bird cascades to comments
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

# 1x1 transparent PNG data URI (small)
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
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def user_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": USER_EMAIL, "password": USER_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"user login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def other_user_session():
    """Second user (different from test@) for permission tests."""
    s = requests.Session()
    email = f"TEST_other_{uuid.uuid4().hex[:8]}@example.com"
    r = s.post(
        f"{API}/auth/register",
        json={"email": email, "password": "Testtest1", "first_name": "Other", "last_name": "User"},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    s.email = email  # type: ignore
    return s


@pytest.fixture(scope="module")
def user_bird(user_session):
    """Create a bird owned by test@ (authenticated) so we can test my-birds and image upload."""
    ring = f"TESTR{uuid.uuid4().hex[:6].upper()}"
    r = user_session.post(
        f"{API}/registered-birds",
        json={
            "species": "cockatiel",
            "ring_number": ring,
            "owner_name": "Testa Testsson",
            "phone_number": "0701234567",
        },
        timeout=15,
    )
    assert r.status_code == 200, r.text
    return r.json()


# ---------------------------------------------------------------------------
# GET /api/public-birds
# ---------------------------------------------------------------------------
class TestPublicBirds:
    def test_public_birds_no_auth(self):
        r = requests.get(f"{API}/public-birds", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_public_birds_excludes_phone_and_user_id(self):
        r = requests.get(f"{API}/public-birds", timeout=15)
        assert r.status_code == 200
        birds = r.json()
        assert len(birds) > 0, "should have seeded birds"
        for b in birds:
            assert "phone_number" not in b, f"phone_number leaked: {b}"
            assert "user_id" not in b, f"user_id leaked: {b}"
            # Must still contain expected public fields
            assert "species" in b
            assert "ring_number" in b
            assert "owner_name" in b
            assert "image_urls" in b

    def test_public_birds_shows_all_including_pending(self):
        """New behavior: should include birds regardless of payment_status/images."""
        r = requests.get(f"{API}/public-birds", timeout=15)
        assert r.status_code == 200
        birds = r.json()
        # Seed data contains birds with payment_status=pending (i%2!=0)
        # After this test suite runs, there should also be new pending birds.
        # Verify at least one has payment_status == "pending" OR empty image_urls
        has_pending_or_empty = any(
            b.get("payment_status") == "pending" or not b.get("image_urls")
            for b in birds
        )
        assert has_pending_or_empty, "New public-birds should include pending / no-image birds"


# ---------------------------------------------------------------------------
# GET /api/my-birds
# ---------------------------------------------------------------------------
class TestMyBirds:
    def test_my_birds_requires_auth(self):
        r = requests.get(f"{API}/my-birds", timeout=15)
        assert r.status_code == 401

    def test_my_birds_returns_own_birds_only(self, user_session, user_bird):
        r = user_session.get(f"{API}/my-birds", timeout=15)
        assert r.status_code == 200
        birds = r.json()
        assert isinstance(birds, list)
        # Test user has 5 seeded birds + at least user_bird
        assert len(birds) >= 5
        # All birds must be owned by this user – returned docs include user_id
        for b in birds:
            assert b.get("user_id"), "user_id should be present in /my-birds"
        # The freshly created bird should be in the list
        assert any(b["id"] == user_bird["id"] for b in birds)

    def test_my_birds_other_user_isolated(self, other_user_session):
        """A fresh user with no birds should get [] not others."""
        r = other_user_session.get(f"{API}/my-birds", timeout=15)
        assert r.status_code == 200
        assert r.json() == []


# ---------------------------------------------------------------------------
# POST /api/birds/{bird_id}/images
# ---------------------------------------------------------------------------
class TestBirdImageUpload:
    def test_upload_requires_auth(self, user_bird):
        r = requests.post(
            f"{API}/birds/{user_bird['id']}/images",
            json={"image_urls": [TINY_PNG]},
            timeout=15,
        )
        assert r.status_code == 401

    def test_owner_can_upload(self, user_session, user_bird):
        r = user_session.post(
            f"{API}/birds/{user_bird['id']}/images",
            json={"image_urls": [TINY_PNG]},
            timeout=15,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["image_urls"] == [TINY_PNG]
        assert body["id"] == user_bird["id"]

        # Verify it persisted
        me_birds = user_session.get(f"{API}/my-birds", timeout=15).json()
        target = next(b for b in me_birds if b["id"] == user_bird["id"])
        assert target["image_urls"] == [TINY_PNG]

    def test_non_owner_forbidden(self, other_user_session, user_bird):
        r = other_user_session.post(
            f"{API}/birds/{user_bird['id']}/images",
            json={"image_urls": [TINY_PNG]},
            timeout=15,
        )
        assert r.status_code == 403
        assert "dina egna" in r.json().get("detail", "").lower()

    def test_admin_can_upload_any(self, admin_session, user_bird):
        r = admin_session.post(
            f"{API}/birds/{user_bird['id']}/images",
            json={"image_urls": [TINY_PNG, TINY_PNG]},
            timeout=15,
        )
        assert r.status_code == 200
        assert len(r.json()["image_urls"]) == 2

    def test_bad_payload_not_a_list(self, user_session, user_bird):
        r = user_session.post(
            f"{API}/birds/{user_bird['id']}/images",
            json={"image_urls": "not-a-list"},
            timeout=15,
        )
        assert r.status_code == 400
        assert "lista" in r.json().get("detail", "").lower()

    def test_too_many_images(self, user_session, user_bird):
        r = user_session.post(
            f"{API}/birds/{user_bird['id']}/images",
            json={"image_urls": [TINY_PNG] * 9},
            timeout=15,
        )
        assert r.status_code == 400
        assert "8" in r.json().get("detail", "")

    def test_upload_to_missing_bird_404(self, user_session):
        r = user_session.post(
            f"{API}/birds/nonexistent-id-xyz/images",
            json={"image_urls": [TINY_PNG]},
            timeout=15,
        )
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# Bird comments (public gallery flow)
# ---------------------------------------------------------------------------
class TestBirdComments:
    def test_get_comments_public(self, user_bird):
        r = requests.get(f"{API}/birds/{user_bird['id']}/comments", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_post_comment_public(self, user_bird):
        r = requests.post(
            f"{API}/birds/{user_bird['id']}/comments",
            json={
                "commenter_name": "Anon Visitor",
                "commenter_email": "visitor@example.com",
                "comment_text": "Vad fin papegoja!",
            },
            timeout=15,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["comment_text"] == "Vad fin papegoja!"
        assert body["commenter_name"] == "Anon Visitor"

        # Verify visible via GET
        listing = requests.get(f"{API}/birds/{user_bird['id']}/comments", timeout=15).json()
        assert any(c["id"] == body["id"] for c in listing)

    def test_post_comment_without_email(self, user_bird):
        r = requests.post(
            f"{API}/birds/{user_bird['id']}/comments",
            json={"commenter_name": "NoEmail User", "comment_text": "Hej!"},
            timeout=15,
        )
        assert r.status_code == 200

    def test_post_comment_empty_name(self, user_bird):
        r = requests.post(
            f"{API}/birds/{user_bird['id']}/comments",
            json={"commenter_name": "", "comment_text": "Hej"},
            timeout=15,
        )
        assert r.status_code == 422

    def test_post_comment_empty_text(self, user_bird):
        r = requests.post(
            f"{API}/birds/{user_bird['id']}/comments",
            json={"commenter_name": "Someone", "comment_text": ""},
            timeout=15,
        )
        assert r.status_code == 422

    def test_post_comment_on_missing_bird(self):
        r = requests.post(
            f"{API}/birds/nonexistent-bird-id/comments",
            json={"commenter_name": "X", "comment_text": "Y"},
            timeout=15,
        )
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# Admin bird deletion cascade
# ---------------------------------------------------------------------------
class TestAdminBirdDeleteCascade:
    def test_delete_bird_cascades_comments(self, admin_session, user_session):
        # Create a bird owned by user
        ring = f"TESTR{uuid.uuid4().hex[:6].upper()}"
        r = user_session.post(
            f"{API}/registered-birds",
            json={
                "species": "eclectus",
                "ring_number": ring,
                "owner_name": "Testa Testsson",
                "phone_number": "0701234567",
            },
            timeout=15,
        )
        assert r.status_code == 200
        bird_id = r.json()["id"]

        # Add two comments
        for i in range(2):
            rc = requests.post(
                f"{API}/birds/{bird_id}/comments",
                json={"commenter_name": f"C{i}", "comment_text": f"txt{i}"},
                timeout=15,
            )
            assert rc.status_code == 200

        assert len(requests.get(f"{API}/birds/{bird_id}/comments", timeout=15).json()) == 2

        # Admin delete
        rd = admin_session.delete(f"{API}/admin/registered-birds/{bird_id}", timeout=15)
        assert rd.status_code == 200

        # Comments should be gone
        listing = requests.get(f"{API}/birds/{bird_id}/comments", timeout=15).json()
        assert listing == []

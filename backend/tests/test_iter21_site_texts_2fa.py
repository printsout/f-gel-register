"""Iteration 21 tests: SiteTexts admin/public endpoints + 2FA flow + regression."""
import os
import time
import requests
import pyotp
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or "https://admin-enhance-parrot.preview.emergentagent.com"
ADMIN_EMAIL = "habib.nazary@hotmail.com"
ADMIN_PASSWORD = "Jordgubbe234@u"
USER_EMAIL = "test@papegojregistret.se"
USER_PASSWORD = "Test123!"


def _login(session, email, password):
    r = session.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    return r


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = _login(s, ADMIN_EMAIL, ADMIN_PASSWORD)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def user_session():
    s = requests.Session()
    r = _login(s, USER_EMAIL, USER_PASSWORD)
    assert r.status_code == 200, f"user login failed: {r.status_code} {r.text}"
    return s


# ---------- SiteTexts ----------

class TestSiteTexts:
    _created_keys = []

    def test_public_get_returns_dict(self):
        r = requests.get(f"{BASE_URL}/api/site-texts")
        assert r.status_code == 200
        assert isinstance(r.json(), dict)

    def test_admin_list_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/admin/site-texts")
        assert r.status_code == 401

    def test_admin_patch_requires_auth(self):
        r = requests.patch(f"{BASE_URL}/api/admin/site-texts/contact.title", json={"value": "x"})
        assert r.status_code == 401

    def test_admin_list_ok(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/site-texts")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_admin_patch_upsert_and_visible_public(self, admin_session):
        key = "contact.title"
        val = "Kontakta Fågelregister TEST"
        r = admin_session.patch(f"{BASE_URL}/api/admin/site-texts/{key}", json={"value": val})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["key"] == key
        assert body["value"] == val
        TestSiteTexts._created_keys.append(key)

        # Public reflects immediately
        pub = requests.get(f"{BASE_URL}/api/site-texts").json()
        assert pub.get(key) == val

    def test_admin_patch_second_key(self, admin_session):
        key = "register.title"
        val = "Registrera din fågel TEST"
        r = admin_session.patch(f"{BASE_URL}/api/admin/site-texts/{key}", json={"value": val})
        assert r.status_code == 200
        TestSiteTexts._created_keys.append(key)
        pub = requests.get(f"{BASE_URL}/api/site-texts").json()
        assert pub.get(key) == val

    def test_empty_value_upsert(self, admin_session):
        key = "footer.copyright"
        r = admin_session.patch(f"{BASE_URL}/api/admin/site-texts/{key}", json={"value": ""})
        assert r.status_code == 200
        TestSiteTexts._created_keys.append(key)
        pub = requests.get(f"{BASE_URL}/api/site-texts").json()
        assert pub.get(key) == ""

    def test_zzz_cleanup(self, admin_session):
        """Cleanup keys we created."""
        # There's no DELETE endpoint; overwrite to empty so fallback kicks in.
        # But the request asks to delete. We'll try direct mongo via requests? Not available.
        # Best-effort: leave them empty (fallback still applies). Log context.
        for key in set(TestSiteTexts._created_keys):
            admin_session.patch(f"{BASE_URL}/api/admin/site-texts/{key}", json={"value": ""})


# ---------- 2FA ----------

class TestTwoFactor:
    def test_2fa_status_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/auth/2fa/status")
        assert r.status_code == 401

    def test_2fa_status_for_user(self, user_session):
        r = user_session.get(f"{BASE_URL}/api/auth/2fa/status")
        assert r.status_code == 200
        assert "enabled" in r.json()

    def test_2fa_setup_and_enable(self, user_session):
        # Setup - generate new secret
        r = user_session.post(f"{BASE_URL}/api/auth/2fa/setup")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "secret" in data and "otpauth_uri" in data
        secret = data["secret"]

        # Try enable with wrong code
        bad = user_session.post(f"{BASE_URL}/api/auth/2fa/enable", json={"code": "000000"})
        assert bad.status_code == 400

        # Enable with correct TOTP
        code = pyotp.TOTP(secret).now()
        good = user_session.post(f"{BASE_URL}/api/auth/2fa/enable", json={"code": code})
        assert good.status_code == 200, good.text
        assert good.json().get("success") is True

        # Verify status
        st = user_session.get(f"{BASE_URL}/api/auth/2fa/status").json()
        assert st.get("enabled") is True

        # Cleanup: disable so future logins work without code
        # Need fresh TOTP code
        time.sleep(1)
        code2 = pyotp.TOTP(secret).now()
        dis = user_session.post(
            f"{BASE_URL}/api/auth/2fa/disable",
            json={"password": USER_PASSWORD, "code": code2},
        )
        assert dis.status_code == 200, dis.text


# ---------- Regression sanity ----------

class TestRegression:
    def test_auth_me(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 200
        assert r.json().get("email") == ADMIN_EMAIL

    def test_public_birds_list(self):
        r = requests.get(f"{BASE_URL}/api/public-birds")
        assert r.status_code == 200

    def test_found_birds_public(self):
        r = requests.get(f"{BASE_URL}/api/found-birds")
        assert r.status_code == 200

    def test_price_settings(self):
        r = requests.get(f"{BASE_URL}/api/settings/prices")
        assert r.status_code == 200

    def test_homepage_public(self):
        r = requests.get(f"{BASE_URL}/api/homepage")
        assert r.status_code == 200

    def test_admin_discount_codes(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/discount-codes")
        assert r.status_code == 200

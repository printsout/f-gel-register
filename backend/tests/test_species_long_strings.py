"""
Iteration 8 regression tests: verify /api/registered-birds and /api/missing-birds
accept the longer species strings produced by the new SpeciesSelect combobox.
"""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"

# Long species strings taken directly from PARROT_SPECIES groups
LONG_SPECIES_SAMPLES = [
    "Grå papegoja – Kongo (Psittacus erithacus)",
    "Ara – Grönvingad (Ara chloropterus)",
    "Amazon – Blåpannad / Turkos (Amazona aestiva)",
    "Kakadu – Major Mitchell / Leadbeaters (Lophochroa leadbeateri)",
    "Annat / Ej i listan (specificera i beskrivning)",
]


@pytest.fixture
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture
def admin_client(api_client):
    r = api_client.post(f"{API}/auth/login", json={
        "email": "admin@papegojregistret.se",
        "password": "Admin123!",
    })
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text}")
    return api_client  # cookies stored on session


# ---------- REGISTERED BIRDS ----------
class TestRegisteredBirdLongSpecies:
    created_ids = []

    @pytest.mark.parametrize("species", LONG_SPECIES_SAMPLES)
    def test_create_bird_with_long_species(self, api_client, species):
        ring = f"SE{uuid.uuid4().hex[:9].upper()}"
        payload = {
            "species": species,
            "ring_number": ring,
            "owner_name": "TEST_Species_Owner",
            "phone_number": "0701234567",
            "additional_info": "iteration-8 species test",
        }
        r = api_client.post(f"{API}/registered-birds", json=payload)
        assert r.status_code == 200, f"POST failed: {r.status_code} {r.text}"
        data = r.json()
        assert data["species"] == species, f"Species round-trip mismatch: {data['species']!r}"
        assert data["ring_number"] == ring
        assert "id" in data
        assert "_id" not in data  # mongo _id must not leak
        TestRegisteredBirdLongSpecies.created_ids.append((data["id"], ring))

    def test_created_birds_visible_in_admin_list(self, admin_client):
        if not TestRegisteredBirdLongSpecies.created_ids:
            pytest.skip("No birds created yet")
        r = admin_client.get(f"{API}/admin/registered-birds")
        assert r.status_code == 200
        rows = r.json()
        # Some endpoints return {"items":[...]}; handle both
        if isinstance(rows, dict) and "items" in rows:
            rows = rows["items"]
        ring_set = {b["ring_number"] for b in rows}
        for _id, ring in TestRegisteredBirdLongSpecies.created_ids:
            assert ring in ring_set, f"Bird {ring} missing from admin list"

    def test_teardown_cleanup(self, admin_client):
        # Cleanup: delete all created test birds
        for bird_id, _ring in TestRegisteredBirdLongSpecies.created_ids:
            admin_client.delete(f"{API}/admin/registered-birds/{bird_id}")
        TestRegisteredBirdLongSpecies.created_ids.clear()


# ---------- MISSING BIRDS ----------
class TestMissingBirdLongSpecies:
    created_ids = []

    @pytest.mark.parametrize("species", LONG_SPECIES_SAMPLES[:3])
    def test_create_missing_with_long_species(self, api_client, species):
        payload = {
            "owner_name": "TEST_Missing_Owner",
            "contact_phone": "0701234567",
            "species": species,
            "description": "TEST_missing iter-8 long species regression",
            "last_seen_location": "TEST Location",
            "last_seen_date": "2026-01-15",
        }
        r = api_client.post(f"{API}/missing-birds", json=payload)
        assert r.status_code == 200, f"POST /missing-birds failed: {r.status_code} {r.text}"
        data = r.json()
        assert data["species"] == species
        assert "id" in data
        assert "_id" not in data
        TestMissingBirdLongSpecies.created_ids.append(data["id"])

    def test_missing_visible_in_admin_list(self, admin_client):
        if not TestMissingBirdLongSpecies.created_ids:
            pytest.skip("No missing birds created")
        r = admin_client.get(f"{API}/admin/missing-birds")
        assert r.status_code == 200
        rows = r.json()
        if isinstance(rows, dict) and "items" in rows:
            rows = rows["items"]
        id_set = {row["id"] for row in rows}
        for created_id in TestMissingBirdLongSpecies.created_ids:
            assert created_id in id_set, f"Missing bird {created_id} missing from admin list"

    def test_missing_teardown(self, admin_client):
        for mid in TestMissingBirdLongSpecies.created_ids:
            admin_client.delete(f"{API}/admin/missing-birds/{mid}")
        TestMissingBirdLongSpecies.created_ids.clear()


# ---------- ADMIN PAGES REGRESSION (routes still respond) ----------
ADMIN_GET_ROUTES = [
    "/admin/registered-birds",
    "/admin/missing-birds",
    "/admin/menu",
    "/admin/homepage",
    "/admin/content",
    "/admin/posts",
]


@pytest.mark.parametrize("route", ADMIN_GET_ROUTES)
def test_admin_routes_load(admin_client, route):
    r = admin_client.get(f"{API}{route}")
    assert r.status_code == 200, f"{route} → {r.status_code} {r.text[:200]}"

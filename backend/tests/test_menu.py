"""Backend tests for the new navigation menu (top-nav dropdowns) feature.

Covers:
- GET /api/menu (public) — tree, only visible
- GET /api/admin/menu (admin) — flat, includes hidden; non-admin=403
- POST /api/admin/menu — create top-level + child; parent must exist; single-level enforcement
- PATCH /api/admin/menu/{id} — update, prevent self-parent, prevent make-child-of-having-children
- POST /api/admin/menu/reorder — re-numbers 0..N-1 and public reflects it
- DELETE /api/admin/menu/{id} — cascade to children
- Seed structure: 3 tops (Registrera=2, Rapportera=3, Community=3)
- Privacy: hidden items excluded from public, present in admin
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


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"admin login failed: {r.text}"
    return s


@pytest.fixture(scope="module")
def user_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": USER_EMAIL, "password": USER_PASSWORD}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"user login failed: {r.status_code} {r.text}")
    return s


@pytest.fixture(scope="module")
def cleanup_test_items(admin_session):
    created = []
    yield created
    for cid in created:
        try:
            admin_session.delete(f"{API}/admin/menu/{cid}", timeout=10)
        except Exception:
            pass


# -------- Seed / public tree --------
class TestPublicMenu:
    def test_public_menu_tree_shape_and_seed(self):
        r = requests.get(f"{API}/menu", timeout=15)
        assert r.status_code == 200
        tops = r.json()
        assert isinstance(tops, list)
        # Seed check: 3 tops
        labels = {t["label"]: t for t in tops}
        assert "Registrera" in labels
        assert "Rapportera" in labels
        assert "Community" in labels
        # children counts (only among visible=True items)
        assert len(labels["Registrera"]["children"]) == 2
        assert len(labels["Rapportera"]["children"]) == 3
        assert len(labels["Community"]["children"]) == 3
        # All tops must have children[] key even if empty and parent_id None
        for t in tops:
            assert "children" in t and isinstance(t["children"], list)
            assert t.get("parent_id") in (None, "")
            for c in t["children"]:
                assert c.get("parent_id") == t["id"]
                # children have url/label
                assert "url" in c and "label" in c

    def test_public_menu_sorted_by_sort_order(self):
        r = requests.get(f"{API}/menu", timeout=15)
        tops = r.json()
        orders = [t["sort_order"] for t in tops]
        assert orders == sorted(orders)
        for t in tops:
            child_orders = [c["sort_order"] for c in t["children"]]
            assert child_orders == sorted(child_orders)


# -------- Admin listing / auth --------
class TestAdminMenuAuth:
    def test_admin_menu_ok(self, admin_session):
        r = admin_session.get(f"{API}/admin/menu", timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        # seed should give >= 11 items (3 + 2 + 3 + 3)
        assert len(items) >= 11

    def test_admin_menu_non_admin_forbidden(self, user_session):
        r = user_session.get(f"{API}/admin/menu", timeout=15)
        assert r.status_code == 403

    def test_admin_menu_anon(self):
        r = requests.get(f"{API}/admin/menu", timeout=15)
        assert r.status_code in (401, 403)


# -------- CRUD --------
class TestAdminMenuCRUD:
    def test_create_top_level(self, admin_session, cleanup_test_items):
        label = f"TEST_top_{uuid.uuid4().hex[:6]}"
        r = admin_session.post(f"{API}/admin/menu", json={
            "label": label,
            "url": "/test-top",
            "is_visible": True,
        }, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["label"] == label
        assert body["url"] == "/test-top"
        assert body["parent_id"] is None
        assert body["is_visible"] is True
        assert "sort_order" in body and body["sort_order"] >= 0
        assert "id" in body
        # not internal fields
        assert "_id" not in body
        cleanup_test_items.append(body["id"])

    def test_create_child(self, admin_session, cleanup_test_items):
        # first create a parent
        parent_lbl = f"TEST_parent_{uuid.uuid4().hex[:6]}"
        rp = admin_session.post(f"{API}/admin/menu", json={
            "label": parent_lbl, "url": "/p", "is_visible": True,
        }, timeout=15)
        pid = rp.json()["id"]
        cleanup_test_items.append(pid)
        # create child
        child_lbl = f"TEST_child_{uuid.uuid4().hex[:6]}"
        r = admin_session.post(f"{API}/admin/menu", json={
            "label": child_lbl, "url": "/p/c", "parent_id": pid, "is_visible": True,
        }, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["parent_id"] == pid
        cleanup_test_items.append(body["id"])

    def test_create_child_invalid_parent(self, admin_session):
        r = admin_session.post(f"{API}/admin/menu", json={
            "label": "TEST_x", "url": "/x", "parent_id": "does-not-exist", "is_visible": True,
        }, timeout=15)
        assert r.status_code == 400
        assert "verordnat" in r.json()["detail"].lower() or "hittades" in r.json()["detail"].lower()

    def test_single_level_enforcement(self, admin_session, cleanup_test_items):
        # create parent + child; then try creating grandchild
        rp = admin_session.post(f"{API}/admin/menu", json={"label": f"TEST_gp_{uuid.uuid4().hex[:6]}", "url": "/gp", "is_visible": True}, timeout=15)
        pid = rp.json()["id"]; cleanup_test_items.append(pid)
        rc = admin_session.post(f"{API}/admin/menu", json={"label": f"TEST_gc_{uuid.uuid4().hex[:6]}", "url": "/gc", "parent_id": pid, "is_visible": True}, timeout=15)
        cid = rc.json()["id"]; cleanup_test_items.append(cid)
        # attempt to make a grandchild under a child
        rgc = admin_session.post(f"{API}/admin/menu", json={"label": "TEST_deep", "url": "/deep", "parent_id": cid, "is_visible": True}, timeout=15)
        assert rgc.status_code == 400
        assert "niv" in rgc.json()["detail"].lower() or "rullgardin" in rgc.json()["detail"].lower()

    def test_patch_label_and_url(self, admin_session, cleanup_test_items):
        r = admin_session.post(f"{API}/admin/menu", json={"label": "TEST_original", "url": "/o", "is_visible": True}, timeout=15)
        iid = r.json()["id"]; cleanup_test_items.append(iid)
        r2 = admin_session.patch(f"{API}/admin/menu/{iid}", json={"label": "TEST_edited", "url": "/edited"}, timeout=15)
        assert r2.status_code == 200
        body = r2.json()
        assert body["label"] == "TEST_edited"
        assert body["url"] == "/edited"

    def test_patch_self_parent_rejected(self, admin_session, cleanup_test_items):
        r = admin_session.post(f"{API}/admin/menu", json={"label": "TEST_self", "url": "/s", "is_visible": True}, timeout=15)
        iid = r.json()["id"]; cleanup_test_items.append(iid)
        r2 = admin_session.patch(f"{API}/admin/menu/{iid}", json={"parent_id": iid}, timeout=15)
        assert r2.status_code == 400
        assert "överordnade" in r2.json()["detail"].lower() or "kan inte" in r2.json()["detail"].lower()

    def test_patch_make_parent_with_children_a_child_rejected(self, admin_session, cleanup_test_items):
        # Create A (parent) + B (child of A) + C (target top-level for parenting)
        ra = admin_session.post(f"{API}/admin/menu", json={"label": "TEST_A", "url": "/A", "is_visible": True}, timeout=15)
        aid = ra.json()["id"]; cleanup_test_items.append(aid)
        rb = admin_session.post(f"{API}/admin/menu", json={"label": "TEST_B", "url": "/B", "parent_id": aid, "is_visible": True}, timeout=15)
        bid = rb.json()["id"]; cleanup_test_items.append(bid)
        rc = admin_session.post(f"{API}/admin/menu", json={"label": "TEST_C", "url": "/C", "is_visible": True}, timeout=15)
        cid = rc.json()["id"]; cleanup_test_items.append(cid)
        # Try to move A under C — should fail because A has kids
        r = admin_session.patch(f"{API}/admin/menu/{aid}", json={"parent_id": cid}, timeout=15)
        assert r.status_code == 400
        assert "underval" in r.json()["detail"].lower() or "flytta" in r.json()["detail"].lower()

    def test_patch_404(self, admin_session):
        r = admin_session.patch(f"{API}/admin/menu/does-not-exist", json={"label": "x"}, timeout=15)
        assert r.status_code == 404

    def test_toggle_is_visible_reflects_public(self, admin_session, cleanup_test_items):
        r = admin_session.post(f"{API}/admin/menu", json={"label": "TEST_vis", "url": "/vis", "is_visible": True}, timeout=15)
        iid = r.json()["id"]; cleanup_test_items.append(iid)
        # currently visible → should show up in public
        pub = requests.get(f"{API}/menu", timeout=15).json()
        pub_labels = [t["label"] for t in pub]
        assert "TEST_vis" in pub_labels
        # hide it
        admin_session.patch(f"{API}/admin/menu/{iid}", json={"is_visible": False}, timeout=15)
        pub2 = requests.get(f"{API}/menu", timeout=15).json()
        pub2_labels = [t["label"] for t in pub2]
        assert "TEST_vis" not in pub2_labels
        # but present in admin
        adm = admin_session.get(f"{API}/admin/menu", timeout=15).json()
        adm_labels = [t["label"] for t in adm]
        assert "TEST_vis" in adm_labels


# -------- Reorder --------
class TestReorder:
    def test_reorder_top_level(self, admin_session, cleanup_test_items):
        # Create 3 top-level test items, then reverse their order via reorder among themselves
        ids = []
        for i in range(3):
            r = admin_session.post(f"{API}/admin/menu", json={"label": f"TEST_re_{i}_{uuid.uuid4().hex[:4]}", "url": f"/re{i}", "is_visible": True}, timeout=15)
            ids.append(r.json()["id"])
            cleanup_test_items.append(r.json()["id"])
        # Get full admin list, build the current top-level id ordering
        adm = admin_session.get(f"{API}/admin/menu", timeout=15).json()
        top_ids = [it["id"] for it in adm if not it.get("parent_id")]
        # Move our 3 items to the front in reverse order
        new_order = ids[::-1] + [x for x in top_ids if x not in ids]
        r = admin_session.post(f"{API}/admin/menu/reorder", json={"ids": new_order}, timeout=15)
        assert r.status_code == 200
        assert r.json().get("success") is True
        # verify sort_order re-numbered
        adm2 = admin_session.get(f"{API}/admin/menu", timeout=15).json()
        by_id = {it["id"]: it for it in adm2}
        for idx, iid in enumerate(new_order):
            assert by_id[iid]["sort_order"] == idx
        # Verify public GET returns the tops in new order (only the visible ones in new_order sequence)
        pub = requests.get(f"{API}/menu", timeout=15).json()
        pub_ids = [t["id"] for t in pub]
        # Our 3 test items should appear in the reversed order, prior to the rest
        # (all 3 are visible so they should be at start)
        assert pub_ids[:3] == ids[::-1]


# -------- Delete cascade --------
class TestDelete:
    def test_delete_cascades_children(self, admin_session):
        # Create parent + 2 kids
        rp = admin_session.post(f"{API}/admin/menu", json={"label": "TEST_del_p", "url": "/dp", "is_visible": True}, timeout=15)
        pid = rp.json()["id"]
        rc1 = admin_session.post(f"{API}/admin/menu", json={"label": "TEST_del_c1", "url": "/dc1", "parent_id": pid, "is_visible": True}, timeout=15)
        c1 = rc1.json()["id"]
        rc2 = admin_session.post(f"{API}/admin/menu", json={"label": "TEST_del_c2", "url": "/dc2", "parent_id": pid, "is_visible": True}, timeout=15)
        c2 = rc2.json()["id"]
        # Delete parent
        rd = admin_session.delete(f"{API}/admin/menu/{pid}", timeout=15)
        assert rd.status_code == 200
        assert rd.json().get("success") is True
        # Verify all 3 removed
        adm = admin_session.get(f"{API}/admin/menu", timeout=15).json()
        ids = {it["id"] for it in adm}
        assert pid not in ids
        assert c1 not in ids
        assert c2 not in ids

    def test_delete_404(self, admin_session):
        r = admin_session.delete(f"{API}/admin/menu/does-not-exist-{uuid.uuid4().hex}", timeout=15)
        assert r.status_code == 404


# -------- CRUD auth --------
class TestCRUDAuth:
    def test_non_admin_create_forbidden(self, user_session):
        r = user_session.post(f"{API}/admin/menu", json={"label": "x", "url": "/x", "is_visible": True}, timeout=15)
        assert r.status_code == 403

    def test_non_admin_delete_forbidden(self, user_session):
        r = user_session.delete(f"{API}/admin/menu/whatever", timeout=15)
        assert r.status_code == 403

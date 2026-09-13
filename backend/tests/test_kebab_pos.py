"""Backend tests for Kebab Blasan POS - auth, products, toppings, shifts, transactions, dashboard."""
import os
import pytest
import requests

BASE_URL = "https://kebab-blasan-pos.preview.emergentagent.com".rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    ses = requests.Session()
    ses.headers.update({"Content-Type": "application/json"})
    return ses


@pytest.fixture(scope="module")
def cashier_auth(s):
    r = s.post(f"{API}/auth/login-pin", json={"pin": "1234"})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def admin_auth(s):
    r = s.post(f"{API}/auth/login-admin", json={"email": "admin@kebabblasan.id", "password": "admin123"})
    assert r.status_code == 200, r.text
    return r.json()


# --- Auth ---
class TestAuth:
    def test_login_pin_ok(self, cashier_auth):
        assert cashier_auth["role"] == "cashier"
        assert cashier_auth["token"]

    def test_login_pin_wrong(self, s):
        r = s.post(f"{API}/auth/login-pin", json={"pin": "0000"})
        assert r.status_code == 401

    def test_login_admin_ok(self, admin_auth):
        assert admin_auth["role"] == "admin"

    def test_login_admin_wrong(self, s):
        r = s.post(f"{API}/auth/login-admin", json={"email": "admin@kebabblasan.id", "password": "wrong"})
        assert r.status_code == 401


# --- Products & Toppings ---
class TestCatalog:
    def test_list_products_seeded(self, s):
        r = s.get(f"{API}/products")
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 6
        cats = {p["category"] for p in data}
        assert {"Kebab", "Snacks", "Beverages"}.issubset(cats)

    def test_list_toppings_seeded(self, s):
        r = s.get(f"{API}/toppings")
        assert r.status_code == 200
        assert len(r.json()) >= 5

    def test_product_crud(self, s):
        payload = {"name": "TEST_Kebab X", "category": "Kebab", "price": 9999, "active": True}
        c = s.post(f"{API}/products", json=payload)
        assert c.status_code == 200
        pid = c.json()["id"]
        # update
        payload["price"] = 11111
        u = s.put(f"{API}/products/{pid}", json=payload)
        assert u.status_code == 200 and u.json()["price"] == 11111
        # verify GET
        g = s.get(f"{API}/products")
        assert any(p["id"] == pid and p["price"] == 11111 for p in g.json())
        # delete
        d = s.delete(f"{API}/products/{pid}")
        assert d.status_code == 200
        g2 = s.get(f"{API}/products")
        assert not any(p["id"] == pid for p in g2.json())

    def test_topping_crud(self, s):
        payload = {"name": "TEST_Top", "price": 500, "available": True}
        c = s.post(f"{API}/toppings", json=payload)
        assert c.status_code == 200
        tid = c.json()["id"]
        payload["price"] = 800
        u = s.put(f"{API}/toppings/{tid}", json=payload)
        assert u.status_code == 200 and u.json()["price"] == 800
        d = s.delete(f"{API}/toppings/{tid}")
        assert d.status_code == 200


# --- Shifts & Transactions ---
class TestShiftAndTxn:
    _shift_id = None
    _txn_id = None

    def test_start_shift(self, s, cashier_auth):
        r = s.post(f"{API}/shifts/start", json={
            "cashier_id": cashier_auth["user_id"],
            "cashier_name": cashier_auth["name"],
            "opening_cash": 100000,
        })
        assert r.status_code == 200
        TestShiftAndTxn._shift_id = r.json()["id"]
        assert r.json()["status"] == "open"

    def test_active_shift(self, s, cashier_auth):
        r = s.get(f"{API}/shifts/active", params={"cashier_id": cashier_auth["user_id"]})
        assert r.status_code == 200
        assert r.json() and r.json()["id"] == TestShiftAndTxn._shift_id

    def test_create_transaction(self, s, cashier_auth):
        products = s.get(f"{API}/products").json()
        toppings = s.get(f"{API}/toppings").json()
        p = products[0]
        top = toppings[0]
        line_total = (p["price"] + top["price"]) * 2
        payload = {
            "items": [{
                "product_id": p["id"],
                "product_name": p["name"],
                "base_price": p["price"],
                "toppings": [{"id": top["id"], "name": top["name"], "price": top["price"]}],
                "spice_level": "Medium",
                "notes": "TEST",
                "quantity": 2,
                "line_total": line_total,
            }],
            "subtotal": line_total,
            "discount": 0,
            "total": line_total,
            "payment_method": "cash",
            "cash_received": 100000,
            "change": 100000 - line_total,
            "cashier_id": cashier_auth["user_id"],
            "cashier_name": cashier_auth["name"],
            "shift_id": TestShiftAndTxn._shift_id,
        }
        r = s.post(f"{API}/transactions", json=payload)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["order_no"] and j["total"] == line_total
        TestShiftAndTxn._txn_id = j["id"]

    def test_get_transaction(self, s):
        r = s.get(f"{API}/transactions/{TestShiftAndTxn._txn_id}")
        assert r.status_code == 200
        assert r.json()["id"] == TestShiftAndTxn._txn_id

    def test_list_transactions(self, s):
        r = s.get(f"{API}/transactions")
        assert r.status_code == 200
        assert any(t["id"] == TestShiftAndTxn._txn_id for t in r.json())

    def test_dashboard_metrics(self, s):
        r = s.get(f"{API}/dashboard/metrics")
        assert r.status_code == 200
        d = r.json()
        for k in ["today_revenue", "today_orders", "weekly_chart", "top_sellers"]:
            assert k in d
        assert len(d["weekly_chart"]) == 7
        assert d["today_orders"] >= 1

    def test_end_shift_and_report(self, s):
        # end with counted_cash = system_cash + 5000 => variance +5000
        r = s.post(f"{API}/shifts/{TestShiftAndTxn._shift_id}/end", json={"counted_cash": 200000})
        assert r.status_code == 200
        assert r.json()["status"] == "closed"

        rep = s.get(f"{API}/shifts/{TestShiftAndTxn._shift_id}/report")
        assert rep.status_code == 200
        j = rep.json()
        for k in ["total_revenue", "total_cash", "total_qris", "variance", "toppings_sold", "products_sold", "system_cash"]:
            assert k in j
        assert j["variance"] is not None

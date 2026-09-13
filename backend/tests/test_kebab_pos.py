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



# --- Vouchers (new feature) ---
class TestVouchers:
    def test_voucher_uppercase(self, s):
        r = s.get(f"{API}/vouchers/KEBAB10")
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["code"] == "KEBAB10"
        assert j["percent"] == 10

    def test_voucher_lowercase_normalized(self, s):
        r = s.get(f"{API}/vouchers/hemat20")
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["code"] == "HEMAT20"
        assert j["percent"] == 20

    def test_voucher_promo5(self, s):
        r = s.get(f"{API}/vouchers/PROMO5")
        assert r.status_code == 200
        assert r.json()["percent"] == 5

    def test_voucher_invalid_404(self, s):
        r = s.get(f"{API}/vouchers/INVALID999")
        assert r.status_code == 404


# --- New Features: Discount / Voucher / Split Payment / Shift Report ---
class TestNewFeatures:
    _shift_id = None
    _cash_txn = None
    _qris_txn = None
    _split_txn = None
    _disc_txn = None

    def _base_item(self, s):
        p = s.get(f"{API}/products").json()[0]
        return p, {
            "product_id": p["id"],
            "product_name": p["name"],
            "base_price": p["price"],
            "toppings": [],
            "spice_level": "Medium",
            "notes": "TEST_NEW",
            "quantity": 1,
            "line_total": p["price"],
        }

    def test_start_new_shift(self, s, cashier_auth):
        # Start a fresh shift for isolated report totals
        r = s.post(f"{API}/shifts/start", json={
            "cashier_id": f"TEST_report_{os.getpid()}",
            "cashier_name": "TEST Report Cashier",
            "opening_cash": 0,
        })
        assert r.status_code == 200
        TestNewFeatures._shift_id = r.json()["id"]

    def test_txn_with_discount_and_voucher(self, s, cashier_auth):
        p, item = self._base_item(s)
        subtotal = p["price"]
        discount = 2000
        total = subtotal - discount
        payload = {
            "items": [item],
            "subtotal": subtotal,
            "discount": discount,
            "voucher_code": "KEBAB10",
            "total": total,
            "payment_method": "cash",
            "cash_received": total,
            "change": 0,
            "cashier_id": cashier_auth["user_id"],
            "cashier_name": cashier_auth["name"],
        }
        r = s.post(f"{API}/transactions", json=payload)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["discount"] == 2000
        assert j["voucher_code"] == "KEBAB10"
        TestNewFeatures._disc_txn = j["id"]
        # verify via GET
        g = s.get(f"{API}/transactions/{j['id']}")
        assert g.status_code == 200
        gj = g.json()
        assert gj["discount"] == 2000
        assert gj["voucher_code"] == "KEBAB10"

    def test_split_payment_transaction(self, s, cashier_auth):
        item = {
            "product_id": "x", "product_name": "TEST_split", "base_price": 5000,
            "toppings": [], "quantity": 1, "line_total": 5000,
        }
        payload = {
            "items": [item], "subtotal": 5000, "discount": 0, "total": 5000,
            "payment_method": "split", "cash_amount": 3000, "qris_amount": 2000,
            "cashier_id": cashier_auth["user_id"], "cashier_name": cashier_auth["name"],
            "shift_id": TestNewFeatures._shift_id,
        }
        r = s.post(f"{API}/transactions", json=payload)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["payment_method"] == "split"
        assert j["cash_amount"] == 3000
        assert j["qris_amount"] == 2000
        TestNewFeatures._split_txn = j["id"]

    def test_shift_report_split_totals(self, s, cashier_auth):
        # Create a pure cash 10000 + pure qris 5000 on same shift, then verify totals
        base = {
            "items": [{"product_id": "x", "product_name": "TEST_c", "base_price": 10000,
                       "toppings": [], "quantity": 1, "line_total": 10000}],
            "subtotal": 10000, "discount": 0, "total": 10000,
            "cashier_id": cashier_auth["user_id"], "cashier_name": cashier_auth["name"],
            "shift_id": TestNewFeatures._shift_id,
        }
        cash_payload = {**base, "payment_method": "cash", "cash_received": 10000, "change": 0}
        r1 = s.post(f"{API}/transactions", json=cash_payload)
        assert r1.status_code == 200
        qris_payload = {
            **base,
            "items": [{"product_id": "x", "product_name": "TEST_q", "base_price": 5000,
                       "toppings": [], "quantity": 1, "line_total": 5000}],
            "subtotal": 5000, "total": 5000, "payment_method": "qris",
        }
        r2 = s.post(f"{API}/transactions", json=qris_payload)
        assert r2.status_code == 200

        rep = s.get(f"{API}/shifts/{TestNewFeatures._shift_id}/report")
        assert rep.status_code == 200
        j = rep.json()
        # Expected: cash 10000 + split.cash 3000 = 13000; qris 5000 + split.qris 2000 = 7000
        assert j["total_cash"] == 13000, f"cash mismatch: {j['total_cash']}"
        assert j["total_qris"] == 7000, f"qris mismatch: {j['total_qris']}"
        assert j["total_revenue"] == 20000, f"revenue mismatch: {j['total_revenue']}"

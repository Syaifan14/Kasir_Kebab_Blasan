from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGO = 'HS256'

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def make_token(user_id: str, role: str, name: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "name": name,
        "exp": int((now_utc() + timedelta(days=7)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")


async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing auth")
    token = authorization.split(" ", 1)[1]
    return decode_token(token)


# ============ Models ============
class LoginPinReq(BaseModel):
    pin: str

class LoginAdminReq(BaseModel):
    email: str
    password: str

class AuthResp(BaseModel):
    token: str
    user_id: str
    name: str
    role: str

class Topping(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    price: int
    available: bool = True

class ToppingCreate(BaseModel):
    name: str
    price: int
    available: bool = True

class Product(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    category: str  # Kebab | Snacks | Beverages
    price: int
    image_url: Optional[str] = None
    active: bool = True

class ProductCreate(BaseModel):
    name: str
    category: str
    price: int
    image_url: Optional[str] = None
    active: bool = True

class CartToppingItem(BaseModel):
    id: str
    name: str
    price: int

class CartItem(BaseModel):
    product_id: str
    product_name: str
    base_price: int
    variant: Optional[str] = None
    toppings: List[CartToppingItem] = []
    spice_level: Optional[str] = None
    notes: Optional[str] = None
    quantity: int = 1
    line_total: int

class TransactionCreate(BaseModel):
    items: List[CartItem]
    subtotal: int
    discount: int = 0
    total: int
    payment_method: str  # cash | qris
    cash_received: Optional[int] = None
    change: Optional[int] = None
    cashier_id: str
    cashier_name: str
    shift_id: Optional[str] = None

class Transaction(TransactionCreate):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    order_no: str
    created_at: datetime = Field(default_factory=now_utc)

class ShiftStartReq(BaseModel):
    cashier_id: str
    cashier_name: str
    opening_cash: int

class ShiftEndReq(BaseModel):
    counted_cash: int

class Shift(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    cashier_id: str
    cashier_name: str
    opening_cash: int
    counted_cash: Optional[int] = None
    started_at: datetime = Field(default_factory=now_utc)
    ended_at: Optional[datetime] = None
    status: str = "open"  # open | closed


def strip_id(doc: dict) -> dict:
    if not doc:
        return doc
    doc.pop("_id", None)
    return doc


# ============ Seed ============
async def seed_data():
    # Users
    if await db.users.count_documents({}) == 0:
        cashier_pin = "1234"
        admin_pw = "admin123"
        await db.users.insert_many([
            {
                "id": str(uuid.uuid4()),
                "name": "Kasir Demo",
                "role": "cashier",
                "pin_hash": bcrypt.hashpw(cashier_pin.encode(), bcrypt.gensalt()).decode(),
            },
            {
                "id": str(uuid.uuid4()),
                "name": "Admin Kebab",
                "role": "admin",
                "email": "admin@kebabblasan.id",
                "password_hash": bcrypt.hashpw(admin_pw.encode(), bcrypt.gensalt()).decode(),
            },
        ])
        logger.info("Seeded users. Cashier PIN=1234, Admin admin@kebabblasan.id / admin123")

    if await db.products.count_documents({}) == 0:
        kebab_img = "https://images.unsplash.com/photo-1529006557810-274b9b2fc783?w=400&q=80"
        fries_img = "https://images.unsplash.com/photo-1630384060421-cb20d0e0649d?w=400&q=80"
        bev_img = "https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=400&q=80"
        await db.products.insert_many([
            {"id": str(uuid.uuid4()), "name": "Kebab Beef Regular", "category": "Kebab", "price": 15000, "image_url": kebab_img, "active": True},
            {"id": str(uuid.uuid4()), "name": "Kebab Beef Large", "category": "Kebab", "price": 20000, "image_url": kebab_img, "active": True},
            {"id": str(uuid.uuid4()), "name": "Kebab Chicken Regular", "category": "Kebab", "price": 13000, "image_url": kebab_img, "active": True},
            {"id": str(uuid.uuid4()), "name": "Kebab Chicken Large", "category": "Kebab", "price": 18000, "image_url": kebab_img, "active": True},
            {"id": str(uuid.uuid4()), "name": "Roti Maryam Coklat", "category": "Snacks", "price": 10000, "image_url": fries_img, "active": True},
            {"id": str(uuid.uuid4()), "name": "Es Teh Manis", "category": "Beverages", "price": 4000, "image_url": bev_img, "active": True},
        ])
        logger.info("Seeded products")

    if await db.toppings.count_documents({}) == 0:
        await db.toppings.insert_many([
            {"id": str(uuid.uuid4()), "name": "Keju Slice", "price": 2000, "available": True},
            {"id": str(uuid.uuid4()), "name": "Keju Mozzarella", "price": 5000, "available": True},
            {"id": str(uuid.uuid4()), "name": "Extra Daging", "price": 4000, "available": True},
            {"id": str(uuid.uuid4()), "name": "Telur", "price": 3000, "available": True},
            {"id": str(uuid.uuid4()), "name": "Saus Keju", "price": 2000, "available": True},
        ])
        logger.info("Seeded toppings")


# ============ Auth ============
@api_router.post("/auth/login-pin", response_model=AuthResp)
async def login_pin(req: LoginPinReq):
    users = await db.users.find({"role": "cashier"}, {"_id": 0}).to_list(100)
    for u in users:
        if bcrypt.checkpw(req.pin.encode(), u.get("pin_hash", "").encode()):
            token = make_token(u["id"], "cashier", u["name"])
            return AuthResp(token=token, user_id=u["id"], name=u["name"], role="cashier")
    raise HTTPException(status_code=401, detail="PIN salah")


@api_router.post("/auth/login-admin", response_model=AuthResp)
async def login_admin(req: LoginAdminReq):
    u = await db.users.find_one({"role": "admin", "email": req.email}, {"_id": 0})
    if not u or not bcrypt.checkpw(req.password.encode(), u.get("password_hash", "").encode()):
        raise HTTPException(status_code=401, detail="Email atau password salah")
    token = make_token(u["id"], "admin", u["name"])
    return AuthResp(token=token, user_id=u["id"], name=u["name"], role="admin")


# ============ Products ============
@api_router.get("/products", response_model=List[Product])
async def list_products(active_only: bool = False):
    q = {"active": True} if active_only else {}
    docs = await db.products.find(q, {"_id": 0}).to_list(500)
    return [Product(**d) for d in docs]

@api_router.post("/products", response_model=Product)
async def create_product(req: ProductCreate):
    p = Product(**req.dict())
    await db.products.insert_one(p.dict())
    return p

@api_router.put("/products/{pid}", response_model=Product)
async def update_product(pid: str, req: ProductCreate):
    upd = req.dict()
    r = await db.products.update_one({"id": pid}, {"$set": upd})
    if r.matched_count == 0:
        raise HTTPException(404, "Product not found")
    doc = await db.products.find_one({"id": pid}, {"_id": 0})
    return Product(**doc)

@api_router.delete("/products/{pid}")
async def delete_product(pid: str):
    r = await db.products.delete_one({"id": pid})
    if r.deleted_count == 0:
        raise HTTPException(404, "Product not found")
    return {"ok": True}


# ============ Toppings ============
@api_router.get("/toppings", response_model=List[Topping])
async def list_toppings():
    docs = await db.toppings.find({}, {"_id": 0}).to_list(200)
    return [Topping(**d) for d in docs]

@api_router.post("/toppings", response_model=Topping)
async def create_topping(req: ToppingCreate):
    t = Topping(**req.dict())
    await db.toppings.insert_one(t.dict())
    return t

@api_router.put("/toppings/{tid}", response_model=Topping)
async def update_topping(tid: str, req: ToppingCreate):
    r = await db.toppings.update_one({"id": tid}, {"$set": req.dict()})
    if r.matched_count == 0:
        raise HTTPException(404, "Topping not found")
    doc = await db.toppings.find_one({"id": tid}, {"_id": 0})
    return Topping(**doc)

@api_router.delete("/toppings/{tid}")
async def delete_topping(tid: str):
    r = await db.toppings.delete_one({"id": tid})
    if r.deleted_count == 0:
        raise HTTPException(404, "Topping not found")
    return {"ok": True}


# ============ Shifts ============
@api_router.post("/shifts/start", response_model=Shift)
async def start_shift(req: ShiftStartReq):
    active = await db.shifts.find_one({"cashier_id": req.cashier_id, "status": "open"}, {"_id": 0})
    if active:
        return Shift(**active)
    s = Shift(cashier_id=req.cashier_id, cashier_name=req.cashier_name, opening_cash=req.opening_cash)
    await db.shifts.insert_one(s.dict())
    return s

@api_router.get("/shifts/active", response_model=Optional[Shift])
async def active_shift(cashier_id: str):
    doc = await db.shifts.find_one({"cashier_id": cashier_id, "status": "open"}, {"_id": 0})
    if not doc:
        return None
    return Shift(**doc)

@api_router.post("/shifts/{sid}/end", response_model=Shift)
async def end_shift(sid: str, req: ShiftEndReq):
    doc = await db.shifts.find_one({"id": sid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Shift not found")
    await db.shifts.update_one({"id": sid}, {"$set": {
        "counted_cash": req.counted_cash,
        "ended_at": now_utc(),
        "status": "closed",
    }})
    doc = await db.shifts.find_one({"id": sid}, {"_id": 0})
    return Shift(**doc)

@api_router.get("/shifts/{sid}/report")
async def shift_report(sid: str):
    shift = await db.shifts.find_one({"id": sid}, {"_id": 0})
    if not shift:
        raise HTTPException(404, "Shift not found")
    txns = await db.transactions.find({"shift_id": sid}, {"_id": 0}).to_list(5000)
    total_cash = sum(t["total"] for t in txns if t["payment_method"] == "cash")
    total_qris = sum(t["total"] for t in txns if t["payment_method"] == "qris")
    total_revenue = total_cash + total_qris
    tx_count = len(txns)
    avg_order = int(total_revenue / tx_count) if tx_count else 0

    # System cash: opening + cash sales
    system_cash = shift["opening_cash"] + total_cash
    counted = shift.get("counted_cash")
    variance = (counted - system_cash) if counted is not None else None

    # Toppings breakdown
    topping_counts: dict = {}
    for t in txns:
        for it in t.get("items", []):
            q = it.get("quantity", 1)
            for top in it.get("toppings", []):
                topping_counts[top["name"]] = topping_counts.get(top["name"], 0) + q
    toppings_sold = [{"name": k, "qty": v} for k, v in sorted(topping_counts.items(), key=lambda x: -x[1])]

    # Product breakdown
    product_counts: dict = {}
    for t in txns:
        for it in t.get("items", []):
            q = it.get("quantity", 1)
            product_counts[it["product_name"]] = product_counts.get(it["product_name"], 0) + q
    products_sold = [{"name": k, "qty": v} for k, v in sorted(product_counts.items(), key=lambda x: -x[1])]

    return {
        "shift": Shift(**shift).dict(),
        "total_revenue": total_revenue,
        "total_cash": total_cash,
        "total_qris": total_qris,
        "transactions_count": tx_count,
        "average_order": avg_order,
        "system_cash": system_cash,
        "counted_cash": counted,
        "variance": variance,
        "toppings_sold": toppings_sold,
        "products_sold": products_sold,
    }


# ============ Transactions ============
async def _next_order_no() -> str:
    today = now_utc().strftime("%Y%m%d")
    count = await db.transactions.count_documents({"order_no": {"$regex": f"^{today}"}})
    return f"{today}-{count + 1:04d}"

@api_router.post("/transactions", response_model=Transaction)
async def create_transaction(req: TransactionCreate):
    order_no = await _next_order_no()
    txn = Transaction(order_no=order_no, **req.dict())
    doc = txn.dict()
    await db.transactions.insert_one(doc.copy())
    return txn

@api_router.get("/transactions", response_model=List[Transaction])
async def list_transactions(limit: int = 100, from_date: Optional[str] = None, to_date: Optional[str] = None, q: Optional[str] = None):
    query: dict = {}
    if from_date or to_date:
        query["created_at"] = {}
        if from_date:
            query["created_at"]["$gte"] = datetime.fromisoformat(from_date)
        if to_date:
            query["created_at"]["$lte"] = datetime.fromisoformat(to_date)
    if q:
        query["order_no"] = {"$regex": q, "$options": "i"}
    docs = await db.transactions.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return [Transaction(**d) for d in docs]

@api_router.get("/transactions/{tid}", response_model=Transaction)
async def get_transaction(tid: str):
    doc = await db.transactions.find_one({"id": tid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Transaction not found")
    return Transaction(**doc)


# ============ Dashboard ============
@api_router.get("/dashboard/metrics")
async def dashboard_metrics():
    now = now_utc()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=6)

    txns_today = await db.transactions.find({"created_at": {"$gte": today_start}}, {"_id": 0}).to_list(5000)
    txns_week = await db.transactions.find({"created_at": {"$gte": week_start}}, {"_id": 0}).to_list(5000)
    all_txns = await db.transactions.find({}, {"_id": 0}).to_list(20000)

    today_revenue = sum(t["total"] for t in txns_today)
    today_orders = len(txns_today)
    week_revenue = sum(t["total"] for t in txns_week)

    # Weekly breakdown per day
    daily = {}
    for i in range(7):
        d = (today_start - timedelta(days=6 - i)).strftime("%Y-%m-%d")
        daily[d] = 0
    for t in txns_week:
        ca = t["created_at"]
        if isinstance(ca, str):
            ca = datetime.fromisoformat(ca)
        d = ca.strftime("%Y-%m-%d")
        if d in daily:
            daily[d] += t["total"]
    weekly_chart = [{"date": k, "total": v} for k, v in daily.items()]

    # Top 5 items
    counts: dict = {}
    for t in all_txns:
        for it in t.get("items", []):
            q = it.get("quantity", 1)
            counts[it["product_name"]] = counts.get(it["product_name"], 0) + q
    top5 = sorted(counts.items(), key=lambda x: -x[1])[:5]
    top_sellers = [{"name": k, "qty": v} for k, v in top5]

    return {
        "today_revenue": today_revenue,
        "today_orders": today_orders,
        "week_revenue": week_revenue,
        "weekly_chart": weekly_chart,
        "top_sellers": top_sellers,
        "total_transactions": len(all_txns),
    }


@api_router.get("/")
async def root():
    return {"message": "Kebab Blasan POS API"}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    await seed_data()


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

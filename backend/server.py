"""Papegojregistret – FastAPI + MongoDB backend.

Ported from the original Express/PostgreSQL/Replit-auth code. Focuses on:
- Custom JWT (email/password) auth
- Emergent-managed Google Auth (session_id exchange)
- Admin panel endpoints (dashboard stats, CRUD, moderation)
- Public endpoints (register bird, found birds, gallery, feedback)
"""

from dotenv import load_dotenv
load_dotenv()

import os
import uuid
import logging
import secrets
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional, List, Literal

import bcrypt
import jwt
import httpx
import stripe
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, Query
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import DuplicateKeyError
from pydantic import BaseModel, Field, EmailStr, ConfigDict
import io
import csv

# ----------------------------------------------------------------------------
# Setup
# ----------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("parrot-register")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = "HS256"
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@papegojregistret.se")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "Admin123!")

# Stripe
stripe.api_key = os.environ.get("STRIPE_SECRET_KEY") or "sk_test_emergent"
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
BIRD_REGISTRATION_LOOKUP_KEY = "bird_registration_fee"
MEMBERSHIP_LOOKUP_KEY = "membership_yearly"

# Emergent-managed email (Resend proxy)
EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMERGENT_EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY", "")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "Fågelregister")
CONTACT_INBOX_EMAIL = os.environ.get("CONTACT_INBOX_EMAIL", "info@fagelregister.se")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="Papegojregistret API")
api = APIRouter(prefix="/api")


# ----------------------------------------------------------------------------
# Helpers – password + JWT
# ----------------------------------------------------------------------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(hours=2),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "type": "refresh",
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    response.set_cookie(
        "access_token", access_token,
        httponly=True, secure=True, samesite="none",
        max_age=60 * 60 * 2, path="/",
    )
    response.set_cookie(
        "refresh_token", refresh_token,
        httponly=True, secure=True, samesite="none",
        max_age=60 * 60 * 24 * 7, path="/",
    )


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    response.delete_cookie("session_token", path="/")


# ----------------------------------------------------------------------------
# Auth dependency
# ----------------------------------------------------------------------------
async def get_current_user(request: Request) -> dict:
    # 1) Try JWT access_token cookie / Bearer
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if token:
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
            if payload.get("type") == "access":
                user = await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0, "password_hash": 0})
                if user:
                    if user.get("is_blocked"):
                        raise HTTPException(status_code=403, detail="Kontot är blockerat")
                    return user
        except jwt.ExpiredSignatureError:
            pass
        except jwt.InvalidTokenError:
            pass

    # 2) Fall back to Emergent Google session cookie
    session_token = request.cookies.get("session_token")
    if not session_token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            session_token = auth[7:]
    if session_token:
        session_doc = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
        if session_doc:
            exp = session_doc["expires_at"]
            if isinstance(exp, str):
                exp = datetime.fromisoformat(exp)
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if exp >= datetime.now(timezone.utc):
                user = await db.users.find_one({"user_id": session_doc["user_id"]}, {"_id": 0, "password_hash": 0})
                if user:
                    if user.get("is_blocked"):
                        raise HTTPException(status_code=403, detail="Kontot är blockerat")
                    return user

    raise HTTPException(status_code=401, detail="Not authenticated")


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Endast admin har tillgång")
    return user


# ----------------------------------------------------------------------------
# Simple in-memory rate limiter (best-effort; production would use Redis)
# ----------------------------------------------------------------------------
_RATE_BUCKETS: dict[str, list[float]] = {}


def _client_ip(request: Request) -> str:
    """Extract the client IP honoring the ingress X-Forwarded-For header."""
    fwd = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    if fwd:
        return fwd
    return request.client.host if request.client else "unknown"


def rate_limit(key: str, *, limit: int, window_seconds: int) -> None:
    """Raise HTTPException 429 if `key` has hit `limit` calls within the window.

    Uses monotonic time so it's safe against wall-clock changes.
    """
    import time as _t
    now = _t.monotonic()
    bucket = _RATE_BUCKETS.get(key, [])
    # Drop expired entries
    cutoff = now - window_seconds
    bucket = [ts for ts in bucket if ts > cutoff]
    if len(bucket) >= limit:
        retry_after = int(bucket[0] + window_seconds - now) + 1
        raise HTTPException(
            status_code=429,
            detail="För många försök — vänta en stund och försök igen.",
            headers={"Retry-After": str(max(1, retry_after))},
        )
    bucket.append(now)
    _RATE_BUCKETS[key] = bucket


# ----------------------------------------------------------------------------
# Activity log helper
# ----------------------------------------------------------------------------
async def log_activity(actor_id: Optional[str], actor_email: Optional[str], action: str, target: str, details: Optional[dict] = None) -> None:
    await db.activity_logs.insert_one({
        "id": str(uuid.uuid4()),
        "actor_id": actor_id,
        "actor_email": actor_email,
        "action": action,
        "target": target,
        "details": details or {},
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


# ----------------------------------------------------------------------------
# Pydantic models
# ----------------------------------------------------------------------------
SWEDISH_PHONE_RE = re.compile(r"^(07[0-9]|08|01[1-9]|02[1-9]|03[1-9]|04[0-9]|05[0-9]|06[0-9]|09[0-9])[0-9]{6,8}$")


def _normalize_ring(raw: Optional[str]) -> Optional[str]:
    """Uppercase + strip + collapse spaces to make ring_number comparison consistent."""
    if not raw:
        return raw
    return re.sub(r"\s+", "", raw).upper()


class RegisterInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    first_name: Optional[str] = None
    last_name: Optional[str] = None


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class GoogleSessionInput(BaseModel):
    session_id: str


class BirdInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    species: str = Field(min_length=1)
    ring_number: str = Field(min_length=1)
    owner_name: str = Field(min_length=1)
    phone_number: str
    owner_email: Optional[EmailStr] = None
    additional_info: Optional[str] = None
    image_urls: Optional[List[str]] = None
    discount_code: Optional[str] = None
    origin_url: Optional[str] = None


class BirdUpdate(BaseModel):
    species: Optional[str] = None
    ring_number: Optional[str] = None
    owner_name: Optional[str] = None
    phone_number: Optional[str] = None
    additional_info: Optional[str] = None
    payment_status: Optional[Literal["pending", "processing", "completed", "cancelled"]] = None


class FoundBirdInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    description: str = Field(min_length=1)
    location: str = Field(min_length=1)
    date_found: str
    ring_number: Optional[str] = None
    finder_name: str = Field(min_length=1)
    finder_phone: str


class FeedbackInput(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = None
    email: Optional[EmailStr] = None


class ContactMessageInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    phone: Optional[str] = Field(default=None, max_length=40)
    subject: str = Field(min_length=1, max_length=200)
    message: str = Field(min_length=1, max_length=5000)
    # Honeypot – legitimate browser users leave this empty. Bots often fill every input.
    website: Optional[str] = Field(default=None, max_length=200)


class CommentInput(BaseModel):
    comment_text: str = Field(min_length=1)
    commenter_name: str = Field(min_length=1)
    commenter_email: Optional[EmailStr] = None


class DiscountCodeInput(BaseModel):
    code: str = Field(min_length=1)
    discount_percentage: int = Field(ge=1, le=100)
    expiry_date: Optional[str] = None
    usage_limit: Optional[int] = None
    is_active: bool = True


class DiscountCodeUpdate(BaseModel):
    discount_percentage: Optional[int] = Field(default=None, ge=1, le=100)
    expiry_date: Optional[str] = None
    usage_limit: Optional[int] = None
    is_active: Optional[bool] = None


class PostInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    bird_id: Optional[str] = None
    title: str = Field(min_length=1, max_length=140)
    content: str = Field(min_length=1, max_length=2000)
    image_urls: List[str] = Field(default_factory=list)


class PostRejectInput(BaseModel):
    reason: Optional[str] = None


class MissingBirdInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    owner_name: str = Field(min_length=1)
    contact_phone: str
    contact_email: Optional[EmailStr] = None
    species: str = Field(min_length=1)
    ring_number: Optional[str] = None
    description: str = Field(min_length=1)
    last_seen_location: str = Field(min_length=1)
    last_seen_date: str
    reward_offered: Optional[str] = None


class MissingBirdUpdate(BaseModel):
    status: Optional[Literal["searching", "found", "closed"]] = None
    admin_notes: Optional[str] = None


class MissingBirdNotify(BaseModel):
    message: Optional[str] = None


class ContentPageInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    slug: str = Field(min_length=1, max_length=80)
    title: str = Field(min_length=1, max_length=140)
    content: str = ""
    is_published: bool = True


class ContentPageUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=140)
    content: Optional[str] = None
    is_published: Optional[bool] = None


class HomepageSectionInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="allow")
    type: Literal["hero", "features", "emergency_cta", "text_block", "cta_banner"]
    label: str = Field(min_length=1, max_length=80)
    subtitle: Optional[str] = None
    is_visible: bool = True
    config: dict = Field(default_factory=dict)


class HomepageSectionUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="allow")
    label: Optional[str] = Field(default=None, min_length=1, max_length=80)
    subtitle: Optional[str] = None
    is_visible: Optional[bool] = None
    config: Optional[dict] = None
    sort_order: Optional[int] = None


class HomepageReorder(BaseModel):
    ids: List[str]


class BulkIdsInput(BaseModel):
    ids: List[str] = Field(min_length=1, max_length=500)


class BulkPostAction(BaseModel):
    ids: List[str] = Field(min_length=1, max_length=500)
    action: Literal["approve", "reject", "delete"]
    reason: Optional[str] = None


class BulkUserAction(BaseModel):
    ids: List[str] = Field(min_length=1, max_length=500)
    action: Literal["delete", "block", "unblock"]


class BulkMissingAction(BaseModel):
    ids: List[str] = Field(min_length=1, max_length=500)
    action: Literal["delete", "found", "closed"]


class BulkFoundAction(BaseModel):
    ids: List[str] = Field(min_length=1, max_length=500)
    action: Literal["delete", "returned"]


class BulkHomepageAction(BaseModel):
    ids: List[str] = Field(min_length=1, max_length=500)
    action: Literal["delete", "show", "hide"]


class MenuItemInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    label: str = Field(min_length=1, max_length=60)
    url: str = Field(min_length=1, max_length=200)
    parent_id: Optional[str] = None
    is_visible: bool = True


class MenuItemUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    label: Optional[str] = Field(default=None, min_length=1, max_length=60)
    url: Optional[str] = Field(default=None, min_length=1, max_length=200)
    parent_id: Optional[str] = None
    is_visible: Optional[bool] = None
    sort_order: Optional[int] = None


class MenuReorder(BaseModel):
    ids: List[str]


class UserUpdate(BaseModel):
    role: Optional[Literal["user", "admin"]] = None
    is_blocked: Optional[bool] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None


# ----------------------------------------------------------------------------
# Auth endpoints
# ----------------------------------------------------------------------------
@api.post("/auth/register")
async def register(data: RegisterInput, request: Request, response: Response):
    ip = _client_ip(request)
    rate_limit(f"auth:register:{ip}", limit=5, window_seconds=3600)
    email = data.email.lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="E-postadressen är redan registrerad")

    user_id = f"user_{uuid.uuid4().hex[:12]}"
    role = "admin" if email == ADMIN_EMAIL.lower() else "user"
    doc = {
        "user_id": user_id,
        "email": email,
        "password_hash": hash_password(data.password),
        "first_name": data.first_name or "",
        "last_name": data.last_name or "",
        "role": role,
        "is_blocked": False,
        "profile_image_url": None,
        "auth_provider": "password",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    await log_activity(user_id, email, "user.register", user_id)

    access = create_access_token(user_id, email, role)
    refresh = create_refresh_token(user_id)
    set_auth_cookies(response, access, refresh)
    doc.pop("password_hash", None)
    doc.pop("_id", None)
    return doc


@api.post("/auth/login")
async def login(data: LoginInput, request: Request, response: Response):
    ip = _client_ip(request)
    email = data.email.lower()
    # Two-layer rate limit: per IP (10/min) and per email (5/15min).
    rate_limit(f"auth:login:ip:{ip}", limit=10, window_seconds=60)
    rate_limit(f"auth:login:email:{email}", limit=5, window_seconds=900)

    user = await db.users.find_one({"email": email})
    if not user or not user.get("password_hash"):
        raise HTTPException(status_code=401, detail="Fel e-post eller lösenord")
    if user.get("is_blocked"):
        raise HTTPException(status_code=403, detail="Kontot är blockerat")
    if not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Fel e-post eller lösenord")

    access = create_access_token(user["user_id"], email, user.get("role", "user"))
    refresh = create_refresh_token(user["user_id"])
    set_auth_cookies(response, access, refresh)
    await log_activity(user["user_id"], email, "user.login", user["user_id"])
    user.pop("password_hash", None)
    user.pop("_id", None)
    return user


@api.post("/auth/logout")
async def logout(response: Response, request: Request):
    # Best-effort: remove session_token from db
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})
    clear_auth_cookies(response)
    return {"success": True}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@api.post("/auth/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    access = create_access_token(user["user_id"], user["email"], user.get("role", "user"))
    response.set_cookie(
        "access_token", access,
        httponly=True, secure=True, samesite="none",
        max_age=60 * 60 * 2, path="/",
    )
    return {"success": True}


@api.post("/auth/google/session")
async def google_session(data: GoogleSessionInput, response: Response):
    """Exchange Emergent-managed Google session_id for a session_token."""
    async with httpx.AsyncClient(timeout=15) as http:
        r = await http.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": data.session_id},
        )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Google-inloggning misslyckades")
    payload = r.json()
    email = (payload.get("email") or "").lower()
    if not email:
        raise HTTPException(status_code=400, detail="Ingen e-post från Google")

    user = await db.users.find_one({"email": email})
    now = datetime.now(timezone.utc)
    if user is None:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        role = "admin" if email == ADMIN_EMAIL.lower() else "user"
        name = payload.get("name") or ""
        first, _, last = name.partition(" ")
        user = {
            "user_id": user_id,
            "email": email,
            "password_hash": None,
            "first_name": first,
            "last_name": last,
            "role": role,
            "is_blocked": False,
            "profile_image_url": payload.get("picture"),
            "auth_provider": "google",
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
        }
        await db.users.insert_one(user)
    else:
        if user.get("is_blocked"):
            raise HTTPException(status_code=403, detail="Kontot är blockerat")
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {
                "profile_image_url": payload.get("picture") or user.get("profile_image_url"),
                "updated_at": now.isoformat(),
            }},
        )

    session_token = payload.get("session_token") or secrets.token_urlsafe(48)
    expires_at = now + timedelta(days=7)
    await db.user_sessions.insert_one({
        "user_id": user["user_id"],
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": now.isoformat(),
    })

    response.set_cookie(
        "session_token", session_token,
        httponly=True, secure=True, samesite="none",
        max_age=60 * 60 * 24 * 7, path="/",
    )
    await log_activity(user["user_id"], email, "user.google_login", user["user_id"])
    user.pop("password_hash", None)
    user.pop("_id", None)
    return user


# ----------------------------------------------------------------------------
# Discount code helpers
# ----------------------------------------------------------------------------
async def validate_discount_code(code: str) -> dict:
    dc = await db.discount_codes.find_one({"code": code.upper()}, {"_id": 0})
    if not dc:
        return {"valid": False, "message": "Rabattkoden finns inte"}
    if not dc.get("is_active", True):
        return {"valid": False, "message": "Rabattkoden är inte aktiv"}
    if dc.get("expiry_date"):
        try:
            exp = datetime.fromisoformat(dc["expiry_date"]).date()
            if exp < datetime.now(timezone.utc).date():
                return {"valid": False, "message": "Rabattkoden har gått ut"}
        except Exception:
            pass
    if dc.get("usage_limit") and dc.get("used_count", 0) >= dc["usage_limit"]:
        return {"valid": False, "message": "Rabattkoden har nått sin användningsgräns"}
    return {"valid": True, "discount_code": dc}


# ----------------------------------------------------------------------------
# Public endpoints
# ----------------------------------------------------------------------------
@api.get("/")
async def root():
    return {"message": "Papegojregistret API"}


@api.post("/registered-birds")
async def create_registered_bird(data: BirdInput, request: Request):
    rate_limit(f"submit:register:{_client_ip(request)}", limit=10, window_seconds=3600)
    if not SWEDISH_PHONE_RE.match(data.phone_number):
        raise HTTPException(status_code=400, detail="Ange ett giltigt svenskt telefonnummer")

    ring = _normalize_ring(data.ring_number)
    if not ring:
        raise HTTPException(status_code=400, detail="Ringnummer krävs")

    existing = await db.registered_birds.find_one({"ring_number": ring})
    if existing:
        raise HTTPException(status_code=400, detail=f"Ringnummer {ring} är redan registrerat")

    # Try to attach current user if authenticated (optional)
    current_user_id: Optional[str] = None
    current_user_email: Optional[str] = None
    try:
        current_user = await get_current_user(request)
        current_user_id = current_user["user_id"]
        current_user_email = current_user["email"]
    except HTTPException:
        pass

    # Auto-create account when the submitter is anonymous but provided an email
    account_created = False
    temp_password: Optional[str] = None
    if not current_user_id and data.owner_email:
        email = data.owner_email.lower()
        existing_user = await db.users.find_one({"email": email})
        if existing_user:
            current_user_id = existing_user["user_id"]
            current_user_email = existing_user["email"]
        else:
            temp_password = secrets.token_urlsafe(9)
            first, _, last = (data.owner_name or "").partition(" ")
            user_id = f"user_{uuid.uuid4().hex[:12]}"
            role = "admin" if email == ADMIN_EMAIL.lower() else "user"
            now_iso = datetime.now(timezone.utc).isoformat()
            await db.users.insert_one({
                "user_id": user_id,
                "email": email,
                "password_hash": hash_password(temp_password),
                "first_name": first,
                "last_name": last,
                "role": role,
                "is_blocked": False,
                "profile_image_url": None,
                "auth_provider": "auto",
                "must_reset_password": True,
                "created_at": now_iso,
                "updated_at": now_iso,
            })
            current_user_id = user_id
            current_user_email = email
            account_created = True
            await log_activity(user_id, email, "user.auto_register", user_id, {"source": "bird_registration"})

    discount_code_id: Optional[str] = None
    final_amount: Optional[float] = None
    if data.discount_code:
        validation = await validate_discount_code(data.discount_code)
        if not validation["valid"]:
            raise HTTPException(status_code=400, detail=validation["message"])
        dc = validation["discount_code"]
        original = 300.0
        final_amount = round(original - (original * dc["discount_percentage"] / 100), 2)
        discount_code_id = dc["id"]

    bird = {
        "id": str(uuid.uuid4()),
        "user_id": current_user_id,
        "species": data.species,
        "ring_number": ring,
        "owner_name": data.owner_name,
        "phone_number": data.phone_number,
        "additional_info": data.additional_info,
        "image_urls": data.image_urls or [],
        "registration_date": datetime.now(timezone.utc).date().isoformat(),
        "payment_status": "pending",
        "stripe_payment_intent_id": None,
        "registration_fee_amount": 300,
        "annual_fee_amount": 100,
        "annual_fee_paid_until": None,
        "discount_code_id": discount_code_id,
        "final_amount": final_amount,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        await db.registered_birds.insert_one(bird)
    except DuplicateKeyError:
        raise HTTPException(status_code=400, detail=f"Ringnummer {ring} är redan registrerat")

    # Create Stripe Checkout session (registration fee + membership if needed)
    origin_url = (data.origin_url or "").rstrip("/")
    if not origin_url:
        origin_url = str(request.base_url).rstrip("/")

    user_doc = await db.users.find_one({"user_id": current_user_id}) if current_user_id else None
    membership_active = bool(user_doc and user_doc.get("membership_active"))

    try:
        checkout = _build_bird_checkout_session(
            bird_ids=[bird["id"]],
            user_id=current_user_id,
            user_email=current_user_email,
            origin_url=origin_url,
            include_membership=not membership_active,
            discount_code_id=discount_code_id,
            final_amount=final_amount,
        )
    except stripe.error.StripeError as e:  # noqa: PERF203
        logger.exception("Stripe checkout failed: %s", e)
        raise HTTPException(status_code=502, detail="Betalning kunde inte startas — kontakta support.")

    # Track the session for status polling / webhook
    now_utc = datetime.now(timezone.utc)
    await db.payment_transactions.insert_one({
        "session_id": checkout["session_id"],
        "user_id": current_user_id,
        "user_email": current_user_email,
        "bird_ids": [bird["id"]],
        "amount": checkout["amount_total"],
        "currency": "SEK",
        "status": "initiated",
        "payment_status": "pending",
        "include_membership": not membership_active,
        "discount_code_id": discount_code_id,
        "created_at": now_utc.isoformat(),
        "updated_at": now_utc.isoformat(),
    })

    bird.pop("_id", None)

    return {
        "bird": bird,
        "checkout_url": checkout["checkout_url"],
        "session_id": checkout["session_id"],
        "account_created": account_created,
        "temp_password": temp_password,
        "account_email": current_user_email,
    }


@api.get("/found-birds")
async def list_found_birds(request: Request, search: Optional[str] = None):
    # Rate limit ring-number/text search to prevent scraping (20 searches / min / IP)
    if search:
        rate_limit(f"search:found:{_client_ip(request)}", limit=20, window_seconds=60)
    query = {}
    if search:
        s = re.escape(search)
        query = {"$or": [
            {"description": {"$regex": s, "$options": "i"}},
            {"location": {"$regex": s, "$options": "i"}},
            {"finder_name": {"$regex": s, "$options": "i"}},
            {"ring_number": {"$regex": s, "$options": "i"}},
        ]}
    # Strip finder phone from public output — admin still sees it via /admin/found-birds
    cursor = db.found_birds.find(
        query,
        {"_id": 0, "finder_phone": 0},
    ).sort("report_date", -1)
    return await cursor.to_list(500)


@api.post("/found-birds")
async def create_found_bird(data: FoundBirdInput, request: Request):
    rate_limit(f"submit:found:{_client_ip(request)}", limit=5, window_seconds=3600)
    if not SWEDISH_PHONE_RE.match(data.finder_phone):
        raise HTTPException(status_code=400, detail="Ange ett giltigt svenskt telefonnummer")
    bird = {
        "id": str(uuid.uuid4()),
        "description": data.description,
        "location": data.location,
        "date_found": data.date_found,
        "ring_number": data.ring_number,
        "finder_name": data.finder_name,
        "finder_phone": data.finder_phone,
        "report_date": datetime.now(timezone.utc).date().isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.found_birds.insert_one(bird)
    bird.pop("_id", None)
    return bird


@api.get("/public-birds")
async def public_birds():
    """Publicly visible bird list — strips ALL PII (owner name/email/phone).
    Only species, ring number and images are returned."""
    cursor = db.registered_birds.find(
        {},
        {
            "_id": 0,
            "phone_number": 0,
            "user_id": 0,
            "owner_email": 0,
            "owner_name": 0,
            "additional_info": 0,
            "email_sent_at": 0,
        },
    ).sort("registration_date", -1)
    return await cursor.to_list(500)


@api.get("/my-birds")
async def my_birds(user: dict = Depends(get_current_user)):
    cursor = db.registered_birds.find(
        {"user_id": user["user_id"]},
        {"_id": 0},
    ).sort("registration_date", -1)
    return await cursor.to_list(500)


@api.post("/birds/{bird_id}/images")
async def upload_bird_images(bird_id: str, payload: dict, user: dict = Depends(get_current_user)):
    """Update image_urls for a bird. Owner or admin only. Images are base64 data URIs."""
    bird = await db.registered_birds.find_one({"id": bird_id})
    if not bird:
        raise HTTPException(status_code=404, detail="Fågel hittades inte")
    if user["role"] != "admin" and bird.get("user_id") != user["user_id"]:
        raise HTTPException(status_code=403, detail="Du kan bara ändra dina egna fåglar")
    image_urls = payload.get("image_urls")
    if not isinstance(image_urls, list):
        raise HTTPException(status_code=400, detail="image_urls måste vara en lista")
    # Simple safety cap: 8 images per bird, 5MB each (base64)
    if len(image_urls) > 8:
        raise HTTPException(status_code=400, detail="Max 8 bilder per fågel")
    await db.registered_birds.update_one({"id": bird_id}, {"$set": {"image_urls": image_urls}})
    updated = await db.registered_birds.find_one({"id": bird_id}, {"_id": 0})
    return updated


@api.post("/feedback")
async def create_feedback(data: FeedbackInput):
    doc = {
        "id": str(uuid.uuid4()),
        "rating": data.rating,
        "comment": data.comment,
        "email": data.email,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.feedback.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/feedback")
async def list_feedback_public():
    cursor = db.feedback.find({}, {"_id": 0, "email": 0}).sort("created_at", -1)
    return await cursor.to_list(200)


@api.post("/contact")
async def submit_contact_message(data: ContactMessageInput, request: Request):
    # 1) Honeypot – if hidden field is filled, silently accept (return success so bot moves on)
    if data.website:
        logger.info("Contact honeypot triggered from %s", request.client.host if request.client else "?")
        return {"success": True, "id": str(uuid.uuid4())}

    # 2) Rate limit — max 3 messages / hour per IP or per email
    ip = _client_ip(request)
    rate_limit(f"contact:ip:{ip}", limit=3, window_seconds=3600)
    rate_limit(f"contact:email:{data.email.lower()}", limit=3, window_seconds=3600)
    one_hour_ago = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    recent = await db.contact_messages.count_documents({
        "created_at": {"$gte": one_hour_ago},
        "$or": [{"ip": ip}, {"email": data.email.lower()}],
    })
    if recent >= 3:
        raise HTTPException(
            status_code=429,
            detail="För många meddelanden på kort tid — vänta en stund och försök igen.",
        )

    doc = {
        "id": str(uuid.uuid4()),
        "name": data.name,
        "email": data.email.lower(),
        "phone": data.phone,
        "subject": data.subject,
        "message": data.message,
        "ip": ip,
        "user_agent": request.headers.get("user-agent", "")[:255],
        "status": "new",  # new | read | responded | archived
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.contact_messages.insert_one(doc)
    doc.pop("_id", None)

    # Fire off notification email to admin inbox (non-blocking, best-effort)
    if EMERGENT_EMAIL_KEY:
        try:
            html = _build_contact_email_html(doc)
            payload = {
                "to": [CONTACT_INBOX_EMAIL],
                "subject": f"Nytt kontaktmeddelande: {data.subject}",
                "html": html,
                "from_name": EMAIL_FROM_NAME,
                "contact_email": data.email,
            }
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    f"{EMAIL_BASE_URL}/api/v1/email/send",
                    headers={"X-Email-Key": EMERGENT_EMAIL_KEY},
                    json=payload,
                )
            if resp.status_code >= 400:
                logger.warning("Contact email send failed %s: %s", resp.status_code, resp.text)
            else:
                await db.contact_messages.update_one(
                    {"id": doc["id"]},
                    {"$set": {"email_sent_at": datetime.now(timezone.utc).isoformat()}},
                )
        except Exception as e:  # noqa: BLE001
            logger.exception("Contact email exception: %s", e)

    return {"success": True, "id": doc["id"]}


def _build_contact_email_html(doc: dict) -> str:
    """HTML för kontaktmeddelande-notis (inline CSS, e-postsäker layout)."""
    def esc(v):
        s = "" if v is None else str(v)
        return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                 .replace('"', "&quot;"))
    phone_row = ""
    if doc.get("phone"):
        phone_row = (
            '<tr><td style="padding:6px 0;color:#6b7280;">Telefon</td>'
            f'<td style="padding:6px 0;"><a href="tel:{esc(doc["phone"])}" style="color:#FF5C00;text-decoration:none;">{esc(doc["phone"])}</a></td></tr>'
        )
    message_html = esc(doc["message"]).replace("\n", "<br/>")
    return f"""
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0;font-family:Arial,Helvetica,sans-serif;color:#111827;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
      <tr><td style="background:#0D2B1D;padding:20px 24px;">
        <div style="color:#ffffff;font-size:14px;letter-spacing:2px;text-transform:uppercase;opacity:0.75;">Fågelregister · Kontakt</div>
        <div style="color:#ffffff;font-size:22px;font-weight:700;margin-top:4px;">Nytt kontaktmeddelande</div>
      </td></tr>
      <tr><td style="padding:24px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
          <tr><td style="padding:6px 0;color:#6b7280;width:120px;">Från</td>
              <td style="padding:6px 0;font-weight:600;">{esc(doc['name'])}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;">E-post</td>
              <td style="padding:6px 0;"><a href="mailto:{esc(doc['email'])}" style="color:#FF5C00;text-decoration:none;">{esc(doc['email'])}</a></td></tr>
          {phone_row}
          <tr><td style="padding:6px 0;color:#6b7280;">Ämne</td>
              <td style="padding:6px 0;font-weight:600;">{esc(doc['subject'])}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;">Mottaget</td>
              <td style="padding:6px 0;">{esc(doc['created_at'][:19].replace('T',' '))}</td></tr>
        </table>
        <div style="margin-top:20px;padding:16px;background:#f9fafb;border-left:4px solid #FF5C00;border-radius:6px;font-size:14px;line-height:1.6;white-space:pre-wrap;">{message_html}</div>
        <div style="margin-top:24px;text-align:center;">
          <a href="mailto:{esc(doc['email'])}?subject=Re:%20{esc(doc['subject'])}" style="display:inline-block;padding:12px 24px;background:#FF5C00;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">Svara direkt</a>
        </div>
      </td></tr>
      <tr><td style="background:#f9fafb;padding:12px 24px;color:#9ca3af;font-size:12px;text-align:center;">
        Meddelande-ID {esc(doc['id'])}
      </td></tr>
    </table>
  </td></tr>
</table>
"""


@api.get("/admin/contact-messages")
async def admin_list_contact_messages(_: dict = Depends(require_admin)):
    docs = await db.contact_messages.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return docs


@api.patch("/admin/contact-messages/{message_id}")
async def admin_update_contact_message(message_id: str, payload: dict, admin: dict = Depends(require_admin)):
    allowed = {"status"}
    updates = {k: v for k, v in payload.items() if k in allowed}
    if not updates:
        raise HTTPException(status_code=400, detail="Inget att uppdatera")
    result = await db.contact_messages.update_one({"id": message_id}, {"$set": updates})
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Meddelande hittades inte")
    await log_activity(admin["user_id"], admin["email"], "admin.contact.update", message_id, updates)
    return {"success": True}


@api.delete("/admin/contact-messages/{message_id}")
async def admin_delete_contact_message(message_id: str, admin: dict = Depends(require_admin)):
    result = await db.contact_messages.delete_one({"id": message_id})
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail="Meddelande hittades inte")
    await log_activity(admin["user_id"], admin["email"], "admin.contact.delete", message_id)
    return {"success": True}


@api.post("/admin/contact-messages/bulk-delete")
async def admin_bulk_delete_contact(payload: BulkIdsInput, admin: dict = Depends(require_admin)):
    n = await _bulk_delete(db.contact_messages, payload.ids)
    await log_activity(admin["user_id"], admin["email"], "admin.contact.bulk_delete", None,
                       {"ids": payload.ids, "deleted": n})
    return {"deleted": n}


@api.post("/discount-codes/validate")
async def validate_discount_endpoint(payload: dict, request: Request):
    rate_limit(f"discount:validate:{_client_ip(request)}", limit=20, window_seconds=60)
    code = (payload.get("code") or "").strip().upper()
    if not code:
        return {"valid": False, "message": "Rabattkod krävs"}
    return await validate_discount_code(code)


# ----------------------------------------------------------------------------
# Missing birds (private – only admin sees these reports)
# ----------------------------------------------------------------------------
@api.post("/missing-birds")
async def report_missing_bird(data: MissingBirdInput, request: Request):
    """Public endpoint. Anyone can report their bird missing. Report is private (only admin)."""
    rate_limit(f"submit:missing:{_client_ip(request)}", limit=5, window_seconds=3600)
    if not SWEDISH_PHONE_RE.match(data.contact_phone):
        raise HTTPException(status_code=400, detail="Ange ett giltigt svenskt telefonnummer")
    doc = {
        "id": str(uuid.uuid4()),
        "owner_name": data.owner_name,
        "contact_phone": data.contact_phone,
        "contact_email": data.contact_email,
        "species": data.species,
        "ring_number": data.ring_number,
        "description": data.description,
        "last_seen_location": data.last_seen_location,
        "last_seen_date": data.last_seen_date,
        "reward_offered": data.reward_offered,
        "status": "searching",
        "admin_notes": None,
        "found_at": None,
        "notified_at": None,
        "notification_message": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.missing_birds.insert_one(doc)
    await log_activity(None, data.contact_email, "missing_bird.report", doc["id"], {"species": data.species})
    doc.pop("_id", None)
    return doc


@api.get("/admin/missing-birds")
async def admin_list_missing_birds(
    _: dict = Depends(require_admin),
    status: Optional[str] = None,
    search: Optional[str] = None,
):
    q: dict = {}
    if status and status != "all":
        q["status"] = status
    if search:
        s = re.escape(search)
        q["$or"] = [
            {"owner_name": {"$regex": s, "$options": "i"}},
            {"species": {"$regex": s, "$options": "i"}},
            {"ring_number": {"$regex": s, "$options": "i"}},
            {"last_seen_location": {"$regex": s, "$options": "i"}},
            {"contact_phone": {"$regex": s, "$options": "i"}},
        ]
    return await db.missing_birds.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)


@api.patch("/admin/missing-birds/{report_id}")
async def admin_update_missing_bird(report_id: str, updates: MissingBirdUpdate, admin: dict = Depends(require_admin)):
    payload = {k: v for k, v in updates.model_dump(exclude_none=True).items()}
    if not payload:
        raise HTTPException(status_code=400, detail="Inget att uppdatera")
    if payload.get("status") == "found":
        payload["found_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.missing_birds.update_one({"id": report_id}, {"$set": payload})
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Rapport hittades inte")
    await log_activity(admin["user_id"], admin["email"], "admin.missing_bird.update", report_id, payload)
    return await db.missing_birds.find_one({"id": report_id}, {"_id": 0})


@api.post("/admin/missing-birds/{report_id}/notify")
async def admin_notify_missing_bird(report_id: str, data: MissingBirdNotify, admin: dict = Depends(require_admin)):
    """Record that admin has notified the reporter (usually because bird was found)."""
    now = datetime.now(timezone.utc).isoformat()
    result = await db.missing_birds.update_one(
        {"id": report_id},
        {"$set": {
            "notified_at": now,
            "notification_message": data.message,
        }},
    )
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Rapport hittades inte")
    await log_activity(admin["user_id"], admin["email"], "admin.missing_bird.notify", report_id, {"message": data.message})
    return await db.missing_birds.find_one({"id": report_id}, {"_id": 0})


@api.delete("/admin/missing-birds/{report_id}")
async def admin_delete_missing_bird(report_id: str, admin: dict = Depends(require_admin)):
    result = await db.missing_birds.delete_one({"id": report_id})
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail="Rapport hittades inte")
    await log_activity(admin["user_id"], admin["email"], "admin.missing_bird.delete", report_id)
    return {"success": True}


@api.get("/admin/missing-birds/export/csv")
async def admin_export_missing_birds(_: dict = Depends(require_admin)):
    items = await db.missing_birds.find({}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    return _csv_stream(items, "missing_birds", [
        "id", "owner_name", "contact_phone", "contact_email", "species",
        "ring_number", "last_seen_location", "last_seen_date", "status",
        "found_at", "notified_at", "created_at",
    ])


# ----------------------------------------------------------------------------
# Content pages (CMS) – "Om oss", "Kontakt", "FAQ", policyer, etc.
# ----------------------------------------------------------------------------
_SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def _normalize_slug(raw: str) -> str:
    s = raw.lower().strip().lstrip("/")
    s = re.sub(r"[åä]", "a", s)
    s = re.sub(r"[ö]", "o", s)
    s = re.sub(r"[^a-z0-9-]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s


@api.get("/content/{slug}")
async def get_public_content(slug: str):
    doc = await db.content_pages.find_one(
        {"slug": _normalize_slug(slug), "is_published": True},
        {"_id": 0},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Sidan hittades inte")
    return doc


@api.get("/content")
async def list_public_content():
    docs = await db.content_pages.find(
        {"is_published": True},
        {"_id": 0, "content": 0},
    ).sort("title", 1).to_list(200)
    return docs


@api.get("/admin/content")
async def admin_list_content(_: dict = Depends(require_admin)):
    docs = await db.content_pages.find({}, {"_id": 0}).sort("title", 1).to_list(200)
    return docs


@api.get("/admin/content/{page_id}")
async def admin_get_content(page_id: str, _: dict = Depends(require_admin)):
    doc = await db.content_pages.find_one({"id": page_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Sidan hittades inte")
    return doc


@api.post("/admin/content")
async def admin_create_content(data: ContentPageInput, admin: dict = Depends(require_admin)):
    slug = _normalize_slug(data.slug)
    if not slug or not _SLUG_RE.match(slug):
        raise HTTPException(status_code=400, detail="Ogiltig slug – använd endast a-z, 0-9 och bindestreck")
    if await db.content_pages.find_one({"slug": slug}):
        raise HTTPException(status_code=400, detail="En sida med denna slug finns redan")
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "slug": slug,
        "title": data.title,
        "content": data.content or "",
        "is_published": data.is_published,
        "created_at": now,
        "updated_at": now,
    }
    await db.content_pages.insert_one(doc)
    doc.pop("_id", None)
    await log_activity(admin["user_id"], admin["email"], "admin.content.create", slug)
    return doc


@api.patch("/admin/content/{page_id}")
async def admin_update_content(page_id: str, updates: ContentPageUpdate, admin: dict = Depends(require_admin)):
    payload = {k: v for k, v in updates.model_dump(exclude_none=True).items()}
    if not payload:
        raise HTTPException(status_code=400, detail="Inget att uppdatera")
    payload["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.content_pages.update_one({"id": page_id}, {"$set": payload})
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Sidan hittades inte")
    await log_activity(admin["user_id"], admin["email"], "admin.content.update", page_id, payload)
    return await db.content_pages.find_one({"id": page_id}, {"_id": 0})


@api.delete("/admin/content/{page_id}")
async def admin_delete_content(page_id: str, admin: dict = Depends(require_admin)):
    result = await db.content_pages.delete_one({"id": page_id})
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail="Sidan hittades inte")
    await log_activity(admin["user_id"], admin["email"], "admin.content.delete", page_id)
    return {"success": True}


# ----------------------------------------------------------------------------
# Homepage builder (drag-to-reorder sections)
# ----------------------------------------------------------------------------
@api.get("/homepage")
async def get_public_homepage():
    docs = await db.homepage_sections.find(
        {"is_visible": True},
        {"_id": 0},
    ).sort("sort_order", 1).to_list(100)
    return docs


@api.get("/admin/homepage")
async def admin_list_homepage(_: dict = Depends(require_admin)):
    return await db.homepage_sections.find({}, {"_id": 0}).sort("sort_order", 1).to_list(100)


@api.post("/admin/homepage")
async def admin_create_section(data: HomepageSectionInput, admin: dict = Depends(require_admin)):
    # Place new section at the end
    last = await db.homepage_sections.find_one({}, {"sort_order": 1}, sort=[("sort_order", -1)])
    next_order = (last.get("sort_order", 0) + 1) if last else 0
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "type": data.type,
        "label": data.label,
        "subtitle": data.subtitle,
        "is_visible": data.is_visible,
        "config": data.config or {},
        "sort_order": next_order,
        "created_at": now,
        "updated_at": now,
    }
    await db.homepage_sections.insert_one(doc)
    doc.pop("_id", None)
    await log_activity(admin["user_id"], admin["email"], "admin.homepage.create", doc["id"])
    return doc


@api.patch("/admin/homepage/{section_id}")
async def admin_update_section(section_id: str, updates: HomepageSectionUpdate, admin: dict = Depends(require_admin)):
    payload = {k: v for k, v in updates.model_dump(exclude_none=True).items()}
    if not payload:
        raise HTTPException(status_code=400, detail="Inget att uppdatera")
    payload["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.homepage_sections.update_one({"id": section_id}, {"$set": payload})
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Sektion hittades inte")
    await log_activity(admin["user_id"], admin["email"], "admin.homepage.update", section_id)
    return await db.homepage_sections.find_one({"id": section_id}, {"_id": 0})


@api.post("/admin/homepage/reorder")
async def admin_reorder_sections(data: HomepageReorder, admin: dict = Depends(require_admin)):
    for idx, section_id in enumerate(data.ids):
        await db.homepage_sections.update_one(
            {"id": section_id},
            {"$set": {"sort_order": idx, "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
    await log_activity(admin["user_id"], admin["email"], "admin.homepage.reorder", "*", {"count": len(data.ids)})
    return {"success": True}


@api.post("/admin/homepage/{section_id}/duplicate")
async def admin_duplicate_section(section_id: str, admin: dict = Depends(require_admin)):
    src = await db.homepage_sections.find_one({"id": section_id})
    if not src:
        raise HTTPException(status_code=404, detail="Sektion hittades inte")
    last = await db.homepage_sections.find_one({}, {"sort_order": 1}, sort=[("sort_order", -1)])
    next_order = (last.get("sort_order", 0) + 1) if last else 0
    now = datetime.now(timezone.utc).isoformat()
    copy = {**src, "id": str(uuid.uuid4()), "label": f"{src['label']} (kopia)", "sort_order": next_order, "created_at": now, "updated_at": now}
    copy.pop("_id", None)
    await db.homepage_sections.insert_one(copy)
    copy.pop("_id", None)
    await log_activity(admin["user_id"], admin["email"], "admin.homepage.duplicate", copy["id"])
    return copy


@api.delete("/admin/homepage/{section_id}")
async def admin_delete_section(section_id: str, admin: dict = Depends(require_admin)):
    result = await db.homepage_sections.delete_one({"id": section_id})
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail="Sektion hittades inte")
    await log_activity(admin["user_id"], admin["email"], "admin.homepage.delete", section_id)
    return {"success": True}


# ----------------------------------------------------------------------------
# Payment plans (yearly subscription tracking)
# ----------------------------------------------------------------------------
@api.get("/admin/payment-plans")
async def admin_list_payment_plans(
    _: dict = Depends(require_admin),
    status: Optional[str] = None,
    search: Optional[str] = None,
):
    q: dict = {}
    if status and status != "all":
        q["status"] = status
    if search:
        s = re.escape(search)
        q["$or"] = [
            {"user_email": {"$regex": s, "$options": "i"}},
            {"ring_number": {"$regex": s, "$options": "i"}},
        ]
    plans = await db.payment_plans.find(q, {"_id": 0}).sort("next_due_date", 1).to_list(1000)
    # Mark plans past their due date as past_due (lazy)
    today = datetime.now(timezone.utc).date().isoformat()
    for p in plans:
        if p.get("status") == "active" and p.get("next_due_date") and p["next_due_date"] < today:
            p["status"] = "past_due"
    return plans


@api.post("/admin/payment-plans/{plan_id}/renew")
async def admin_renew_plan(plan_id: str, admin: dict = Depends(require_admin)):
    plan = await db.payment_plans.find_one({"id": plan_id})
    if not plan:
        raise HTTPException(status_code=404, detail="Betalningsplan hittades inte")
    today = datetime.now(timezone.utc).date()
    # Roll next_due forward by 365 days from previous due (or from today if past)
    prev_due = plan.get("next_due_date")
    try:
        base = datetime.fromisoformat(prev_due).date() if prev_due else today
    except Exception:
        base = today
    if base < today:
        base = today
    new_due = (base + timedelta(days=365)).isoformat()
    await db.payment_plans.update_one(
        {"id": plan_id},
        {"$set": {
            "next_due_date": new_due,
            "last_payment_date": today.isoformat(),
            "status": "active",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    await db.registered_birds.update_one(
        {"id": plan.get("bird_id")},
        {"$set": {"annual_fee_paid_until": new_due, "payment_status": "completed"}},
    )
    await log_activity(admin["user_id"], admin["email"], "admin.plan.renew", plan_id, {"next_due": new_due})
    return await db.payment_plans.find_one({"id": plan_id}, {"_id": 0})


@api.post("/admin/payment-plans/{plan_id}/cancel")
async def admin_cancel_plan(plan_id: str, admin: dict = Depends(require_admin)):
    result = await db.payment_plans.update_one(
        {"id": plan_id},
        {"$set": {"status": "cancelled", "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Betalningsplan hittades inte")
    await log_activity(admin["user_id"], admin["email"], "admin.plan.cancel", plan_id)
    return {"success": True}


@api.get("/admin/payment-plans/export/csv")
async def admin_export_payment_plans(_: dict = Depends(require_admin)):
    plans = await db.payment_plans.find({}, {"_id": 0}).sort("next_due_date", 1).to_list(5000)
    return _csv_stream(plans, "payment_plans", [
        "id", "user_email", "ring_number", "plan_type", "registration_amount",
        "annual_amount", "start_date", "next_due_date", "last_payment_date",
        "status", "created_at",
    ])


# ----------------------------------------------------------------------------
# Navigation menu (top-nav with dropdowns)
# ----------------------------------------------------------------------------
def _menu_item_out(doc: dict) -> dict:
    return {k: v for k, v in doc.items() if k != "_id"}


@api.get("/menu")
async def get_public_menu():
    """Return menu as a tree: top-level items with children[] for dropdowns."""
    items = await db.menu_items.find(
        {"is_visible": True},
        {"_id": 0},
    ).sort("sort_order", 1).to_list(200)
    tops = [i for i in items if not i.get("parent_id")]
    children_by_parent = {}
    for i in items:
        if i.get("parent_id"):
            children_by_parent.setdefault(i["parent_id"], []).append(i)
    for t in tops:
        t["children"] = children_by_parent.get(t["id"], [])
    return tops


@api.get("/admin/menu")
async def admin_list_menu(_: dict = Depends(require_admin)):
    return await db.menu_items.find({}, {"_id": 0}).sort("sort_order", 1).to_list(200)


@api.post("/admin/menu")
async def admin_create_menu_item(data: MenuItemInput, admin: dict = Depends(require_admin)):
    if data.parent_id:
        parent = await db.menu_items.find_one({"id": data.parent_id})
        if not parent:
            raise HTTPException(status_code=400, detail="Överordnat menyval hittades inte")
        if parent.get("parent_id"):
            raise HTTPException(status_code=400, detail="Meny stöder endast en nivå av rullgardin")
    # Auto-place at end of siblings
    sibling_q = {"parent_id": data.parent_id} if data.parent_id else {"parent_id": None}
    last = await db.menu_items.find_one(sibling_q, sort=[("sort_order", -1)])
    next_order = (last["sort_order"] + 1) if last else 0
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "label": data.label,
        "url": data.url,
        "parent_id": data.parent_id,
        "is_visible": data.is_visible,
        "sort_order": next_order,
        "created_at": now,
        "updated_at": now,
    }
    await db.menu_items.insert_one(doc)
    await log_activity(admin["user_id"], admin["email"], "admin.menu.create", doc["id"], {"label": data.label})
    return _menu_item_out(doc)


@api.patch("/admin/menu/{item_id}")
async def admin_update_menu_item(item_id: str, updates: MenuItemUpdate, admin: dict = Depends(require_admin)):
    payload = updates.model_dump(exclude_unset=True)
    if not payload:
        raise HTTPException(status_code=400, detail="Inget att uppdatera")
    if "parent_id" in payload and payload["parent_id"]:
        if payload["parent_id"] == item_id:
            raise HTTPException(status_code=400, detail="En sida kan inte vara sitt eget överordnade val")
        parent = await db.menu_items.find_one({"id": payload["parent_id"]})
        if not parent:
            raise HTTPException(status_code=400, detail="Överordnat menyval hittades inte")
        if parent.get("parent_id"):
            raise HTTPException(status_code=400, detail="Meny stöder endast en nivå av rullgardin")
        # Prevent making a top-level item a child if it has children
        has_kids = await db.menu_items.count_documents({"parent_id": item_id})
        if has_kids:
            raise HTTPException(status_code=400, detail="Detta menyval har underval — flytta dem först")
    payload["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.menu_items.update_one({"id": item_id}, {"$set": payload})
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Menyval hittades inte")
    await log_activity(admin["user_id"], admin["email"], "admin.menu.update", item_id)
    return _menu_item_out(await db.menu_items.find_one({"id": item_id}))


@api.post("/admin/menu/reorder")
async def admin_reorder_menu(data: MenuReorder, admin: dict = Depends(require_admin)):
    for idx, item_id in enumerate(data.ids):
        await db.menu_items.update_one(
            {"id": item_id},
            {"$set": {"sort_order": idx, "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
    await log_activity(admin["user_id"], admin["email"], "admin.menu.reorder", "*", {"count": len(data.ids)})
    return {"success": True}


@api.delete("/admin/menu/{item_id}")
async def admin_delete_menu_item(item_id: str, admin: dict = Depends(require_admin)):
    # Also delete children
    await db.menu_items.delete_many({"parent_id": item_id})
    result = await db.menu_items.delete_one({"id": item_id})
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail="Menyval hittades inte")
    await log_activity(admin["user_id"], admin["email"], "admin.menu.delete", item_id)
    return {"success": True}


# ----------------------------------------------------------------------------
# Community posts (moderated)
# ----------------------------------------------------------------------------
def _sanitize_post(doc: dict, include_private: bool = False) -> dict:
    out = {k: v for k, v in doc.items() if k != "_id"}
    if not include_private:
        # Strip fields that expose contact info / internal IDs to non-owners
        out.pop("moderated_by", None)
        out.pop("moderated_by_email", None)
        out.pop("author_email", None)
        out.pop("user_id", None)
    return out


@api.post("/posts")
async def create_post(data: PostInput, user: dict = Depends(get_current_user)):
    if len(data.image_urls) > 8:
        raise HTTPException(status_code=400, detail="Max 8 bilder per inlägg")

    bird_species: Optional[str] = None
    if data.bird_id:
        bird = await db.registered_birds.find_one({"id": data.bird_id})
        if not bird:
            raise HTTPException(status_code=404, detail="Fågel hittades inte")
        if bird.get("user_id") and bird["user_id"] != user["user_id"] and user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Du kan bara skapa inlägg för dina egna fåglar")
        bird_species = bird.get("species")

    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["user_id"],
        "author_name": f"{user.get('first_name') or ''} {user.get('last_name') or ''}".strip() or user["email"],
        "author_email": user["email"],
        "bird_id": data.bird_id,
        "bird_species": bird_species,
        "title": data.title,
        "content": data.content,
        "image_urls": data.image_urls,
        "status": "pending",
        "reject_reason": None,
        "moderated_by": None,
        "moderated_by_email": None,
        "moderated_at": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.posts.insert_one(doc)
    await log_activity(user["user_id"], user["email"], "post.create", doc["id"], {"title": data.title})
    return _sanitize_post(doc)


@api.get("/posts")
async def list_public_posts(search: Optional[str] = None):
    q: dict = {"status": "approved"}
    if search:
        s = re.escape(search)
        q["$or"] = [
            {"title": {"$regex": s, "$options": "i"}},
            {"content": {"$regex": s, "$options": "i"}},
            {"bird_species": {"$regex": s, "$options": "i"}},
            {"author_name": {"$regex": s, "$options": "i"}},
        ]
    docs = await db.posts.find(q).sort("moderated_at", -1).to_list(500)
    return [_sanitize_post(d) for d in docs]


@api.get("/my-posts")
async def list_my_posts(user: dict = Depends(get_current_user)):
    docs = await db.posts.find({"user_id": user["user_id"]}).sort("created_at", -1).to_list(500)
    return [_sanitize_post(d, include_private=True) for d in docs]


@api.delete("/posts/{post_id}")
async def delete_own_post(post_id: str, user: dict = Depends(get_current_user)):
    post = await db.posts.find_one({"id": post_id})
    if not post:
        raise HTTPException(status_code=404, detail="Inlägg hittades inte")
    if post["user_id"] != user["user_id"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Du kan bara ta bort dina egna inlägg")
    await db.posts.delete_one({"id": post_id})
    await log_activity(user["user_id"], user["email"], "post.delete", post_id)
    return {"success": True}


# ---- Admin post moderation ----
@api.get("/admin/posts")
async def admin_list_posts(_: dict = Depends(require_admin), status: Optional[str] = None):
    q: dict = {}
    if status and status != "all":
        q["status"] = status
    docs = await db.posts.find(q).sort("created_at", -1).to_list(1000)
    return [_sanitize_post(d, include_private=True) for d in docs]


@api.post("/admin/posts/{post_id}/approve")
async def admin_approve_post(post_id: str, admin: dict = Depends(require_admin)):
    now = datetime.now(timezone.utc).isoformat()
    result = await db.posts.update_one(
        {"id": post_id},
        {"$set": {
            "status": "approved",
            "reject_reason": None,
            "moderated_by": admin["user_id"],
            "moderated_by_email": admin["email"],
            "moderated_at": now,
        }},
    )
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Inlägg hittades inte")
    await log_activity(admin["user_id"], admin["email"], "admin.post.approve", post_id)
    return {"success": True}


@api.post("/admin/posts/{post_id}/reject")
async def admin_reject_post(post_id: str, data: PostRejectInput, admin: dict = Depends(require_admin)):
    now = datetime.now(timezone.utc).isoformat()
    result = await db.posts.update_one(
        {"id": post_id},
        {"$set": {
            "status": "rejected",
            "reject_reason": data.reason,
            "moderated_by": admin["user_id"],
            "moderated_by_email": admin["email"],
            "moderated_at": now,
        }},
    )
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Inlägg hittades inte")
    await log_activity(admin["user_id"], admin["email"], "admin.post.reject", post_id, {"reason": data.reason})
    return {"success": True}


@api.delete("/admin/posts/{post_id}")
async def admin_delete_post(post_id: str, admin: dict = Depends(require_admin)):
    result = await db.posts.delete_one({"id": post_id})
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail="Inlägg hittades inte")
    await log_activity(admin["user_id"], admin["email"], "admin.post.delete", post_id)
    return {"success": True}


# ----------------------------------------------------------------------------
# ADMIN endpoints
# ----------------------------------------------------------------------------
@api.get("/admin/stats")
async def admin_stats(_: dict = Depends(require_admin)):
    total_users = await db.users.count_documents({})
    blocked_users = await db.users.count_documents({"is_blocked": True})
    total_birds = await db.registered_birds.count_documents({})
    paid_birds = await db.registered_birds.count_documents({"payment_status": "completed"})
    pending_birds = await db.registered_birds.count_documents({"payment_status": "pending"})
    total_found = await db.found_birds.count_documents({})
    total_feedback = await db.feedback.count_documents({})
    total_comments = await db.bird_comments.count_documents({})
    total_discount = await db.discount_codes.count_documents({})
    pending_posts = await db.posts.count_documents({"status": "pending"})
    approved_posts = await db.posts.count_documents({"status": "approved"})
    missing_searching = await db.missing_birds.count_documents({"status": "searching"})
    missing_found = await db.missing_birds.count_documents({"status": "found"})

    # Revenue: sum registration_fee (final_amount if set else 300) for completed birds
    revenue_cursor = db.registered_birds.aggregate([
        {"$match": {"payment_status": "completed"}},
        {"$group": {"_id": None, "total": {"$sum": {"$ifNull": ["$final_amount", 300]}}}},
    ])
    revenue_doc = await revenue_cursor.to_list(1)
    total_revenue = float(revenue_doc[0]["total"]) if revenue_doc else 0.0

    # Time-series: registrations per day for last 30 days
    now = datetime.now(timezone.utc).date()
    since = (now - timedelta(days=29)).isoformat()
    series_cursor = db.registered_birds.aggregate([
        {"$match": {"registration_date": {"$gte": since}}},
        {"$group": {"_id": "$registration_date", "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
    ])
    reg_by_day_raw = {d["_id"]: d["count"] for d in await series_cursor.to_list(100)}
    registrations_series = []
    for i in range(30):
        day = (now - timedelta(days=29 - i)).isoformat()
        registrations_series.append({"date": day, "count": reg_by_day_raw.get(day, 0)})

    # Species breakdown
    species_cursor = db.registered_birds.aggregate([
        {"$group": {"_id": "$species", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 8},
    ])
    species_top = [{"species": s["_id"], "count": s["count"]} for s in await species_cursor.to_list(20)]

    return {
        "total_users": total_users,
        "blocked_users": blocked_users,
        "total_registered_birds": total_birds,
        "paid_birds": paid_birds,
        "pending_birds": pending_birds,
        "total_found_birds": total_found,
        "total_feedback": total_feedback,
        "total_comments": total_comments,
        "total_discount_codes": total_discount,
        "pending_posts": pending_posts,
        "approved_posts": approved_posts,
        "missing_searching": missing_searching,
        "missing_found": missing_found,
        "total_revenue": total_revenue,
        "registrations_series": registrations_series,
        "species_top": species_top,
    }


@api.get("/admin/users")
async def admin_users(
    _: dict = Depends(require_admin),
    search: Optional[str] = None,
    role: Optional[str] = None,
    is_blocked: Optional[bool] = None,
):
    q: dict = {}
    if search:
        s = re.escape(search)
        q["$or"] = [
            {"email": {"$regex": s, "$options": "i"}},
            {"first_name": {"$regex": s, "$options": "i"}},
            {"last_name": {"$regex": s, "$options": "i"}},
        ]
    if role:
        q["role"] = role
    if is_blocked is not None:
        q["is_blocked"] = is_blocked
    users = await db.users.find(q, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(1000)

    # Attach bird counts
    for u in users:
        u["bird_count"] = await db.registered_birds.count_documents({"user_id": u["user_id"]})
    return users


@api.get("/admin/users/{user_id}")
async def admin_user_detail(user_id: str, _: dict = Depends(require_admin)):
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Användare hittades inte")
    birds = await db.registered_birds.find({"user_id": user_id}, {"_id": 0}).sort("registration_date", -1).to_list(200)
    user["registered_birds"] = birds
    return user


@api.patch("/admin/users/{user_id}")
async def admin_user_update(user_id: str, updates: UserUpdate, admin: dict = Depends(require_admin)):
    payload = {k: v for k, v in updates.model_dump(exclude_none=True).items()}
    if not payload:
        raise HTTPException(status_code=400, detail="Inget att uppdatera")
    payload["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.users.update_one({"user_id": user_id}, {"$set": payload})
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Användare hittades inte")
    await log_activity(admin["user_id"], admin["email"], "admin.user.update", user_id, payload)
    return await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})


@api.put("/admin/users/{user_id}/block")
async def admin_block_user(user_id: str, admin: dict = Depends(require_admin)):
    result = await db.users.update_one({"user_id": user_id}, {"$set": {"is_blocked": True, "updated_at": datetime.now(timezone.utc).isoformat()}})
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Användare hittades inte")
    await log_activity(admin["user_id"], admin["email"], "admin.user.block", user_id)
    return {"success": True}


@api.put("/admin/users/{user_id}/unblock")
async def admin_unblock_user(user_id: str, admin: dict = Depends(require_admin)):
    result = await db.users.update_one({"user_id": user_id}, {"$set": {"is_blocked": False, "updated_at": datetime.now(timezone.utc).isoformat()}})
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Användare hittades inte")
    await log_activity(admin["user_id"], admin["email"], "admin.user.unblock", user_id)
    return {"success": True}


@api.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, admin: dict = Depends(require_admin)):
    if user_id == admin["user_id"]:
        raise HTTPException(status_code=400, detail="Du kan inte ta bort ditt eget konto")
    result = await db.users.delete_one({"user_id": user_id})
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail="Användare hittades inte")
    await db.registered_birds.update_many({"user_id": user_id}, {"$set": {"user_id": None}})
    await log_activity(admin["user_id"], admin["email"], "admin.user.delete", user_id)
    return {"success": True}


# ---- Registered Birds admin ----
@api.get("/admin/registered-birds")
async def admin_list_registered_birds(
    _: dict = Depends(require_admin),
    search: Optional[str] = None,
    payment_status: Optional[str] = None,
    species: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    limit: int = Query(500, le=2000),
):
    q: dict = {}
    if search:
        s = re.escape(search)
        q["$or"] = [
            {"ring_number": {"$regex": s, "$options": "i"}},
            {"owner_name": {"$regex": s, "$options": "i"}},
            {"species": {"$regex": s, "$options": "i"}},
            {"phone_number": {"$regex": s, "$options": "i"}},
        ]
    if payment_status:
        q["payment_status"] = payment_status
    if species:
        q["species"] = species
    if from_date or to_date:
        d: dict = {}
        if from_date:
            d["$gte"] = from_date
        if to_date:
            d["$lte"] = to_date
        q["registration_date"] = d
    birds = await db.registered_birds.find(q, {"_id": 0}).sort("registration_date", -1).to_list(limit)
    return birds


@api.get("/admin/registered-birds/{bird_id}")
async def admin_get_registered_bird(bird_id: str, _: dict = Depends(require_admin)):
    bird = await db.registered_birds.find_one({"id": bird_id}, {"_id": 0})
    if not bird:
        raise HTTPException(status_code=404, detail="Fågel hittades inte")
    return bird


@api.patch("/admin/registered-birds/{bird_id}")
async def admin_update_registered_bird(bird_id: str, updates: BirdUpdate, admin: dict = Depends(require_admin)):
    payload = {k: v for k, v in updates.model_dump(exclude_none=True).items()}
    if not payload:
        raise HTTPException(status_code=400, detail="Inget att uppdatera")
    if "ring_number" in payload:
        payload["ring_number"] = _normalize_ring(payload["ring_number"])
        if not payload["ring_number"]:
            raise HTTPException(status_code=400, detail="Ringnummer krävs")
        conflict = await db.registered_birds.find_one({"ring_number": payload["ring_number"], "id": {"$ne": bird_id}})
        if conflict:
            raise HTTPException(status_code=400, detail=f"Ringnummer {payload['ring_number']} är redan registrerat")
    try:
        result = await db.registered_birds.update_one({"id": bird_id}, {"$set": payload})
    except DuplicateKeyError:
        raise HTTPException(status_code=400, detail="Ringnummer är redan registrerat")
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Fågel hittades inte")
    await log_activity(admin["user_id"], admin["email"], "admin.bird.update", bird_id, payload)
    return await db.registered_birds.find_one({"id": bird_id}, {"_id": 0})


@api.delete("/admin/registered-birds/{bird_id}")
async def admin_delete_registered_bird(bird_id: str, admin: dict = Depends(require_admin)):
    result = await db.registered_birds.delete_one({"id": bird_id})
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail="Fågel hittades inte")
    await db.bird_comments.delete_many({"bird_id": bird_id})
    await log_activity(admin["user_id"], admin["email"], "admin.bird.delete", bird_id)
    return {"success": True}


@api.get("/admin/registered-birds/export/csv")
async def admin_export_registered_birds(_: dict = Depends(require_admin)):
    birds = await db.registered_birds.find({}, {"_id": 0}).sort("registration_date", -1).to_list(5000)
    return _csv_stream(birds, "registered_birds", [
        "id", "species", "ring_number", "owner_name", "phone_number",
        "payment_status", "registration_date", "final_amount", "user_id",
    ])


# ---- Found Birds admin ----
@api.get("/admin/found-birds")
async def admin_list_found_birds(_: dict = Depends(require_admin), search: Optional[str] = None):
    q: dict = {}
    if search:
        s = re.escape(search)
        q["$or"] = [
            {"description": {"$regex": s, "$options": "i"}},
            {"location": {"$regex": s, "$options": "i"}},
            {"finder_name": {"$regex": s, "$options": "i"}},
            {"ring_number": {"$regex": s, "$options": "i"}},
        ]
    return await db.found_birds.find(q, {"_id": 0}).sort("report_date", -1).to_list(1000)


@api.delete("/admin/found-birds/{bird_id}")
async def admin_delete_found_bird(bird_id: str, admin: dict = Depends(require_admin)):
    result = await db.found_birds.delete_one({"id": bird_id})
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail="Rapport hittades inte")
    await log_activity(admin["user_id"], admin["email"], "admin.found_bird.delete", bird_id)
    return {"success": True}


@api.get("/admin/found-birds/export/csv")
async def admin_export_found_birds(_: dict = Depends(require_admin)):
    birds = await db.found_birds.find({}, {"_id": 0}).sort("report_date", -1).to_list(5000)
    return _csv_stream(birds, "found_birds", [
        "id", "description", "location", "date_found", "ring_number",
        "finder_name", "finder_phone", "report_date",
    ])


# ---- Discount codes admin ----
@api.get("/admin/discount-codes")
async def admin_list_discount_codes(_: dict = Depends(require_admin)):
    return await db.discount_codes.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.post("/admin/discount-codes")
async def admin_create_discount_code(data: DiscountCodeInput, admin: dict = Depends(require_admin)):
    code = data.code.upper().strip()
    existing = await db.discount_codes.find_one({"code": code})
    if existing:
        raise HTTPException(status_code=400, detail="Rabattkoden finns redan")
    doc = {
        "id": str(uuid.uuid4()),
        "code": code,
        "discount_percentage": data.discount_percentage,
        "expiry_date": data.expiry_date,
        "usage_limit": data.usage_limit,
        "used_count": 0,
        "is_active": data.is_active,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.discount_codes.insert_one(doc)
    doc.pop("_id", None)
    await log_activity(admin["user_id"], admin["email"], "admin.discount.create", code)
    return doc


@api.patch("/admin/discount-codes/{code_id}")
async def admin_update_discount_code(code_id: str, updates: DiscountCodeUpdate, admin: dict = Depends(require_admin)):
    payload = {k: v for k, v in updates.model_dump(exclude_none=True).items()}
    if not payload:
        raise HTTPException(status_code=400, detail="Inget att uppdatera")
    result = await db.discount_codes.update_one({"id": code_id}, {"$set": payload})
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Rabattkod hittades inte")
    await log_activity(admin["user_id"], admin["email"], "admin.discount.update", code_id, payload)
    return await db.discount_codes.find_one({"id": code_id}, {"_id": 0})


@api.delete("/admin/discount-codes/{code_id}")
async def admin_delete_discount_code(code_id: str, admin: dict = Depends(require_admin)):
    result = await db.discount_codes.delete_one({"id": code_id})
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail="Rabattkod hittades inte")
    await log_activity(admin["user_id"], admin["email"], "admin.discount.delete", code_id)
    return {"success": True}


# ---- Feedback admin ----
@api.get("/admin/feedback")
async def admin_list_feedback(_: dict = Depends(require_admin)):
    return await db.feedback.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)


@api.delete("/admin/feedback/{feedback_id}")
async def admin_delete_feedback(feedback_id: str, admin: dict = Depends(require_admin)):
    result = await db.feedback.delete_one({"id": feedback_id})
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail="Feedback hittades inte")
    await log_activity(admin["user_id"], admin["email"], "admin.feedback.delete", feedback_id)
    return {"success": True}


@api.get("/admin/feedback/export/csv")
async def admin_export_feedback(_: dict = Depends(require_admin)):
    items = await db.feedback.find({}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    return _csv_stream(items, "feedback", ["id", "rating", "comment", "email", "created_at"])


# ---- Comments admin ----
@api.get("/admin/comments")
async def admin_list_comments(_: dict = Depends(require_admin)):
    return await db.bird_comments.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)


@api.delete("/admin/comments/{comment_id}")
async def admin_delete_comment(comment_id: str, admin: dict = Depends(require_admin)):
    result = await db.bird_comments.delete_one({"id": comment_id})
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail="Kommentar hittades inte")
    await log_activity(admin["user_id"], admin["email"], "admin.comment.delete", comment_id)
    return {"success": True}


# ---- Users export ----
@api.get("/admin/users/export/csv")
async def admin_export_users(_: dict = Depends(require_admin)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(5000)
    return _csv_stream(users, "users", [
        "user_id", "email", "first_name", "last_name", "role",
        "is_blocked", "auth_provider", "created_at",
    ])


# ---- Activity log ----
@api.get("/admin/activity")
async def admin_activity(_: dict = Depends(require_admin), limit: int = Query(100, le=500)):
    return await db.activity_logs.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)


# ---- Bird comments public (for gallery) ----
@api.get("/birds/{bird_id}/comments")
async def get_bird_comments(bird_id: str):
    # Strip commenter_email from public output
    return await db.bird_comments.find(
        {"bird_id": bird_id},
        {"_id": 0, "commenter_email": 0},
    ).sort("created_at", -1).to_list(500)


@api.post("/birds/{bird_id}/comments")
async def create_bird_comment(bird_id: str, data: CommentInput, request: Request):
    rate_limit(f"comment:{_client_ip(request)}", limit=10, window_seconds=3600)
    bird = await db.registered_birds.find_one({"id": bird_id})
    if not bird:
        raise HTTPException(status_code=404, detail="Fågel hittades inte")
    doc = {
        "id": str(uuid.uuid4()),
        "bird_id": bird_id,
        "comment_text": data.comment_text,
        "commenter_name": data.commenter_name,
        "commenter_email": data.commenter_email,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.bird_comments.insert_one(doc)
    doc.pop("_id", None)
    return doc


# ----------------------------------------------------------------------------
# CSV helper
# ----------------------------------------------------------------------------
def _csv_stream(rows: List[dict], filename: str, columns: List[str]) -> StreamingResponse:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=columns, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        clean = {c: row.get(c, "") for c in columns}
        for k, v in clean.items():
            if isinstance(v, (list, dict)):
                clean[k] = str(v)
        writer.writerow(clean)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}.csv"},
    )


# ----------------------------------------------------------------------------
# Startup – seed admin, test user, sample data, indexes
# ----------------------------------------------------------------------------
@app.on_event("startup")
async def startup():
    # Indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.registered_birds.create_index("ring_number", unique=True)
    await db.registered_birds.create_index("id", unique=True)

    # One-time normalization of existing ring_numbers to uppercase (idempotent)
    cursor = db.registered_birds.find({}, {"id": 1, "ring_number": 1})
    async for doc in cursor:
        current = doc.get("ring_number")
        normalized = _normalize_ring(current)
        if normalized and normalized != current:
            existing = await db.registered_birds.find_one({"ring_number": normalized, "id": {"$ne": doc["id"]}})
            if existing:
                # Collision — leave as-is and log
                logger.warning(
                    "Ring collision: %s and %s both normalize to %s",
                    doc["id"], existing["id"], normalized,
                )
                continue
            try:
                await db.registered_birds.update_one(
                    {"id": doc["id"]},
                    {"$set": {"ring_number": normalized}},
                )
            except DuplicateKeyError:
                pass
    await db.found_birds.create_index("id", unique=True)
    await db.discount_codes.create_index("code", unique=True)
    await db.discount_codes.create_index("id", unique=True)
    await db.user_sessions.create_index("session_token")
    await db.posts.create_index("id", unique=True)
    await db.posts.create_index("status")
    await db.posts.create_index("user_id")
    await db.missing_birds.create_index("id", unique=True)
    await db.missing_birds.create_index("status")
    await db.content_pages.create_index("slug", unique=True)
    await db.content_pages.create_index("id", unique=True)
    await db.homepage_sections.create_index("id", unique=True)
    await db.homepage_sections.create_index("sort_order")
    await db.menu_items.create_index("id", unique=True)
    await db.menu_items.create_index("parent_id")
    await db.menu_items.create_index("sort_order")
    await db.payment_plans.create_index("id", unique=True)
    await db.payment_plans.create_index("user_id")
    await db.payment_plans.create_index("bird_id")
    await db.payment_plans.create_index("next_due_date")

    now = datetime.now(timezone.utc).isoformat()

    # Seed admin
    admin_email = ADMIN_EMAIL.lower()
    admin = await db.users.find_one({"email": admin_email})
    if not admin:
        await db.users.insert_one({
            "user_id": f"user_{uuid.uuid4().hex[:12]}",
            "email": admin_email,
            "password_hash": hash_password(ADMIN_PASSWORD),
            "first_name": "Admin",
            "last_name": "",
            "role": "admin",
            "is_blocked": False,
            "profile_image_url": None,
            "auth_provider": "password",
            "created_at": now,
            "updated_at": now,
        })
        logger.info("Seeded admin user %s", admin_email)
    else:
        # Make sure role is admin and password matches env
        updates = {"role": "admin"}
        if not verify_password(ADMIN_PASSWORD, admin.get("password_hash") or ""):
            updates["password_hash"] = hash_password(ADMIN_PASSWORD)
        await db.users.update_one({"email": admin_email}, {"$set": updates})

    # Seed test user
    test_email = "test@papegojregistret.se"
    test_user = await db.users.find_one({"email": test_email})
    if not test_user:
        test_uid = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": test_uid,
            "email": test_email,
            "password_hash": hash_password("Test123!"),
            "first_name": "Testa",
            "last_name": "Testsson",
            "role": "user",
            "is_blocked": False,
            "profile_image_url": None,
            "auth_provider": "password",
            "created_at": now,
            "updated_at": now,
        })
        # Seed some registered birds for test user
        sample_species = ["ara-blå-gul", "grå-papegoja-kongo", "cockatiel", "budgerigar", "eclectus"]
        for i, sp in enumerate(sample_species):
            ring = f"SE{100000 + i}"
            if await db.registered_birds.find_one({"ring_number": ring}):
                continue
            await db.registered_birds.insert_one({
                "id": str(uuid.uuid4()),
                "user_id": test_uid,
                "species": sp,
                "ring_number": ring,
                "owner_name": "Testa Testsson",
                "phone_number": "0701234567",
                "additional_info": f"Testfågel {i+1}",
                "image_urls": [],
                "registration_date": (datetime.now(timezone.utc).date() - timedelta(days=i * 3)).isoformat(),
                "payment_status": "completed" if i % 2 == 0 else "pending",
                "stripe_payment_intent_id": None,
                "registration_fee_amount": 300,
                "annual_fee_amount": 100,
                "annual_fee_paid_until": None,
                "discount_code_id": None,
                "final_amount": 300.0,
                "created_at": now,
            })

    # Seed default discount code
    if not await db.discount_codes.find_one({"code": "PARROTS15"}):
        await db.discount_codes.insert_one({
            "id": str(uuid.uuid4()),
            "code": "PARROTS15",
            "discount_percentage": 15,
            "expiry_date": None,
            "usage_limit": 100,
            "used_count": 0,
            "is_active": True,
            "created_at": now,
        })

    # Seed one sample found-bird report
    if await db.found_birds.count_documents({}) == 0:
        await db.found_birds.insert_one({
            "id": str(uuid.uuid4()),
            "description": "Grön papegoja hittad i parken, kunde säga 'hej'",
            "location": "Slottsparken, Malmö",
            "date_found": datetime.now(timezone.utc).date().isoformat(),
            "ring_number": None,
            "finder_name": "Anna Andersson",
            "finder_phone": "0709876543",
            "report_date": datetime.now(timezone.utc).date().isoformat(),
            "created_at": now,
        })

    # Seed default content pages (only if collection is empty – don't overwrite edits)
    if await db.content_pages.count_documents({}) == 0:
        default_pages = [
            {
                "slug": "om-oss",
                "title": "Om oss",
                "content": (
                    "# Om Papegojregistret\n\n"
                    "Papegojregistret drivs för att hjälpa svenska papegojägare "
                    "att återförenas med sina fåglar. Genom att registrera ditt "
                    "ringnummer skapar du en säker koppling mellan dig och din "
                    "fågel — så volontärer, veterinärer och grannar snabbt kan "
                    "kontakta dig om något händer."
                ),
            },
            {
                "slug": "kontakt",
                "title": "Kontakt",
                "content": (
                    "## Kontakta oss\n\n"
                    "**E-post:** info@papegojregistret.se\n\n"
                    "**Telefon:** 0768 48 80 91\n\n"
                    "**Post:** Papegojregistret, Box 1234, 200 15 Malmö"
                ),
            },
            {
                "slug": "faq",
                "title": "FAQ",
                "content": (
                    "## Vanliga frågor\n\n"
                    "**Vad kostar det att registrera?**\n"
                    "300 kr engångsavgift + 100 kr per år.\n\n"
                    "**Måste fågeln ha ringmärkning?**\n"
                    "Ja, ringnumret är det som gör återförening möjligt.\n\n"
                    "**Vem ser mina uppgifter?**\n"
                    "Endast admin och den som hittar din fågel via ringnumret."
                ),
            },
            {
                "slug": "kopvillkor",
                "title": "Köpvillkor",
                "content": (
                    "## Köpvillkor\n\n"
                    "Registrering är en tjänst. Genom att slutföra en beställning "
                    "godkänner du dessa villkor. Priser inkluderar moms. Betalning "
                    "sker via Stripe."
                ),
            },
            {
                "slug": "returer",
                "title": "Returer och återbetalningspolicyn",
                "content": (
                    "## Returer och återbetalning\n\n"
                    "Registreringen kan avbrytas inom 14 dagar från betalning för "
                    "full återbetalning. Kontakta info@papegojregistret.se."
                ),
            },
            {
                "slug": "frakt-leverans",
                "title": "Frakt & Leverans",
                "content": (
                    "## Frakt & Leverans\n\n"
                    "Papegojregistret är en digital tjänst — ingen fysisk leverans "
                    "krävs. Din registrering aktiveras omedelbart efter betalning."
                ),
            },
            {
                "slug": "integritetspolicy",
                "title": "Integritetspolicy",
                "content": (
                    "## Integritetspolicy\n\n"
                    "Vi behandlar dina personuppgifter enligt GDPR. Uppgifter "
                    "som samlas in: namn, telefonnummer, e-post och ringnummer. "
                    "Uppgifterna delas aldrig med tredje part utan ditt samtycke."
                ),
            },
        ]
        for i, p in enumerate(default_pages):
            await db.content_pages.insert_one({
                "id": str(uuid.uuid4()),
                "slug": p["slug"],
                "title": p["title"],
                "content": p["content"],
                "is_published": True,
                "created_at": now,
                "updated_at": now,
            })

    # Seed default homepage sections (only if empty)
    if await db.homepage_sections.count_documents({}) == 0:
        default_sections = [
            {
                "type": "hero",
                "label": "Hero (huvudsektion)",
                "subtitle": "Skapa unika produkter med dina bilder",
                "config": {
                    "eyebrow": "Sveriges papegojregister",
                    "title": "Ringnummer. Återförening. Papegojregistret.",
                    "highlighted_word": "Papegojregistret",
                    "body": "Registrera din papegoja med ringnummer och gör det möjligt för volontärer att återförena er om fågeln försvinner.",
                    "cta_primary_label": "Registrera fågel",
                    "cta_primary_link": "/registrera-fagel",
                    "cta_secondary_label": "Se galleriet",
                    "cta_secondary_link": "/galleri",
                    "cta_tertiary_label": "Rapportera hittad",
                    "cta_tertiary_link": "/rapportera-hittad",
                    "image_url": "https://images.unsplash.com/photo-1606383069718-104a95938112?crop=entropy&cs=srgb&fm=jpg&q=85",
                },
            },
            {
                "type": "emergency_cta",
                "label": "Bortflögen fågel (nöd-CTA)",
                "subtitle": "Har din papegoja flugit iväg?",
                "config": {
                    "title": "Har din papegoja flugit iväg?",
                    "body": "Rapportera privat till admin — de kontaktar dig när något matchar",
                    "link_label": "Rapportera",
                    "link_url": "/rapportera-bortflygen",
                    "tone": "destructive",
                },
            },
            {
                "type": "features",
                "label": "Fördelar (3 kort)",
                "subtitle": "Så här funkar det",
                "config": {
                    "items": [
                        {"icon": "shield", "title": "Säker registrering", "text": "Ringnummer, ägaruppgifter och kontaktinfo lagras enligt GDPR.", "link": "/sidor/integritetspolicy"},
                        {"icon": "magnifying-glass", "title": "Rapportera fynd", "text": "Hittad papegoja? Rapportera på 30 sekunder — utan konto.", "link": "/rapportera-bortflygen"},
                        {"icon": "feather", "title": "Enkel avgift", "text": "300 kr per fågel + 100 kr/år för hela flocken. Ingen krångel.", "link": "/sidor/kopvillkor"},
                    ],
                },
            },
            {
                "type": "text_block",
                "label": "Textblock (Om registret)",
                "subtitle": "En kort intro",
                "is_visible": False,
                "config": {
                    "title": "Skydd genom gemenskap",
                    "content": "Papegojregistret finns för att skapa en snabb koppling mellan ringnummer och ägare — så att en försvunnen fågel snabbt kan återförenas med sitt hem.",
                },
            },
        ]
        for i, s in enumerate(default_sections):
            await db.homepage_sections.insert_one({
                "id": str(uuid.uuid4()),
                "type": s["type"],
                "label": s["label"],
                "subtitle": s.get("subtitle"),
                "is_visible": s.get("is_visible", True),
                "config": s["config"],
                "sort_order": i,
                "created_at": now,
                "updated_at": now,
            })

    # Seed default navigation menu (top-nav with dropdowns) — only if empty
    if await db.menu_items.count_documents({}) == 0:
        def _seed_top(label: str, url: str, order: int) -> str:
            item_id = str(uuid.uuid4())
            return {
                "id": item_id, "label": label, "url": url, "parent_id": None,
                "is_visible": True, "sort_order": order, "created_at": now, "updated_at": now,
            }
        def _seed_child(parent_id: str, label: str, url: str, order: int):
            return {
                "id": str(uuid.uuid4()), "label": label, "url": url, "parent_id": parent_id,
                "is_visible": True, "sort_order": order, "created_at": now, "updated_at": now,
            }
        register = _seed_top("Registrera", "/registrera-fagel", 0)
        report = _seed_top("Rapportera", "#", 1)
        community = _seed_top("Community", "/galleri", 2)
        await db.menu_items.insert_many([
            register,
            _seed_child(register["id"], "Registrera fågel", "/registrera-fagel", 0),
            _seed_child(register["id"], "Om ringnummer", "/sidor/faq", 1),
            report,
            _seed_child(report["id"], "Rapportera hittad fågel", "/rapportera-hittad", 0),
            _seed_child(report["id"], "Rapportera bortflögen", "/rapportera-bortflygen", 1),
            _seed_child(report["id"], "Lista på hittade fåglar", "/hittade-faglar", 2),
            community,
            _seed_child(community["id"], "Galleri", "/galleri", 0),
            _seed_child(community["id"], "Om oss", "/sidor/om-oss", 1),
            _seed_child(community["id"], "Kontakt", "/sidor/kontakt", 2),
        ])


@app.on_event("shutdown")
async def shutdown():
    client.close()


# ----------------------------------------------------------------------------
# Bulk admin actions
# ----------------------------------------------------------------------------
async def _bulk_delete(collection, ids: List[str], id_field: str = "id") -> int:
    if not ids:
        return 0
    result = await collection.delete_many({id_field: {"$in": ids}})
    return result.deleted_count


@api.post("/admin/registered-birds/bulk-delete")
async def bulk_delete_registered_birds(payload: BulkIdsInput, admin: dict = Depends(require_admin)):
    n = await _bulk_delete(db.registered_birds, payload.ids)
    await log_activity(admin["user_id"], admin["email"], "admin.registered_bird.bulk_delete",
                       None, {"ids": payload.ids, "deleted": n})
    return {"deleted": n}


@api.post("/admin/found-birds/bulk")
async def bulk_found_birds(payload: BulkFoundAction, admin: dict = Depends(require_admin)):
    if payload.action == "delete":
        n = await _bulk_delete(db.found_birds, payload.ids)
        await log_activity(admin["user_id"], admin["email"], "admin.found_bird.bulk_delete",
                           None, {"ids": payload.ids, "deleted": n})
        return {"deleted": n}
    # returned
    result = await db.found_birds.update_many(
        {"id": {"$in": payload.ids}},
        {"$set": {"status": "returned", "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    await log_activity(admin["user_id"], admin["email"], "admin.found_bird.bulk_returned",
                       None, {"ids": payload.ids, "matched": result.matched_count})
    return {"updated": result.modified_count}


@api.post("/admin/users/bulk")
async def bulk_users(payload: BulkUserAction, admin: dict = Depends(require_admin)):
    # Never let admin bulk-affect their own account
    ids = [i for i in payload.ids if i != admin["user_id"]]
    if not ids:
        raise HTTPException(status_code=400, detail="Du kan inte påverka ditt eget konto")
    now = datetime.now(timezone.utc).isoformat()
    if payload.action == "delete":
        result = await db.users.delete_many({"user_id": {"$in": ids}})
        await db.registered_birds.update_many({"user_id": {"$in": ids}}, {"$set": {"user_id": None}})
        await log_activity(admin["user_id"], admin["email"], "admin.user.bulk_delete", None,
                           {"ids": ids, "deleted": result.deleted_count})
        return {"deleted": result.deleted_count}
    is_blocked = payload.action == "block"
    result = await db.users.update_many(
        {"user_id": {"$in": ids}},
        {"$set": {"is_blocked": is_blocked, "updated_at": now}},
    )
    await log_activity(admin["user_id"], admin["email"],
                       f"admin.user.bulk_{payload.action}", None,
                       {"ids": ids, "matched": result.matched_count})
    return {"updated": result.modified_count}


@api.post("/admin/discount-codes/bulk-delete")
async def bulk_delete_discount_codes(payload: BulkIdsInput, admin: dict = Depends(require_admin)):
    n = await _bulk_delete(db.discount_codes, payload.ids)
    await log_activity(admin["user_id"], admin["email"], "admin.discount.bulk_delete",
                       None, {"ids": payload.ids, "deleted": n})
    return {"deleted": n}


@api.post("/admin/comments/bulk-delete")
async def bulk_delete_comments(payload: BulkIdsInput, admin: dict = Depends(require_admin)):
    n = await _bulk_delete(db.bird_comments, payload.ids)
    await log_activity(admin["user_id"], admin["email"], "admin.comment.bulk_delete",
                       None, {"ids": payload.ids, "deleted": n})
    return {"deleted": n}


@api.post("/admin/feedback/bulk-delete")
async def bulk_delete_feedback(payload: BulkIdsInput, admin: dict = Depends(require_admin)):
    n = await _bulk_delete(db.feedback, payload.ids)
    await log_activity(admin["user_id"], admin["email"], "admin.feedback.bulk_delete",
                       None, {"ids": payload.ids, "deleted": n})
    return {"deleted": n}


@api.post("/admin/posts/bulk")
async def bulk_posts(payload: BulkPostAction, admin: dict = Depends(require_admin)):
    now = datetime.now(timezone.utc).isoformat()
    if payload.action == "delete":
        n = await _bulk_delete(db.posts, payload.ids)
        await log_activity(admin["user_id"], admin["email"], "admin.post.bulk_delete",
                           None, {"ids": payload.ids, "deleted": n})
        return {"deleted": n}
    if payload.action == "approve":
        update = {
            "status": "approved",
            "reject_reason": None,
            "moderated_by": admin["user_id"],
            "moderated_by_email": admin["email"],
            "moderated_at": now,
        }
    else:  # reject
        update = {
            "status": "rejected",
            "reject_reason": payload.reason,
            "moderated_by": admin["user_id"],
            "moderated_by_email": admin["email"],
            "moderated_at": now,
        }
    result = await db.posts.update_many({"id": {"$in": payload.ids}}, {"$set": update})
    await log_activity(admin["user_id"], admin["email"],
                       f"admin.post.bulk_{payload.action}", None,
                       {"ids": payload.ids, "matched": result.matched_count})
    return {"updated": result.modified_count}


@api.post("/admin/missing-birds/bulk")
async def bulk_missing(payload: BulkMissingAction, admin: dict = Depends(require_admin)):
    now = datetime.now(timezone.utc).isoformat()
    if payload.action == "delete":
        n = await _bulk_delete(db.missing_birds, payload.ids)
        await log_activity(admin["user_id"], admin["email"], "admin.missing.bulk_delete",
                           None, {"ids": payload.ids, "deleted": n})
        return {"deleted": n}
    status_map = {"found": "found", "closed": "closed"}
    result = await db.missing_birds.update_many(
        {"id": {"$in": payload.ids}},
        {"$set": {"status": status_map[payload.action], "updated_at": now}},
    )
    await log_activity(admin["user_id"], admin["email"],
                       f"admin.missing.bulk_{payload.action}", None,
                       {"ids": payload.ids, "matched": result.matched_count})
    return {"updated": result.modified_count}


@api.post("/admin/content/bulk-delete")
async def bulk_delete_content(payload: BulkIdsInput, admin: dict = Depends(require_admin)):
    n = await _bulk_delete(db.content_pages, payload.ids)
    await log_activity(admin["user_id"], admin["email"], "admin.content.bulk_delete",
                       None, {"ids": payload.ids, "deleted": n})
    return {"deleted": n}


@api.post("/admin/homepage/bulk")
async def bulk_homepage(payload: BulkHomepageAction, admin: dict = Depends(require_admin)):
    now = datetime.now(timezone.utc).isoformat()
    if payload.action == "delete":
        n = await _bulk_delete(db.homepage_sections, payload.ids)
        await log_activity(admin["user_id"], admin["email"], "admin.homepage.bulk_delete",
                           None, {"ids": payload.ids, "deleted": n})
        return {"deleted": n}
    is_visible = payload.action == "show"
    result = await db.homepage_sections.update_many(
        {"id": {"$in": payload.ids}},
        {"$set": {"is_visible": is_visible, "updated_at": now}},
    )
    await log_activity(admin["user_id"], admin["email"],
                       f"admin.homepage.bulk_{payload.action}", None,
                       {"ids": payload.ids, "matched": result.matched_count})
    return {"updated": result.modified_count}


@api.post("/admin/menu/bulk-delete")
async def bulk_delete_menu(payload: BulkIdsInput, admin: dict = Depends(require_admin)):
    # Also detach children so hierarchy doesn't dangle
    await db.menu_items.update_many(
        {"parent_id": {"$in": payload.ids}},
        {"$set": {"parent_id": None}},
    )
    n = await _bulk_delete(db.menu_items, payload.ids)
    await log_activity(admin["user_id"], admin["email"], "admin.menu.bulk_delete",
                       None, {"ids": payload.ids, "deleted": n})
    return {"deleted": n}


@api.post("/admin/payment-plans/bulk-cancel")
async def bulk_cancel_payment_plans(payload: BulkIdsInput, admin: dict = Depends(require_admin)):
    now = datetime.now(timezone.utc).isoformat()
    result = await db.payment_plans.update_many(
        {"id": {"$in": payload.ids}},
        {"$set": {"status": "cancelled", "updated_at": now}},
    )
    await log_activity(admin["user_id"], admin["email"], "admin.payment_plan.bulk_cancel",
                       None, {"ids": payload.ids, "matched": result.matched_count})
    return {"updated": result.modified_count}


# ----------------------------------------------------------------------------
# Stripe – Checkout, status polling, webhook
# ----------------------------------------------------------------------------
def _build_bird_checkout_session(
    *,
    bird_ids: List[str],
    user_id: Optional[str],
    user_email: Optional[str],
    origin_url: str,
    include_membership: bool,
    discount_code_id: Optional[str] = None,
    final_amount: Optional[float] = None,
) -> dict:
    """Create a Stripe Checkout session with N × bird registration + optional membership.

    Returns dict with checkout_url, session_id and amount_total (SEK, in öre).
    """
    reg_prices = stripe.Price.list(
        lookup_keys=[BIRD_REGISTRATION_LOOKUP_KEY], active=True, limit=1
    ).data
    if not reg_prices:
        raise HTTPException(status_code=500, detail="Registreringspris saknas i Stripe.")
    reg_price = reg_prices[0]

    line_items = [{"price": reg_price.id, "quantity": max(1, len(bird_ids))}]

    if include_membership:
        mem_prices = stripe.Price.list(
            lookup_keys=[MEMBERSHIP_LOOKUP_KEY], active=True, limit=1
        ).data
        if not mem_prices:
            raise HTTPException(status_code=500, detail="Medlemskapspris saknas i Stripe.")
        line_items.append({"price": mem_prices[0].id, "quantity": 1})
        mode = "subscription"
    else:
        mode = "payment"

    metadata = {
        "user_id": user_id or "",
        "bird_ids": ",".join(bird_ids),
        "include_membership": "1" if include_membership else "0",
        "discount_code_id": discount_code_id or "",
    }

    kwargs: dict = dict(
        line_items=line_items,
        mode=mode,
        success_url=f"{origin_url}/betalning/lyckad?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{origin_url}/betalning/avbruten",
        metadata=metadata,
        allow_promotion_codes=True,
        locale="sv",
    )
    if user_email:
        kwargs["customer_email"] = user_email

    # Sweden is SMP-eligible → managed payments (Stripe handles tax etc.)
    try:
        session = stripe.checkout.Session.create(**kwargs, managed_payments={"enabled": True})
    except stripe.error.InvalidRequestError as e:
        msg = (getattr(e, "user_message", None) or str(e)).lower()
        if "managed payments" in msg or "ineligible" in msg:
            session = stripe.checkout.Session.create(
                **kwargs,
                automatic_tax={"enabled": True},
                billing_address_collection="required",
            )
        else:
            raise

    amount_total = (reg_price.unit_amount or 0) * max(1, len(bird_ids))
    if include_membership:
        amount_total += mem_prices[0].unit_amount or 0
    return {
        "checkout_url": session.url,
        "session_id": session.id,
        "amount_total": amount_total,
    }


async def _activate_payment_for_session(session_id: str, stripe_session=None) -> None:
    """Idempotent: on paid session, activate birds + create/refresh payment_plan + membership."""
    txn = await db.payment_transactions.find_one({"session_id": session_id})
    if not txn or txn.get("payment_status") == "paid":
        return

    now_utc = datetime.now(timezone.utc)
    if stripe_session is None:
        stripe_session = stripe.checkout.Session.retrieve(session_id)

    payment_intent_id = getattr(stripe_session, "payment_intent", None)
    subscription_id = getattr(stripe_session, "subscription", None)

    updated = await db.payment_transactions.update_one(
        {"session_id": session_id, "payment_status": {"$ne": "paid"}},
        {"$set": {
            "status": "completed",
            "payment_status": "paid",
            "stripe_payment_intent_id": payment_intent_id,
            "stripe_subscription_id": subscription_id,
            "updated_at": now_utc.isoformat(),
        }},
    )
    if updated.modified_count == 0:
        return  # someone else already flipped it

    bird_ids: List[str] = txn.get("bird_ids") or []
    next_due = (now_utc.date() + timedelta(days=365)).isoformat()

    for bird_id in bird_ids:
        bird = await db.registered_birds.find_one({"id": bird_id})
        if not bird:
            continue
        await db.registered_birds.update_one(
            {"id": bird_id},
            {"$set": {
                "payment_status": "completed",
                "stripe_payment_intent_id": payment_intent_id,
                "annual_fee_paid_until": next_due,
            }},
        )
        # Create the annual payment plan now that money has landed
        existing_plan = await db.payment_plans.find_one({"bird_id": bird_id})
        if existing_plan:
            await db.payment_plans.update_one(
                {"bird_id": bird_id},
                {"$set": {
                    "status": "active",
                    "last_payment_date": now_utc.date().isoformat(),
                    "next_due_date": next_due,
                    "updated_at": now_utc.isoformat(),
                }},
            )
        else:
            await db.payment_plans.insert_one({
                "id": str(uuid.uuid4()),
                "user_id": txn.get("user_id"),
                "user_email": txn.get("user_email"),
                "bird_id": bird_id,
                "ring_number": bird.get("ring_number"),
                "plan_type": "annual",
                "registration_amount": 300.0,
                "annual_amount": 100.0,
                "currency": "SEK",
                "start_date": now_utc.date().isoformat(),
                "next_due_date": next_due,
                "status": "active",
                "last_payment_date": now_utc.date().isoformat(),
                "stripe_subscription_id": subscription_id,
                "created_at": now_utc.isoformat(),
                "updated_at": now_utc.isoformat(),
            })

    if txn.get("include_membership") and txn.get("user_id"):
        await db.users.update_one(
            {"user_id": txn["user_id"]},
            {"$set": {
                "membership_active": True,
                "membership_next_due": next_due,
                "stripe_subscription_id": subscription_id,
                "updated_at": now_utc.isoformat(),
            }},
        )


@api.get("/payments/status/{session_id}")
async def get_payment_status(session_id: str):
    record = await db.payment_transactions.find_one({"session_id": session_id})
    if not record:
        raise HTTPException(status_code=404, detail="Transaktionen hittades inte")
    if record.get("payment_status") != "paid":
        try:
            s = stripe.checkout.Session.retrieve(session_id)
            if s.payment_status == "paid" or s.status == "complete":
                await _activate_payment_for_session(session_id, stripe_session=s)
                record = await db.payment_transactions.find_one({"session_id": session_id})
        except stripe.error.StripeError:
            pass
    return {
        "session_id": record["session_id"],
        "status": record["status"],
        "payment_status": record["payment_status"],
    }


async def _handle_subscription_renewal(invoice: dict) -> dict:
    """When Stripe auto-charges the yearly membership, extend our own bookkeeping.

    invoice.billing_reason is 'subscription_cycle' for renewals and
    'subscription_create' for the very first charge (already handled by
    checkout.session.completed → _activate_payment_for_session). We skip the
    first-charge case here to stay idempotent.
    """
    subscription_id = invoice.get("subscription")
    if not subscription_id:
        return {"skipped": "no subscription"}
    billing_reason = invoice.get("billing_reason")
    if billing_reason == "subscription_create":
        return {"skipped": "initial charge (already activated)"}

    now_utc = datetime.now(timezone.utc)
    next_due = (now_utc.date() + timedelta(days=365)).isoformat()
    paid_iso = now_utc.date().isoformat()

    # Extend all payment plans tied to this subscription
    plan_result = await db.payment_plans.update_many(
        {"stripe_subscription_id": subscription_id},
        {"$set": {
            "status": "active",
            "last_payment_date": paid_iso,
            "next_due_date": next_due,
            "updated_at": now_utc.isoformat(),
        }},
    )

    # Also extend the linked bird's annual_fee_paid_until
    plans_cursor = db.payment_plans.find(
        {"stripe_subscription_id": subscription_id}, {"_id": 0, "bird_id": 1}
    )
    bird_ids = [p["bird_id"] async for p in plans_cursor if p.get("bird_id")]
    if bird_ids:
        await db.registered_birds.update_many(
            {"id": {"$in": bird_ids}},
            {"$set": {"annual_fee_paid_until": next_due, "payment_status": "completed"}},
        )

    # Refresh the user's membership window
    user_result = await db.users.update_many(
        {"stripe_subscription_id": subscription_id},
        {"$set": {
            "membership_active": True,
            "membership_next_due": next_due,
            "updated_at": now_utc.isoformat(),
        }},
    )

    # Record the renewal payment for audit
    await db.subscription_renewals.insert_one({
        "id": str(uuid.uuid4()),
        "stripe_invoice_id": invoice.get("id"),
        "stripe_subscription_id": subscription_id,
        "stripe_customer_id": invoice.get("customer"),
        "amount_paid": invoice.get("amount_paid"),
        "currency": invoice.get("currency"),
        "billing_reason": billing_reason,
        "next_due_date": next_due,
        "created_at": now_utc.isoformat(),
    })

    return {
        "plans_updated": plan_result.modified_count,
        "users_updated": user_result.modified_count,
        "birds_updated": len(bird_ids),
    }


async def _handle_subscription_cancelled(subscription: dict) -> dict:
    """When Stripe subscription is cancelled/ended, mark our plan+user accordingly."""
    subscription_id = subscription.get("id")
    if not subscription_id:
        return {"skipped": "no subscription id"}
    now = datetime.now(timezone.utc).isoformat()
    plan_result = await db.payment_plans.update_many(
        {"stripe_subscription_id": subscription_id},
        {"$set": {"status": "cancelled", "updated_at": now}},
    )
    user_result = await db.users.update_many(
        {"stripe_subscription_id": subscription_id},
        {"$set": {"membership_active": False, "updated_at": now}},
    )
    return {"plans": plan_result.modified_count, "users": user_result.modified_count}


@app.post("/api/stripe/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")
    except Exception as e:  # noqa: BLE001
        logger.warning("Stripe webhook parse failed: %s", e)
        raise HTTPException(status_code=400, detail="Invalid payload")

    obj, event_type = event["data"]["object"], event["type"]

    # Idempotency: skip if we've already seen this event
    if event.get("id"):
        already = await db.stripe_events.find_one({"event_id": event["id"]})
        if already:
            return {"status": "duplicate", "event_id": event["id"]}
        await db.stripe_events.insert_one({
            "event_id": event["id"],
            "type": event_type,
            "received_at": datetime.now(timezone.utc).isoformat(),
        })

    if event_type == "checkout.session.completed":
        await _activate_payment_for_session(obj["id"], stripe_session=obj)
    elif event_type == "checkout.session.async_payment_succeeded":
        await _activate_payment_for_session(obj["id"], stripe_session=obj)
    elif event_type == "checkout.session.async_payment_failed":
        await db.payment_transactions.update_one(
            {"session_id": obj["id"]},
            {"$set": {"status": "failed", "payment_status": "failed",
                      "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
    elif event_type == "checkout.session.expired":
        await db.payment_transactions.update_one(
            {"session_id": obj["id"]},
            {"$set": {"status": "expired", "payment_status": "expired",
                      "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
    elif event_type == "invoice.payment_succeeded":
        result = await _handle_subscription_renewal(obj)
        logger.info("Subscription renewal handled: %s", result)
    elif event_type == "invoice.payment_failed":
        subscription_id = obj.get("subscription")
        if subscription_id:
            await db.payment_plans.update_many(
                {"stripe_subscription_id": subscription_id},
                {"$set": {"status": "past_due",
                          "updated_at": datetime.now(timezone.utc).isoformat()}},
            )
    elif event_type == "customer.subscription.deleted":
        await _handle_subscription_cancelled(obj)
    return {"status": "ok"}


# Include router + CORS
app.include_router(api)

# CORS: allow the frontend origin from env, plus wildcard for localhost dev
cors_origins = os.environ.get("CORS_ORIGINS", "*")
allow_origins = ["*"] if cors_origins == "*" else [o.strip() for o in cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=cors_origins != "*",
    allow_methods=["*"],
    allow_headers=["*"],
)

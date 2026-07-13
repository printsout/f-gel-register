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
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, Query
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
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
    additional_info: Optional[str] = None
    image_urls: Optional[List[str]] = None
    discount_code: Optional[str] = None


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


class UserUpdate(BaseModel):
    role: Optional[Literal["user", "admin"]] = None
    is_blocked: Optional[bool] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None


# ----------------------------------------------------------------------------
# Auth endpoints
# ----------------------------------------------------------------------------
@api.post("/auth/register")
async def register(data: RegisterInput, response: Response):
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
async def login(data: LoginInput, response: Response):
    email = data.email.lower()
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
    if not SWEDISH_PHONE_RE.match(data.phone_number):
        raise HTTPException(status_code=400, detail="Ange ett giltigt svenskt telefonnummer")

    existing = await db.registered_birds.find_one({"ring_number": data.ring_number})
    if existing:
        raise HTTPException(status_code=400, detail="Ringnummer finns redan registrerat")

    # Try to attach current user if authenticated (optional)
    current_user_id: Optional[str] = None
    try:
        current_user = await get_current_user(request)
        current_user_id = current_user["user_id"]
    except HTTPException:
        pass

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
        "ring_number": data.ring_number,
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
    await db.registered_birds.insert_one(bird)
    bird.pop("_id", None)
    return bird


@api.get("/found-birds")
async def list_found_birds(search: Optional[str] = None):
    query = {}
    if search:
        s = re.escape(search)
        query = {"$or": [
            {"description": {"$regex": s, "$options": "i"}},
            {"location": {"$regex": s, "$options": "i"}},
            {"finder_name": {"$regex": s, "$options": "i"}},
            {"ring_number": {"$regex": s, "$options": "i"}},
        ]}
    cursor = db.found_birds.find(query, {"_id": 0}).sort("report_date", -1)
    return await cursor.to_list(500)


@api.post("/found-birds")
async def create_found_bird(data: FoundBirdInput):
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
    # Show all birds so owners see their post appear immediately
    cursor = db.registered_birds.find(
        {},
        {"_id": 0, "phone_number": 0, "user_id": 0},
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


@api.post("/discount-codes/validate")
async def validate_discount_endpoint(payload: dict):
    code = (payload.get("code") or "").strip().upper()
    if not code:
        return {"valid": False, "message": "Rabattkod krävs"}
    return await validate_discount_code(code)


# ----------------------------------------------------------------------------
# Community posts (moderated)
# ----------------------------------------------------------------------------
def _sanitize_post(doc: dict, include_private: bool = False) -> dict:
    out = {k: v for k, v in doc.items() if k != "_id"}
    if not include_private:
        out.pop("moderated_by", None)
        out.pop("moderated_by_email", None)
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
        conflict = await db.registered_birds.find_one({"ring_number": payload["ring_number"], "id": {"$ne": bird_id}})
        if conflict:
            raise HTTPException(status_code=400, detail="Ringnummer finns redan registrerat")
    result = await db.registered_birds.update_one({"id": bird_id}, {"$set": payload})
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
    return await db.bird_comments.find({"bird_id": bird_id}, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.post("/birds/{bird_id}/comments")
async def create_bird_comment(bird_id: str, data: CommentInput):
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
    await db.found_birds.create_index("id", unique=True)
    await db.discount_codes.create_index("code", unique=True)
    await db.discount_codes.create_index("id", unique=True)
    await db.user_sessions.create_index("session_token")
    await db.posts.create_index("id", unique=True)
    await db.posts.create_index("status")
    await db.posts.create_index("user_id")

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


@app.on_event("shutdown")
async def shutdown():
    client.close()


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

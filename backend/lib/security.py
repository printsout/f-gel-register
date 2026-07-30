"""Security helpers extracted from server.py — kept small and dependency-free
so they can be unit-tested in isolation and re-used across future route modules.
"""
from __future__ import annotations

import re as _re
import time as _t
from typing import Dict, List

import bcrypt
import pyotp
from fastapi import HTTPException, Request

# ----------------------------------------------------------------------------
# Password hashing (bcrypt, cost 12)
# ----------------------------------------------------------------------------
def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except ValueError:
        return False


# ----------------------------------------------------------------------------
# Password strength policy
# ----------------------------------------------------------------------------
def validate_password_strength(pw: str) -> None:
    """Raise HTTPException(400) if the password doesn't meet the policy."""
    problems: List[str] = []
    if len(pw) < 10:
        problems.append("minst 10 tecken")
    if not _re.search(r"[A-ZÅÄÖ]", pw):
        problems.append("en stor bokstav")
    if not _re.search(r"[a-zåäö]", pw):
        problems.append("en liten bokstav")
    if not _re.search(r"[0-9]", pw):
        problems.append("en siffra")
    if not _re.search(r"[^A-Za-zÅÄÖåäö0-9]", pw):
        problems.append("ett specialtecken")
    if problems:
        raise HTTPException(
            status_code=400,
            detail="Lösenordet måste innehålla " + ", ".join(problems) + ".",
        )


# ----------------------------------------------------------------------------
# TOTP (Time-based One-Time Password) helpers for 2FA
# ----------------------------------------------------------------------------
def generate_totp_secret() -> str:
    return pyotp.random_base32()


def totp_provisioning_uri(secret: str, email: str, issuer: str = "Fågelregister") -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name=issuer)


def verify_totp(secret: str, code: str) -> bool:
    try:
        return pyotp.TOTP(secret).verify(code.strip(), valid_window=1)
    except Exception:  # noqa: BLE001
        return False


# ----------------------------------------------------------------------------
# Client-IP extraction (honours ingress X-Forwarded-For)
# ----------------------------------------------------------------------------
def client_ip(request: Request) -> str:
    fwd = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    if fwd:
        return fwd
    return request.client.host if request.client else "unknown"


# ----------------------------------------------------------------------------
# In-memory rate limiter (best-effort; use Redis in production behind >1 worker)
# ----------------------------------------------------------------------------
_RATE_BUCKETS: Dict[str, List[float]] = {}


def rate_limit(key: str, *, limit: int, window_seconds: int) -> None:
    """Raise HTTPException 429 if `key` has hit `limit` calls within the window."""
    now = _t.monotonic()
    bucket = _RATE_BUCKETS.get(key, [])
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


def reset_rate_limits() -> None:
    """Clear all buckets — used only by tests."""
    _RATE_BUCKETS.clear()

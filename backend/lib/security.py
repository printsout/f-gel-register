"""Security helpers extracted from server.py — kept small and dependency-free
so they can be unit-tested in isolation and re-used across future route modules.
"""
from __future__ import annotations

import time as _t
from typing import Dict, List

import bcrypt
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

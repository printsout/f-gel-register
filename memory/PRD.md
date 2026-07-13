# Papegojregistret – PRD

## Original problem statement
Continue existing GitHub project `printsout/parrot-register`. Focus: audit the current admin side, fix bugs, and add missing admin features. Import repo, deliver audit → bugfixes → new admin features → UI polish. Tech: React (as-is), FastAPI backend if missing, MongoDB, Swedish UI.

## User personas
- **Admin** – runs the registry; needs dashboard, CRUD for birds/users, moderation, discount codes, exports.
- **Bird owner** – registers their parrot with ring number, pays fee.
- **Community volunteer / finder** – reports found parrots without needing a login.

## Architecture (built 2026-02-13)
- **Backend**: FastAPI + MongoDB (Motor async). All routes under `/api`.
  - Auth: JWT (HS256, 2h access + 7d refresh) with httpOnly secure cookies. Emergent Google Social Login coexists via `POST /api/auth/google/session` and `session_token` cookie.
  - Collections: `users, registered_birds, found_birds, feedback, bird_comments, discount_codes, activity_logs, user_sessions`.
- **Frontend**: CRA + React 19 + react-router-dom + shadcn/Radix + Recharts + Phosphor icons + IBM Plex Sans / Cabinet Grotesk.
  - Design: Nordic Pine sidebar (#0D2B1D) + Macaw Orange accent (#FF5C00), left-aligned, subtle depth.
- **Sourced from**: `github.com/printsout/parrot-register` (Express + PostgreSQL + Replit-Auth) → ported.

## Core requirements
1. Fix all critical bugs in original admin (hook-order violation, Replit-only auth, CSS `!important` override, blocked user login gate).
2. Admin dashboard with KPIs + charts.
3. CRUD for registered birds, moderation for found birds, users, discount codes, comments, feedback.
4. CSV export for birds/users/found-birds/feedback.
5. Activity/audit log.
6. Public flow: landing, register bird, report found, list found.
7. Role-based auth (admin vs user), JWT + Google.

## What's been implemented (2026-02-13, first delivery)
- ✅ Ported entire backend from Express/PG to FastAPI/MongoDB.
- ✅ JWT email/password auth with bcrypt, seeded admin + test user.
- ✅ Emergent Google Social Login endpoint.
- ✅ Admin dashboard: 8 KPIs, 30-day registration area chart, top-8 species bar chart.
- ✅ Registered Birds: table + search + status filter + edit dialog + delete + CSV export.
- ✅ Found Birds: table + search + delete + CSV export.
- ✅ Users: table + search + role/status filters + block/unblock + delete + role change + detail dialog (with birds list).
- ✅ Discount codes: full CRUD + active toggle + usage tracking.
- ✅ Feedback: card view + delete + CSV export + average rating.
- ✅ Comments: moderation list + delete.
- ✅ Activity log with Swedish action labels.
- ✅ Public: landing, register bird form (Swedish species select, phone validation, discount code field), report found form, found list.
- ✅ Blocked user gate at login + on every authenticated request.
- ✅ Full Swedish UI throughout.
- ✅ 43/43 backend tests passing; all admin frontend flows verified.

## Backlog (P0/P1/P2)
### P1
- **Stripe integration** for registration payments (only structure in DB; needs Stripe keys from user).
- Server-side pagination for `/admin/registered-birds` if dataset grows > 1000.
- **Image uploads** for registered birds (currently `image_urls[]` field exists but no upload UI/storage).
- Public bird gallery `/gallery` (endpoint exists, no UI yet).

### P2
- Super-admin / moderator roles beyond current admin+user split.
- Email notifications (Resend/SendGrid) on found-bird match by ring number.
- Password reset flow.
- Bird detail public page with comments + comment form.
- Increment `discount_codes.used_count` on successful payment.
- Refactor `server.py` into `routers/` (currently ~1100 lines).
- Migrate `@app.on_event` to lifespan context manager.

## Test credentials (see `/app/memory/test_credentials.md`)
- admin@papegojregistret.se / Admin123! (admin)
- test@papegojregistret.se / Test123! (user, with 5 sample birds)
- Seeded discount code: `PARROTS15` (15% off)

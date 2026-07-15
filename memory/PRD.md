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
- ✅ Registered Birds CRUD, Found Birds moderation, Users management, Discount codes, Feedback, Comments, Activity log, CSV exports.

## Iteration 2 (2026-02-13): Community gallery + My birds
- ✅ Public `/galleri` with post-cards + inline comments.
- ✅ `/mina-faglar` with per-bird image upload (base64 in MongoDB).

## Iteration 3 (2026-02-13): Moderated community posts
- ✅ Post model with pending/approved/rejected + admin queue.
- ✅ Public gallery only shows approved posts; owner sees own posts with status badges.
- ✅ Admin `/admin/posts` with Godkänn/Avvisa (+reject reason).

## Iteration 4 (2026-02-13): Private missing-bird reports
- ✅ `/rapportera-bortflygen` (public form, private submissions).
- ✅ Admin `/admin/missing-birds` with status tabs (Sökes/Hittade/Avslutade), "Meddela ägare" flow, CSV export.
- ✅ Privacy verified: never leaks to any public endpoint.

## Iteration 5 (2026-02-13): CMS content pages
- ✅ 7 seeded pages (Om oss, Kontakt, FAQ, Köpvillkor, Returer, Frakt & Leverans, Integritetspolicy).
- ✅ Admin `/admin/content` full CRUD with slug normalization + publish toggle.
- ✅ Public `/sidor/:slug` with Markdown renderer.

## Iteration 6 (2026-02-13): Homepage Builder + PublicFooter everywhere
- ✅ Admin `/admin/homepage` — drag-to-reorder sections (up/down arrows), eye-toggle visibility, duplicate, delete, add new (hero/emergency_cta/features/text_block/cta_banner types).
- ✅ Hero editor: eyebrow, title, highlighted-word (rendered in orange), body, 3 CTA buttons, image URL.
- ✅ Features editor: N cards with icon + title + text.
- ✅ Landing page now fully dynamic — reads sections from `/api/homepage`, respects order and visibility.
- ✅ Shared `PublicFooter` component now on all 8 public pages, with links to all 7 published content pages.

## Iteration 7 (2026-02-13): Dropdown navigation menu
- ✅ `menu_items` collection with parent/child (single-level) hierarchy.
- ✅ Admin `/admin/menu` — full CRUD tree editor with up/down reorder, eye/hide, edit, delete (cascade), "Lägg till rullgardin-val" under each top.
- ✅ Seeded 3 top-level items (Registrera, Rapportera, Community) + 8 dropdown children.
- ✅ New `PublicHeader` component with shadcn DropdownMenu — renders top-nav dynamically from `/api/menu` on Landing. Mobile bar uses the same dropdowns.
- ✅ 19/19 backend tests + admin/public flows all green.

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

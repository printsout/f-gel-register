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

## Iteration 8 (2026-02-13): Comprehensive species list
- ✅ `/app/frontend/src/lib/parrotSpecies.js` — 16 families, 150+ species with scientific names.
- ✅ Shared `SpeciesSelect` combobox (shadcn Popover + Command) with strict substring filter (diacritics-normalized), used on `/registrera-fagel` and `/rapportera-bortflygen`.
- ✅ 18/18 backend + full frontend end-to-end verified.

## Iteration 9 (2026-07-17): Footer polish + Landing CTA links
- ✅ Footer: logo far-left with large "Kontakta oss" button underneath.
- ✅ Feature-cards on landing are now linkable: "Säker registrering" → `/sidor/integritetspolicy`, "Rapportera fynd" → `/rapportera-bortflygen`, "Enkel avgift" → `/sidor/kopvillkor` (backing model gained a `link` field).

## Iteration 10 (2026-07-17): Stripe Checkout integration
- ✅ Provisioned Emergent claimable Stripe sandbox (Sweden, SMP-eligible → managed payments).
- ✅ Catalog: `bird_registration_fee` (300 SEK one-time) + `membership_yearly` (100 SEK/year subscription). Setup script: `/app/backend/setup_stripe.py` (idempotent).
- ✅ `POST /api/registered-birds` now creates the bird as `payment_status="pending"` and returns a Stripe `checkout_url`. Frontend redirects to Stripe Checkout.
- ✅ Combined line-items in one Checkout session: 300 SEK × N birds + 100 SEK/year membership (skipped when user already has active membership).
- ✅ New pages: `/betalning/lyckad` (polls `/api/payments/status/{session_id}`) and `/betalning/avbruten`.
- ✅ Webhook at `/api/stripe/webhook` (signed) + inline polling fallback. Both call `_activate_payment_for_session` idempotently to flip bird→completed, create/activate `payment_plan`, set `user.membership_active`.
- ✅ E2E verified with Stripe test card 4242… → bird `payment_status=completed`, plan active with `stripe_subscription_id`, user membership active.

## Iteration 11 (2026-07-17): Admin bulk actions (multi-select + confirm)
- ✅ Reusable `useBulkSelection` hook + `BulkActionsBar` (sticky) + `SelectAllCheckbox` component.
- ✅ Row-level and "Markera alla"-checkbox added to every admin list: RegisteredBirds, FoundBirds, Users, DiscountCodes, Comments, Feedback, Posts, MissingBirds, Content, Homepage, Menu, PaymentPlans.
- ✅ Backend bulk endpoints (all admin-only, log to `activity_logs`):
  - `POST /api/admin/registered-birds/bulk-delete`
  - `POST /api/admin/found-birds/bulk` (`delete` | `returned`)
  - `POST /api/admin/users/bulk` (`delete` | `block` | `unblock`, self-safe)
  - `POST /api/admin/discount-codes/bulk-delete`
  - `POST /api/admin/comments/bulk-delete`
  - `POST /api/admin/feedback/bulk-delete`
  - `POST /api/admin/posts/bulk` (`approve` | `reject` | `delete`, with optional reject reason)
  - `POST /api/admin/missing-birds/bulk` (`delete` | `found` | `closed`)
  - `POST /api/admin/content/bulk-delete`
  - `POST /api/admin/homepage/bulk` (`delete` | `show` | `hide`)
  - `POST /api/admin/menu/bulk-delete` (cascades: detaches children)
  - `POST /api/admin/payment-plans/bulk-cancel`
- ✅ All destructive/blocking bulk actions show confirmation dialog (Swedish copy).
- ✅ E2E verified: created 3 test users → header select-all → bulk delete 2 → toast "2 användare borttagna" + row count drops from 4 → 2.

## Backlog (P0/P1/P2)
### Recently completed (2026-07-21)
- ✅ Discount codes now support two types: **percent (%)** and **fixed kr**. Fixed-kr discounts apply to the full checkout total (registration + membership); percent discounts apply to the total too. Admin UI lets you choose the type; hero rabatt-bubbla and live price summary reflect the correct type.
- ✅ Registration form: e-post visas alltid (prefillad från kontot om inloggad), nytt obligatoriskt **Adress**-fält, ytterligare info-placeholder ändrad till "Skriv gärna fågelnamnet", förklarande text under Ringnummer utökad med "-siffra"-tips.
- ✅ **GDPR cookies-banner** (`CookieConsent.jsx`) med tre val: Acceptera alla / Endast nödvändiga / Anpassa (analys + marknadsföring togglar). Val sparas i localStorage. Länk "Cookie-inställningar" i footer öppnar dialogen igen.
- ✅ **Utökad analys på admin dashboard**: ny KPI "Konvertering (%)", nytt diagram "Intäkter per månad" (6 månader), ny lista "Rabattkoder – topp användning" med sparad summa i kr. Backend `/api/admin/stats` returnerar `conversion_rate`, `revenue_by_month`, `discount_usage`.

### P1
- Hook up `/admin/payment-plans` route in `App.js` + AdminLayout sidebar (page component exists at `/app/frontend/src/pages/admin/PaymentPlans.jsx`).
- Server-side pagination for `/admin/registered-birds` if dataset grows > 1000.
- **Image uploads** for registered birds (currently `image_urls[]` field exists but no upload UI/storage).
- Public bird gallery `/gallery` (endpoint exists, no UI yet).
- Resend-integration: verifierad produktionsdomän/From/Reply-To + fler e-postmallar.
- Stripe Customer Portal för uppsägning/hantering av prenumeration.

### P2
- Super-admin / moderator roles beyond current admin+user split.
- Email notifications (Resend/SendGrid) on found-bird match by ring number.
- Bird detail public page with comments + comment form.
- Increment `discount_codes.used_count` on successful payment.
- Apply own discount codes (fixed kr / percent) directly in Stripe Checkout via `discounts=[{coupon}]` (today Stripe uses `allow_promotion_codes` for its own promo codes).
- Refactor `server.py` into `routers/` (currently ~3100 lines).
- Migrate `@app.on_event` to lifespan context manager.

## Test credentials (see `/app/memory/test_credentials.md`)
- habib.nazary@hotmail.com / Jordgubbe234@u (admin)
- test@papegojregistret.se / Test123! (user, with 5 sample birds)
- Seeded discount code: `PARROTS15` (15% off, type=percent)

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
### Recently completed (2026-07-30)
- ✅ **Admin-editerbara priser**: Ny adminsida `/admin/priser` med två fält (Registreringsavgift, Årsmedlemsavgift). Backend har `GET /api/settings/prices` (public) och `PATCH /api/admin/settings/prices` (admin) som lagrar värden i `app_settings`-collection. Stripe Checkout bygger `price_data` inline med aktuella priser, så ändringar slår igenom direkt vid nästa registrering. `RegisterBird.jsx` hämtar priserna dynamiskt vid page-load.
- ✅ **Cross-site auth fix**: Login/register/refresh returnerar nu `access_token` + `refresh_token` i JSON body. Frontend `api.js` sparar dem i `localStorage` och skickar som `Authorization: Bearer` header vid varje anrop. Silent refresh vid 401. Kringgår tredjepartscookie-blockering i Safari/Chrome när frontend och backend ligger på olika Railway-subdomäner.
- ✅ **Railway deployment**: Procfile, `.nvmrc`, `.python-version`, `engines.node=20.x`, `http-server` för frontend. MongoDB Atlas M0 för databas.


- ✅ **Resend/Emergent-managed email**: enhetlig hjälpare `send_platform_email()`. Reply-To sätts på kontaktnotiser och registreringsbekräftelser. Ny transaktionell mall "Tack för din registrering" skickas efter Stripe-betalning. Tre transaktionsmallar totalt (reset, kontakt, registrering + ägarbyte-mallar).
- ✅ Discount codes: procent (%) och fast kr som typval. Admin UI + hero-bubbla + live-pris.
- ✅ Registration form: e-post + adress + placeholder "Skriv gärna fågelnamnet" + utökad ringnummer-text.
- ✅ **GDPR cookies-banner** globalt monterad med Anpassa-toggels. Länk i footer.
- ✅ **Utökad analys** på admin dashboard: Konvertering %, Intäkter per månad, Rabattkoder top-usage.

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
- habib.nazary@hotmail.com / Jordgubbe234@u (admin, 2FA disabled locally)
- test@papegojregistret.se / Test123! (user, with 5 sample birds)
- Seeded discount code: `PARROTS15` (15% off, type=percent)

## Iteration 14 (2026-02): Kritiska produktionsfixar
- 🔴 **Checkout crashade med 500**: `create_registered_bird` refererade `reg_fee`/`mem_fee` som aldrig deklarerats i det scope där bird-dict byggdes → `NameError`. Fixat genom att hämta `prices = await get_price_settings()` i början av funktionen och använda de admin-konfigurerade värdena i **både** discount-beräkning och DB-record. Discount-flödet använder nu också admin-priserna istället för hårdkodade 300/100.
- 🔴 **Stripe managed-payments (SMP) failade i Sverige**: SMP kräver `tax_code` på varje `line_items[].product_data`. Lagt till `tax_code: "txcd_10000000"` (Services - General) för både registrering och medlemskap. Fallback-catchen breddad så att den även fångar `"tax code"`/`"tax_code"`-fel och byter till klassisk checkout med `automatic_tax` om det behövs.
- 🔴 **Admin-rubriker blinkade**: Föregående kodgranskning lade `bulk` som `useCallback`-dep i `Users.jsx` och `RegisteredBirds.jsx`. Men `useBulkSelection` returnerar ett nytt wrapper-object varje render → oändlig re-render loop. Fixat genom att exkludera `bulk` från deps (samma pattern som resten av admin-listorna). Lint är ren.
- ✅ Verifierat lokalt: `POST /api/registered-birds` → 200 med giltig Stripe checkout-URL. Admin-sidor renderar utan blink.

## Iteration 13 (2026-02): Kodgranskningsfixar
- ✅ **XSS-skydd:** `RichTextEditor` i `StyleControls.jsx` sanerar nu allt HTML-innehåll via DOMPurify (ALLOWED_TAGS: b/i/u/em/strong/a/ul/ol/li/p/br/span/div; skript, iframes, on*-handlers blockeras). Både init-load, input och blur går genom sanitizer.
- ✅ **Shell-injection:** `tests/test_iter20_railway_cleanup.py` använder nu `subprocess.run(['mongosh', ...])` list-form istället för `shell=True`.
- ✅ **Tysta catch-block:** api.js, AuthContext.jsx, SiteTextsContext.jsx loggar nu med `console.debug` istället för silent `catch (_)`.
- ✅ **Hook-deps:** Users.jsx och RegisteredBirds.jsx wrappar `load` i `useCallback` med korrekta beroenden; Homepage.jsx flaggar sina medvetna `[]`-effekter tydligt.
- ✅ **Stabila keys:** Posts.jsx (bildindex → `${src}-${i}`), Dashboard.jsx (skelett → `kpi-skeleton-${i}`), Homepage.jsx (feature-items → `it._cid || feature-${idx}`).
- ✅ **useMemo:** Menu.jsx memo:ar `topLevelOptions` och `parentSelectOptions`; Homepage.jsx bryter ut `activeDiscountCodes` från JSX.
- ✅ **Dokumenterat medvetet val:** localStorage-tokenlagring har en tydlig kommentar i `api.js` som förklarar att det är en workaround för Railway cross-site-cookies, mitigerat via DOMPurify. Migrering till HttpOnly cookies kräver single-registrable-domain deploy.
- ⏳ **Stora refaktoreringar** (splittning av `server.py`-funktioner: `create_registered_bird`, `startup`, `_activate_payment_for_session`; splittning av 400-radiga admin-komponenter) — parkerat till egen iteration, för riskabelt att göra i samma pass som säkerhetsfixarna.
- ✅ **Tester:** 11/11 pytest passing i test_iter20_railway_cleanup, lint clean på alla ändrade filer, screenshot-verifierat att landning + kontakt renderar.

## Iteration 12 (2026-02): SiteTexts fullständig koppling
- ✅ `SiteTextsContext` – global provider som hämtar `/api/site-texts` en gång vid mount, exponerar `useSiteText(key, fallback)` och `useSiteTexts()`. Uppdaterar även `document.title` när admin ändrar `site.title`.
- ✅ Adminvyn `/admin/texter` uppgraderad med 10 grupper (Global header/footer, Startsida-fallback, Login/registrera konto, Kontakt, Registrera fågel, Rapportera hittad/saknad, Hittade fåglar, Ägarbyte, Mina sidor, Admin) + 43 fördefinierade nycklar med tydliga labels och fallback. Egna nycklar kan läggas till och listas separat.
- ✅ `PATCH /api/admin/site-texts/{key}` triggar `refresh()` i providern så publika sidor uppdateras direkt utan sidladdning.
- ✅ Publika sidor med `useSiteText`-koppling: `Landing` (fallback), `Contact` (eyebrow/rubrik/undertext/email/telefon/svarstid), `RegisterBird` (titel/undertext/villkor/knapp), `ReportMissing` (titel/undertext/privacy-notis), `ReportFound` (titel/undertext), `FoundBirdsList` (titel/undertext/tomt läge), `OwnershipTransfer` (titel/undertext), `MyBirds` (eyebrow/titel), `Login` (eyebrow/titel/undertext/knappar/hero), `PublicHeader` (Mina sidor/Admin/Logga in), `PublicFooter` (copyright/kontakta oss).
- ✅ Buggfix: `Landing.jsx` refererade `welcomeTitle` som aldrig deklarerades — ersatt med `landing.fallback.*` nycklar.
- ✅ Alla hook-anrop hoisted till toppen av komponenter (`react-hooks/rules-of-hooks`-fel eliminerade).
- ✅ Backend-tester: iteration_21.json 17/17 pytest passing (site-texts CRUD, 2FA setup→enable→disable via pyotp, regression på public-endpoints).
- ✅ Frontend E2E verifierat: admin patch → publika kontaktsida visar nytt värde efter reload.
- ✅ Säkerhetschecklista skapad: `/app/memory/secret_rotation_checklist.md` med steg för Atlas, JWT, Stripe, Resend, adminlösenord.


# HELPMEY Architecture & Build Baseline

**Baseline branch:** `main`  
**Baseline commit:** `0e0cd4c4bed819467be24c540fe148af08fdb5e2` (luxury storefront merge, 2026-11-08)  
**Application package:** `backend/package.json` — `helpmey-storefront@1.0.0`

## 1. Repository topology

- `backend/` is the canonical production application: Next.js 15 App Router, React 19, TypeScript 5, Tailwind CSS 4.
- The user confirms that the live HELPMEY hosting project is **Cloudflare Pages** (`helpme`). The Cloudflare dashboard configuration and deployment logs are account-protected and were not directly inspected in this repository review.
- `index.html` at repository root is a static entry point. A Cloudflare Pages deployment of this root static site does not, by itself, execute the Next.js server route handlers in `backend/app/api`.
- The Next.js application uses server capabilities (API route handlers, auth/session cookies, payment webhooks, supplier sync, SMTP and server-side database access). It cannot be treated as a plain static export without redesigning those features. Cloudflare documents static Next.js export on Pages separately from full-stack Next.js hosting on Workers.
- **Recommended migration path for this repository:** it currently uses Next.js 15, so Cloudflare’s current automatic Wrangler setup maps Next.js 15 and earlier to the OpenNext adapter. Cloudflare recommends vinext as the default path for newer Next.js applications, but vinext is beta and must pass its compatibility check before adoption. For this existing Next.js 15 codebase, first evaluate OpenNext compatibility in a separate Worker preview; do not change the existing Pages project or production routing until all route handlers, Supabase, payment, email and supplier dependencies are validated.
- Keep the existing Pages deployment intact while testing the full-stack Worker as a separate preview. Only after functional and security tests pass should a controlled custom-domain cutover be considered.
- Do not assume Vercel is in use. Cloudflare Pages is the hosting target stated by the project owner.

## 2. Runtime layers and trust boundaries

1. **Presentation:** App Router pages, React components and responsive storefront styles. The homepage mounts `components/luxury-storefront.tsx`; German is the default locale with bundled English and Arabic translations.
2. **Server API:** Route handlers under `app/api` validate requests with Zod, enforce authentication and rate limits, and keep privileged provider credentials server-side.
3. **Identity & data:** Supabase Auth via `@supabase/ssr`, PostgreSQL catalogue/orders/customer data, and row-level security. Browser clients must never receive the service-role key.
4. **Payments:** Stripe, PayPal and Klarna integration points use server-side order creation and signed webhook verification. Browser redirects alone never mark an order paid. Provider secrets and webhook signing keys belong in host secret storage.
5. **Operations:** Redis-backed rate limiting, Nodemailer SMTP, PDF invoice generation, supplier staging/CJ MCP integration and health endpoints.

## 3. Principal data flows

- Catalogue: browser `GET /api/catalog` → server Supabase query → active product/variant DTO → category matching and 20-card presentation.
- Authentication: browser → same-origin server auth handlers → Supabase Auth → HTTP-only session cookies.
- Checkout: authenticated browser → `POST /api/checkout` → schema validation + rate limit + server-side product/stock/price lookup → payment provider intent/order → signed provider webhook → idempotent payment event ledger → order finalization and invoice.
- Supplier ingestion: authorized server-side `POST /api/supplier/sync` (and configured CJ integration) → normalized product records → Supabase catalogue.
- Email/invoices: trusted server handler → SMTP transport and server-generated PDF. No SMTP or payment secret is exposed to client code.

## 4. Data and security controls

- Apply SQL migrations in sequence as documented in `backend/README.md`; current documented sequence includes migrations 001, 003 and 004.
- RLS scopes customer profiles and carts to `auth.uid()`; financial writes are restricted to trusted server-side handlers.
- Configure production Redis rate-limit secrets, 32-byte `DATA_ENCRYPTION_KEY`, Supabase service role, Stripe/PayPal/Klarna credentials, SMTP and supplier tokens in the hosting provider's encrypted environment.
- Keep HTTPS/TLS enabled, validate webhook signatures, deduplicate webhook events, and do not log credentials or payment data.
- Treat legal copy, tax setup, provider onboarding, live supplier credentials and mailbox authentication as deployment prerequisites, not source-build guarantees.

## 5. Build and deployment contract

From `backend/`:

```bash
npm install
npm run typecheck
npm run build
npm start
```

Node.js 20+ is required. The repository currently has no committed `backend/package-lock.json`; CI therefore uses `npm install`, not `npm ci`. Commit a reviewed lockfile before requiring fully reproducible dependency resolution.

GitHub Actions validates TypeScript and runs the Next.js production build on pushes and pull requests. This CI build is a code-quality gate; it is not a Cloudflare deployment. The inspected Cloudflare Pages project currently has Framework preset `None`, empty Build command, empty Build output directory and empty Root directory (repository root), with `main` as the production branch. Do not change these settings to `backend/` or set `next build` there: the full-stack Next.js server output is not a static Pages artifact. Keep Pages unchanged during migration. For the Next.js 15 backend, evaluate the OpenNext Cloudflare adapter on a separate Worker preview and deploy via Wrangler/Workers Builds after compatibility checks. Configure `APP_ORIGIN`, `NEXT_PUBLIC_SITE_URL`, Supabase values and all required production secrets in the appropriate Cloudflare environment bindings/secrets.

## 6. Build identification

`GET /api/build-info` reports the deployed app version, Git commit SHA and hosting environment without exposing secrets when the Next.js server route is running. The storefront footer displays the version, short commit and environment after the endpoint responds. The endpoint recognizes Cloudflare Pages build variables (`CF_PAGES_COMMIT_SHA`, `CF_PAGES_BRANCH`, `CF_PAGES_URL`) as well as generic/local fallbacks. A static Pages export cannot execute this Next.js route handler; in that case the footer intentionally omits build metadata until a compatible server/Pages Function endpoint is wired.

A build badge identifies the source revision only. It does not assert that database migrations, SMTP, payment providers, supplier sync or end-to-end checkout are operational.

## 7. Known scope boundaries

- The luxury storefront has exactly 20 presentation slots per department; slots without matching active catalogue records remain empty templates.
- Browser localization is currently DE/EN/AR. Other languages fall back to German; this is not universal automatic translation.
- Payment UI must remain disabled until provider credentials, webhook configuration and end-to-end verification are complete.
- Cloudflare Pages deployment status confirms only the artifact configured for that Pages project. Confirm the Pages build settings and verify the full-stack backend separately if it is moved to Workers.

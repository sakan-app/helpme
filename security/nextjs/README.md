# HELPMEY security hardening — historical reference kit

The active Next.js 15 application and security implementation are in `backend/`. The files in this folder are an earlier migration reference and are **not imported or executed by the active application**. Do not copy this older middleware or webhook route over the current implementation.

Use these active files instead:

- `backend/middleware.ts` — nonce CSP, same-origin checks, Supabase session refresh, HTTP security headers and secure cookie options.
- `backend/lib/security/rate-limit.ts` — Upstash Redis REST rate limiting and five-failed-login IP lockout.
- `backend/lib/security/encryption.ts` — AES-256-GCM encryption for payment metadata.
- `backend/lib/security/payment-risk.ts` — risk scoring for high-value orders, country/postal mismatches, CVC and AVS.
- `backend/app/api/checkout/route.ts` — authenticated, server-priced Stripe checkout.
- `backend/app/api/webhooks/{stripe,paypal,klarna}/route.ts` — provider signature verification and idempotent reconciliation.
- `backend/supabase/migrations/202611060003_security_hardening.sql` — customer data RLS and private webhook event storage.

Follow `backend/README.md` for environment variables, migrations, provider setup and the production launch checklist. The active application still requires real secrets, Supabase migration application, Redis provisioning, provider dashboard configuration, and live integration tests. A successful build is not a production security certification.

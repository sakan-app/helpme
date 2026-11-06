# HELPMEY Next.js security hardening kit

## Important deployment status

The current `saiedahm/helpme` repository is a static `index.html` site published via GitHub Pages. It does not currently contain a Next.js application, Node.js API runtime, authentication service, or PostgreSQL schema. Files in this directory are a migration kit only; GitHub Pages will not execute them. This does not by itself secure the live storefront's checkout or create backend protections.

## Included

- `middleware.ts`: baseline security headers and strict origin allow-list. Move to the Next.js project root (or `src/middleware.ts`) and set `APP_ORIGIN` to the exact deployed origin.
- `lib/security.ts`: distributed rate limiters backed by Upstash Redis, plus Zod validation helpers.
- `app/api/webhooks/stripe/route.ts`: raw-body Stripe signature verification and idempotent persistence of verified events in PostgreSQL.
- `.env.example`: variable names only; never place real secrets in GitHub.

## Install into the actual Next.js backend

Use Node.js 20+ and a currently supported Next.js release, then install:
```bash
npm install stripe pg zod @upstash/redis @upstash/ratelimit
npm install -D @types/pg
```

Copy the files into the corresponding paths in the Next.js application. Create the `stripe_webhook_events` table shown in the webhook route using a migration. Configure TLS for PostgreSQL, Redis credentials, `APP_ORIGIN`, Stripe live secret and webhook signing secret in the hosting provider's secret manager.

## Mandatory work before production

1. Connect an event worker that processes the persisted Stripe events in a database transaction and enforces order ownership, expected amount, currency, payment status, and idempotency. The receiver intentionally does not pretend an order has been fulfilled.
2. Wire `enforceLimit` into every API route; use `authRateLimit` on login, password reset, and account recovery. Also configure provider-level WAF/DDoS protection and body-size/time limits.
3. Implement authentication using a maintained provider/library; store passwords only with Argon2id (preferred) or bcrypt with an appropriate cost, and use Secure, HttpOnly, SameSite cookies plus CSRF protection. Never build a custom JWT/session system without review.
4. Use parameterized queries or ORM methods exclusively; validate every request with Zod; authorize every record access server-side.
5. Configure PostgreSQL least-privilege roles, encrypted backups, TLS with certificate verification, rotation, PITR, audit logs, and network restrictions. Encryption at rest is a database/hosting configuration, not a JavaScript flag.
6. Review CSP against actual image, analytics, font, Stripe, and PayPal origins. Avoid broad `https:` allowances in `img-src` long-term; do not add `unsafe-eval`.
7. Add automated dependency scanning, secret scanning, SAST, security tests, log redaction, alerting, and an incident response procedure.
8. Validate reverse-proxy IP handling before trusting `X-Forwarded-For`. Rate limits must use the real client IP set by a trusted edge.
9. Keep secrets out of client-side variables (never use `NEXT_PUBLIC_` for secrets). Rotate any secret that has ever been committed.

## Security limits

No code can guarantee “zero vulnerabilities” or make a system “impenetrable.” These files are a baseline and have not been tested against your production infrastructure or database schema. Do not claim production-secure until integrated, configured, reviewed, and tested.

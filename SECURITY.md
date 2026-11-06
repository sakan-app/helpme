# HELP-ME security deployment notes (Vercel + Supabase)

## Current repository scope
The inspected `main` branch is a static `index.html` storefront. No server-side API routes, Supabase client initialization, database schema, or authenticated resource controllers were found in the inspected root. Therefore CSRF enforcement, SQL/ORM remediation, and IDOR checks cannot safely be applied without the actual backend and table definitions.

## Vercel headers
`vercel.json` sets security response headers, including `X-Frame-Options: DENY`, CSP, `X-Content-Type-Options: nosniff`, HSTS, Referrer-Policy, Permissions-Policy, COOP and CORP. The CSP permits Supabase HTTPS/WebSocket connections and Stripe Checkout/JS. Validate all storefront flows and inspect deployed response headers before merging. Inline scripts/styles are currently permitted to preserve the single-file storefront; migrate them to external files or nonces/hashes before removing `'unsafe-inline'`.

## Supabase requirements before enabling customer data
1. Keep the Supabase `service_role` key exclusively in Vercel server-side environment variables. Never put it in `index.html`, client JavaScript, or any `NEXT_PUBLIC_*` variable.
2. Use only the Supabase publishable/anon key in a browser client; it is not a substitute for authorization.
3. Enable Row Level Security (RLS) on every table exposed through the Data API. Add policies per table based on `auth.uid()` and actual ownership columns. Do not deploy generic policies without verifying the schema.
4. For orders, profiles, addresses, invoices, and admin actions, enforce ownership and role checks server-side and in RLS. Do not trust a user ID supplied by the browser.
5. Use Supabase Auth verified sessions. For cookie-authenticated state changes, validate an anti-CSRF token bound to the session and validate the Origin; use `SameSite=Strict`, `Secure`, and `HttpOnly` for session cookies where compatible with the auth flow.
6. Use parameterized SQL (`$1`, `$2`, etc.) or Supabase query-builder methods; never concatenate user input into SQL. Use an ORM only if it fits the existing database architecture—do not introduce a second ORM blindly.
7. If Stripe webhooks are used, verify the Stripe signature against the raw request body before processing. Do not exempt webhook routes from signature verification.
8. For user-supplied rich HTML, sanitize at the rendering boundary with DOMPurify. Prefer text rendering (`textContent`/framework escaping) and never use unsafe HTML insertion for untrusted data.

## Required validation
- Run the project build/deployment preview and test checkout, product images, fonts, Supabase auth and data requests.
- Verify the deployed headers on HTML and API responses.
- Audit all API handlers and Supabase table policies before declaring XSS, SQLi, CSRF, or IDOR fully remediated.

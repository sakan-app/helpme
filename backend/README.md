# Helpmey authentication and mail backend

This is a separate Next.js backend scaffold. The current storefront at the repository root is a static GitHub Pages site; GitHub Pages cannot execute these API routes. Deploy this directory as a Node.js/Next.js service (Node 20+) before connecting the storefront.

## Authentication

The API uses Supabase Auth and cookie-based sessions through `@supabase/ssr`:
- `POST /api/auth/signup` — email/password registration; Supabase sends confirmation.
- `POST /api/auth/login` — password login; session cookies are written by Supabase SSR.
- `POST /api/auth/logout` — revoke session.
- `POST /api/auth/forgot-password` — send recovery link.
- `GET /api/auth/user` — resolve the authenticated user server-side.

Enable email confirmations in Supabase Auth settings. Set the site URL and allowed redirect URLs to the deployed backend origin and `/auth/callback`. Configure Supabase Auth's **Custom SMTP** in the Supabase Dashboard using the same domain SMTP mailbox; Supabase Auth confirmation and recovery templates are sent by Supabase Auth, not by Nodemailer.

## Official SMTP

Nodemailer transport is in `lib/mailer.ts`. It supports:
- `smtps.udag.de:465` with implicit TLS (`SMTP_SECURE=true`).
- `smtps.udag.de:587` with STARTTLS (`SMTP_SECURE=false`, `requireTLS=true`).

TLS 1.2 minimum and certificate verification are required. Set `SMTP_USER` and `SMTP_PASSWORD` in the hosting provider's encrypted secret manager. Do not put mailbox passwords in Git, client JavaScript, Supabase public variables, or issue comments. The provided server mailbox is the default sender; contact and info addresses are reply-to/notification identities and must be provisioned/authorized by the mail host before use.

`verifySmtpConnection()` performs an actual SMTP handshake and authentication check when called from a protected server-side deployment check. No SMTP verification can be claimed until valid credentials are configured and this function succeeds.

## Deploy

1. Create a Supabase project; apply its Auth email confirmation and password recovery settings.
2. Deploy this `backend/` directory as a Next.js app with Node 20+.
3. Configure every variable in `.env.example` in the host's secret manager. Never commit a real `.env`.
4. In Supabase Dashboard → Authentication → SMTP Settings, enable custom SMTP with host `smtps.udag.de`, port `465`, username and mailbox password, sender name/address. Use port 587 only if your provider requires STARTTLS.
5. Add the deployed callback URL to Supabase redirect allow-list.
6. Connect the static storefront's account modal to this backend origin using same-site deployment or a carefully configured HTTPS origin/CORS policy. Do not collect passwords in the static page before this connection is complete.
7. Before sending order confirmations, call `sendOrderConfirmation` only after a verified payment webhook and durable order creation. Never send an order-paid email based on a browser redirect.

## Current status

The routes and SMTP transport are committed as source code only. They are not running on GitHub Pages. Supabase project values, SMTP mailbox password, sender authorization, deployment origin, and end-to-end tests are still required.
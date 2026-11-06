# Helpmey Luxury Store

The repository contains two storefront generations:

- `backend/` — the Next.js 15 App Router application. Deploy this folder as the project root on a Node.js host (for example, set Vercel Root Directory to `backend`). Read [backend/README.md](backend/README.md) for environment, Supabase, SMTP, database migration and deployment instructions.
- `index.html` — the legacy static GitHub Pages storefront. It cannot run Next.js API routes, Supabase server sessions, supplier ingestion or SMTP server code.

## Required before production

1. Rotate the Supabase database password if it has ever been shared in chat, tickets, or source control.
2. Configure Supabase URL and anon key in the hosting provider's encrypted environment variables.
3. Apply `backend/supabase/migrations/` to the Supabase project.
4. Configure Supabase Auth Custom SMTP with `smtps.udag.de:465` and the real authorized mailbox password in the Supabase dashboard.
5. Set `SMTP_PASS`, `SUPPLIER_SYNC_TOKEN`, and other private values as host secrets. Never commit `.env.local`.
6. Upload the original palace artwork to `backend/public/helpmey-palace-hero.jpg`.
7. Configure the deployed domain and Supabase redirect allow-list, then run the live SMTP/auth tests.
8. Integrate a payment provider and verified server-side webhooks before accepting real orders.

The GitHub Actions workflow validates backend TypeScript and runs a Next.js production build. A successful source build does not by itself configure external accounts, mailboxes, payment gateways, or supplier API access.

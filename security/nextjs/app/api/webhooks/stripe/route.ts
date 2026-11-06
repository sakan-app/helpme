import Stripe from "stripe";
import { Pool } from "pg";

/**
 * Verified Stripe webhook receiver with durable idempotency.
 *
 * Before enabling: create the SQL table below, set DATABASE_URL and STRIPE_* secrets,
 * and implement a worker that processes persisted events transactionally. Do not fulfill
 * orders directly from client-side success redirects; only verified webhook events count.
 *
 * CREATE TABLE stripe_webhook_events (
 *   event_id text PRIMARY KEY,
 *   event_type text NOT NULL,
 *   payload jsonb NOT NULL,
 *   received_at timestamptz NOT NULL DEFAULT now(),
 *   processed_at timestamptz,
 *   processing_error text
 * );
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const secretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const databaseUrl = process.env.DATABASE_URL;

if (!secretKey || !webhookSecret || !databaseUrl) {
  // Fail closed: webhook is unavailable until all secrets are configured.
  console.error("Stripe webhook configuration is incomplete.");
}

const stripe = secretKey ? new Stripe(secretKey) : null;
const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: true } : undefined,
      max: 5,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
    })
  : null;

export async function POST(request: Request) {
  if (!stripe || !webhookSecret || !pool) {
    return Response.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "Missing Stripe signature" }, { status: 400 });

  // Stripe signature verification MUST use the exact raw request body.
  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    return Response.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  // Store the verified event once. The primary key makes Stripe retries idempotent.
  // Parameterized SQL prevents SQL injection. A separate worker must process the event
  // and mark processed_at within a transaction before changing order/account state.
  try {
    await pool.query(
      `INSERT INTO stripe_webhook_events (event_id, event_type, payload)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (event_id) DO NOTHING`,
      [event.id, event.type, JSON.stringify(event)],
    );
  } catch (error) {
    console.error("Unable to persist verified Stripe event", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "Temporary webhook persistence failure" }, { status: 500 });
  }

  return Response.json({ received: true }, { status: 200 });
}

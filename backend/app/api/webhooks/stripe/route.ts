import Stripe from "stripe";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { claimWebhookEvent } from "@/lib/security/webhook-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const apiKey = process.env.STRIPE_SECRET_KEY;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !apiKey || !signature) return NextResponse.json({ error: "Webhook is not configured." }, { status: 503 });
  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = new Stripe(apiKey).webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }
  const admin = createSupabaseAdminClient();
  try {
    const fresh = await claimWebhookEvent("stripe", event.id, event.type);
    if (!fresh) return NextResponse.json({ received: true, duplicate: true });
    if (event.type === "payment_intent.succeeded" || event.type === "payment_intent.payment_failed") {
      const intent = event.data.object as Stripe.PaymentIntent;
      const orderId = intent.metadata.order_id;
      if (!orderId) return NextResponse.json({ received: true });
      const { data: order, error } = await admin.from("orders").select("id,total,risk_score,status").eq("id", orderId).maybeSingle();
      if (error || !order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
      if (event.type === "payment_intent.payment_failed") {
        await admin.from("orders").update({ status: "cancelled" }).eq("id", orderId).eq("status", "pending");
      } else {
        const expected = Math.round(Number(order.total) * 100);
        const amountMatches = intent.amount_received === expected && intent.currency.toUpperCase() === "EUR";
        const nextStatus = amountMatches && Number(order.risk_score) < 40 ? "paid" : "pending_review";
        const flags = amountMatches ? undefined : ["payment_amount_or_currency_mismatch"];
        await admin.from("orders").update({
          status: nextStatus,
          ...(flags ? { risk_flags: flags, risk_score: 100 } : {})
        }).eq("id", orderId).in("status", ["pending", "pending_review"]);
      }
    }
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ error: "Webhook processing failed; provider may retry." }, { status: 500 });
  }
}
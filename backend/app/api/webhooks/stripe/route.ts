import Stripe from "stripe";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { claimWebhookEvent, releaseWebhookEvent } from "@/lib/security/webhook-events";
import { scorePaymentRisk } from "@/lib/security/payment-risk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const apiKey = process.env.STRIPE_SECRET_KEY;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !apiKey || !signature) return NextResponse.json({ error: "Webhook is not configured." }, { status: 503 });
  const rawBody = await request.text();
  const stripe = new Stripe(apiKey);
  let event: Stripe.Event;
  try { event = stripe.webhooks.constructEvent(rawBody, signature, secret); }
  catch { return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 400 }); }

  try {
    const fresh = await claimWebhookEvent("stripe", event.id, event.type);
    if (!fresh) return NextResponse.json({ received: true, duplicate: true });
    const admin = createSupabaseAdminClient();
    if (event.type === "payment_intent.succeeded" || event.type === "payment_intent.payment_failed") {
      const intent = event.data.object as Stripe.PaymentIntent;
      const orderId = intent.metadata.order_id;
      if (!orderId) return NextResponse.json({ received: true });
      const { data: order, error: readError } = await admin.from("orders")
        .select("id,total,currency,risk_score,risk_flags,billing_country,shipping_country,billing_postal_code,shipping_postal_code,status")
        .eq("id", orderId).maybeSingle();
      if (readError || !order) throw new Error("Verified payment references an unknown order.");

      if (event.type === "payment_intent.payment_failed") {
        const { error } = await admin.from("orders").update({ status: "cancelled" })
          .eq("id", orderId).in("status", ["pending", "pending_review"]);
        if (error) throw new Error("Could not mark failed payment.");
      } else {
        const expected = Math.round(Number(order.total) * 100);
        const amountMatches = intent.amount_received === expected &&
          intent.currency.toUpperCase() === String(order.currency).toUpperCase();
        let cvcCheck: "pass" | "fail" | "unavailable" | null = null;
        let avsPostalMatch: boolean | null = null;
        let providerRiskHigh = false;
        if (typeof intent.latest_charge === "string") {
          const charge = await stripe.charges.retrieve(intent.latest_charge);
          const checks = charge.payment_method_details?.card?.checks;
          cvcCheck = checks?.cvc_check === "pass" ? "pass" : checks?.cvc_check === "fail" ? "fail" : "unavailable";
          avsPostalMatch = checks?.address_postal_code_check === "fail" ? false : checks?.address_postal_code_check === "pass" ? true : null;
          providerRiskHigh = String(charge.outcome?.risk_level ?? "").toLowerCase().includes("high");
        }
        const scored = scorePaymentRisk({
          amountCents: expected,
          billingCountry: order.billing_country,
          shippingCountry: order.shipping_country,
          billingPostalCode: order.billing_postal_code,
          shippingPostalCode: order.shipping_postal_code,
          avsPostalMatch,
          cvcCheck
        });
        const flags = [...new Set([...(Array.isArray(order.risk_flags) ? order.risk_flags as string[] : []), ...scored.flags, ...(providerRiskHigh ? ["stripe_radar_high_risk"] : []), ...(!amountMatches ? ["payment_amount_or_currency_mismatch"] : [])])];
        const score = Math.max(Number(order.risk_score), scored.score, providerRiskHigh ? 80 : 0, amountMatches ? 0 : 100);
        const status = amountMatches && score < 40 ? "paid" : "pending_review";
        const { error } = await admin.from("orders").update({
          status, risk_score: score, risk_flags: flags
        }).eq("id", orderId).in("status", ["pending", "pending_review"]);
        if (error) throw new Error("Could not reconcile verified Stripe payment.");
      }
    }
    return NextResponse.json({ received: true });
  } catch {
    await releaseWebhookEvent("stripe", event.id).catch(() => undefined);
    return NextResponse.json({ error: "Webhook processing failed; provider may retry." }, { status: 500 });
  }
}

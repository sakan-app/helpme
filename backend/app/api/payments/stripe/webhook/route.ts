import Stripe from "stripe";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { claimWebhookEvent, releaseWebhookEvent } from "@/lib/security/webhook-events";
import { emailPaidOrderInvoice } from "@/lib/invoices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const key = process.env.STRIPE_SECRET_KEY;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !key || !signature) return NextResponse.json({ error: "Stripe webhook is not configured." }, { status: 503 });
  const raw = await request.text();
  const stripe = new Stripe(key);
  let event: Stripe.Event;
  try { event = stripe.webhooks.constructEvent(raw, signature, secret); }
  catch { return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 400 }); }
  let claimed = false;
  try {
    claimed = await claimWebhookEvent("stripe", event.id, event.type);
    if (!claimed) return NextResponse.json({ received: true, duplicate: true });
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status !== "paid" && event.type === "checkout.session.completed") return NextResponse.json({ received: true, awaitingPayment: true });
      const orderId = session.metadata?.order_id;
      if (!orderId) throw new Error("Stripe session missing local order reference.");
      const admin = createSupabaseAdminClient();
      const { data: order, error } = await admin.from("orders").select("id,total,currency,risk_score,status").eq("id", orderId).single();
      if (error || !order) throw new Error("Local order not found.");
      const expected = Math.round(Number(order.total) * 100);
      if (session.amount_total !== expected || String(session.currency).toUpperCase() !== String(order.currency).toUpperCase()) {
        await admin.from("orders").update({ status: "pending_review", risk_score: 100, risk_flags: ["stripe_amount_or_currency_mismatch"] }).eq("id", orderId);
        return NextResponse.json({ received: true, reviewRequired: true });
      }
      const details = session.customer_details;
      const shipping = session.shipping_details as unknown as { name?: string; address?: Record<string, unknown> } | null;
      const shippingAddress = shipping?.address ? { name: shipping.name, ...shipping.address } : null;
      const billingAddress = details?.address ? { name: details.name, ...details.address } : null;
      const { error: finalizeError } = await admin.rpc("finalize_paid_order", {
        p_order_id: orderId, p_provider: "stripe", p_payment_reference: session.id,
        p_customer_name: details?.name || shipping?.name || "Helpmey Kunde",
        p_customer_email: details?.email || session.customer_email || "",
        p_customer_phone: details?.phone || null,
        p_shipping_address: shippingAddress, p_billing_address: billingAddress
      });
      if (finalizeError) throw new Error("Order finalization failed.");
      await emailPaidOrderInvoice(orderId);
    }
    return NextResponse.json({ received: true });
  } catch {
    if (claimed) await releaseWebhookEvent("stripe", event.id).catch(() => undefined);
    return NextResponse.json({ error: "Stripe webhook processing failed; provider may retry." }, { status: 500 });
  }
}

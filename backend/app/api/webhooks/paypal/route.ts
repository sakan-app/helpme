import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { claimWebhookEvent, releaseWebhookEvent } from "@/lib/security/webhook-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!clientId || !clientSecret || !webhookId) return NextResponse.json({ error: "PayPal webhook is not configured." }, { status: 503 });
  const raw = await request.text();
  let event: Record<string, unknown>;
  try { event = JSON.parse(raw) as Record<string, unknown>; } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const headerNames = ["paypal-transmission-id","paypal-transmission-time","paypal-cert-url","paypal-auth-algo","paypal-transmission-sig"];
  const headers = Object.fromEntries(headerNames.map((name) => [name, request.headers.get(name)]));
  if (Object.values(headers).some((value) => !value)) return NextResponse.json({ error: "Missing PayPal signature headers." }, { status: 400 });

  const apiBase = process.env.PAYPAL_API_BASE ?? "https://api-m.paypal.com";
  const eventId = String(event.id ?? "");
  const eventType = String(event.event_type ?? "");
  let claimed = false;
  try {
    const tokenResponse = await fetch(apiBase + "/v1/oauth2/token", {
      method: "POST",
      headers: { Authorization: "Basic " + Buffer.from(clientId + ":" + clientSecret).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials", cache: "no-store"
    });
    if (!tokenResponse.ok) throw new Error("PayPal OAuth failed.");
    const tokenPayload = await tokenResponse.json() as { access_token?: string };
    if (!tokenPayload.access_token) throw new Error("PayPal token missing.");
    const verifyResponse = await fetch(apiBase + "/v1/notifications/verify-webhook-signature", {
      method: "POST",
      headers: { Authorization: "Bearer " + tokenPayload.access_token, "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_algo: headers["paypal-auth-algo"], cert_url: headers["paypal-cert-url"],
        transmission_id: headers["paypal-transmission-id"], transmission_sig: headers["paypal-transmission-sig"],
        transmission_time: headers["paypal-transmission-time"], webhook_id: webhookId, webhook_event: event
      }), cache: "no-store"
    });
    const verification = await verifyResponse.json() as { verification_status?: string };
    if (!verifyResponse.ok || verification.verification_status !== "SUCCESS") return NextResponse.json({ error: "Invalid PayPal webhook signature." }, { status: 400 });

    claimed = await claimWebhookEvent("paypal", eventId, eventType);
    if (!claimed) return NextResponse.json({ received: true, duplicate: true });
    if (eventType === "PAYMENT.CAPTURE.COMPLETED") {
      const resource = event.resource as Record<string, unknown> | undefined;
      const related = resource?.supplementary_data as Record<string, unknown> | undefined;
      const relatedIds = related?.related_ids as Record<string, unknown> | undefined;
      const orderId = String(resource?.custom_id ?? relatedIds?.order_id ?? "");
      if (orderId) {
        const amount = resource?.amount as Record<string, unknown> | undefined;
        const admin = createSupabaseAdminClient();
        const { data: order, error: readError } = await admin.from("orders").select("id,total,currency,risk_score").eq("id", orderId).maybeSingle();
        if (readError) throw new Error("Could not read PayPal order.");
        if (order) {
          const matches = Math.round(Number(amount?.value) * 100) === Math.round(Number(order.total) * 100) &&
            String(amount?.currency_code ?? "").toUpperCase() === String(order.currency).toUpperCase();
          const { error } = await admin.from("orders").update({
            status: matches && Number(order.risk_score) < 40 ? "paid" : "pending_review",
            ...(!matches ? { risk_score: 100, risk_flags: ["paypal_amount_or_currency_mismatch"] } : {})
          }).eq("id", orderId).in("status", ["pending", "pending_review"]);
          if (error) throw new Error("Could not reconcile PayPal payment.");
        }
      }
    }
    return NextResponse.json({ received: true });
  } catch {
    if (claimed) await releaseWebhookEvent("paypal", eventId).catch(() => undefined);
    return NextResponse.json({ error: "PayPal webhook verification or processing failed; provider may retry." }, { status: 503 });
  }
}

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { claimWebhookEvent, releaseWebhookEvent } from "@/lib/security/webhook-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function constantTimeHexEqual(left: string, right: string): boolean {
  const a = Buffer.from(left.toLowerCase(), "utf8");
  const b = Buffer.from(right.toLowerCase(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const keyId = request.headers.get("klarna-signing-key-id");
  const signature = request.headers.get("klarna-signature");
  const keyJson = process.env.KLARNA_WEBHOOK_SIGNING_KEYS;
  if (!keyId || !signature || !keyJson) return NextResponse.json({ error: "Klarna webhook signing keys are not configured." }, { status: 503 });

  let signingKeys: Record<string, string>;
  try { signingKeys = JSON.parse(keyJson) as Record<string, string>; } catch {
    return NextResponse.json({ error: "Klarna signing-key configuration is invalid." }, { status: 503 });
  }
  const secret = signingKeys[keyId];
  if (!secret) return NextResponse.json({ error: "Unknown Klarna signing key." }, { status: 401 });

  const raw = await request.text();
  const expected = createHmac("sha256", secret).update(raw, "utf8").digest("hex");
  if (!constantTimeHexEqual(expected, signature)) return NextResponse.json({ error: "Invalid Klarna HMAC signature." }, { status: 400 });

  let event: Record<string, unknown>;
  try { event = JSON.parse(raw) as Record<string, unknown>; } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const metadata = event.metadata && typeof event.metadata === "object" ? event.metadata as Record<string, unknown> : {};
  const eventId = String(metadata.event_id ?? event.event_id ?? createHash("sha256").update(raw).digest("hex"));
  const eventType = String(event.event_type ?? event.type ?? "");
  const data = event.data && typeof event.data === "object" ? event.data as Record<string, unknown> : {};
  const orderId = String(event.order_id ?? data.order_id ?? event.merchant_reference ?? "");
  try {
    const fresh = await claimWebhookEvent("klarna", eventId, eventType);
    if (!fresh) return NextResponse.json({ received: true, duplicate: true });
    if (eventType.toLowerCase().includes("completed") && orderId) {
      const admin = createSupabaseAdminClient();
      const { data: order, error: readError } = await admin.from("orders").select("id,total,currency,risk_score").eq("id", orderId).maybeSingle();
      if (readError) throw new Error("Could not read Klarna order.");
      if (order) {
        const amount = Number(data.order_amount ?? event.order_amount);
        const currency = String(data.currency ?? event.currency ?? order.currency).toUpperCase();
        const matches = Number.isFinite(amount) && amount === Math.round(Number(order.total) * 100) && currency === String(order.currency).toUpperCase();
        const { error } = await admin.from("orders").update({
          status: matches && Number(order.risk_score) < 40 ? "paid" : "pending_review",
          ...(!matches ? { risk_score: 100, risk_flags: ["klarna_amount_or_currency_mismatch"] } : {})
        }).eq("id", orderId).in("status", ["pending", "pending_review"]);
        if (error) throw new Error("Could not update Klarna order.");
      }
    }
    return NextResponse.json({ received: true });
  } catch {
    await releaseWebhookEvent("klarna", eventId).catch(() => undefined);
    return NextResponse.json({ error: "Klarna webhook processing failed; provider may retry." }, { status: 503 });
  }
}

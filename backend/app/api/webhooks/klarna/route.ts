import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { claimWebhookEvent } from "@/lib/security/webhook-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const expectedUser = process.env.KLARNA_WEBHOOK_USERNAME;
  const expectedPass = process.env.KLARNA_WEBHOOK_PASSWORD;
  const authorization = request.headers.get("authorization");
  if (!expectedUser || !expectedPass || !authorization?.startsWith("Basic ")) {
    return NextResponse.json({ error: "Klarna webhook is not configured." }, { status: 503 });
  }
  let supplied = "";
  try { supplied = Buffer.from(authorization.slice(6), "base64").toString("utf8"); } catch { }
  if (!safeEqual(supplied, expectedUser + ":" + expectedPass)) return NextResponse.json({ error: "Invalid Klarna webhook credentials." }, { status: 401 });

  const raw = await request.text();
  let event: Record<string, unknown>;
  try { event = JSON.parse(raw) as Record<string, unknown>; } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const eventType = String(event.event_type ?? event.type ?? "");
  const orderId = String(event.order_id ?? "");
  const eventId = String(event.event_id ?? createHash("sha256").update(raw).digest("hex"));
  try {
    const fresh = await claimWebhookEvent("klarna", eventId, eventType);
    if (!fresh) return NextResponse.json({ received: true, duplicate: true });
    if (eventType === "order.completed" && orderId) {
      const admin = createSupabaseAdminClient();
      const { data: order } = await admin.from("orders").select("id,total,currency,risk_score").eq("id", orderId).maybeSingle();
      if (order) {
        const amount = Number(event.order_amount);
        const expectedMinor = Math.round(Number(order.total) * 100);
        const amountMatches = Number.isFinite(amount) && amount === expectedMinor &&
          String(event.currency ?? order.currency).toUpperCase() === String(order.currency).toUpperCase();
        await admin.from("orders").update({
          status: amountMatches && Number(order.risk_score) < 40 ? "paid" : "pending_review",
          ...(!amountMatches ? { risk_score: 100, risk_flags: ["klarna_amount_or_currency_mismatch"] } : {})
        }).eq("id", orderId).in("status", ["pending", "pending_review"]);
      }
    }
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ error: "Klarna webhook processing failed; provider may retry." }, { status: 503 });
  }
}
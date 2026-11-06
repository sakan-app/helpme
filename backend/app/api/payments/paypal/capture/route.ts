import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";
import { emailPaidOrderInvoice } from "@/lib/invoices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.object({ orderId: z.string().uuid(), paypalOrderId: z.string().min(8).max(64) }).strict();

async function paypalToken() {
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error("PayPal is not configured.");
  const base = process.env.PAYPAL_API_BASE || "https://api-m.paypal.com";
  const response = await fetch(base + "/v1/oauth2/token", { method: "POST", headers: { Authorization: "Basic " + Buffer.from(id + ":" + secret).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials", cache: "no-store" });
  const data = await response.json() as { access_token?: string };
  if (!response.ok || !data.access_token) throw new Error("PayPal authentication failed.");
  return { token: data.access_token, base };
}

export async function POST(request: Request) {
  let limit;
  try { limit = await enforceRateLimit(request, "checkout", 5, 60); } catch { return NextResponse.json({ error: "Checkout-Schutz nicht verfügbar." }, { status: 503 }); }
  if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige PayPal-Bestellnummer." }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const admin = createSupabaseAdminClient();
  const { data: order, error } = await admin.from("orders").select("id,user_id,total,currency,status,provider_reference,risk_score").eq("id", parsed.data.orderId).eq("user_id", auth.user.id).single();
  if (error || !order || order.provider_reference !== parsed.data.paypalOrderId || !["pending","pending_review"].includes(order.status)) return NextResponse.json({ error: "Bestellung nicht gefunden oder nicht zahlbar." }, { status: 404 });
  try {
    const { token, base } = await paypalToken();
    const response = await fetch(base + "/v2/checkout/orders/" + encodeURIComponent(parsed.data.paypalOrderId) + "/capture", {
      method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", "PayPal-Request-Id": "capture-" + order.id }, body: "{}", cache: "no-store"
    });
    const data = await response.json() as { id?: string; status?: string; purchase_units?: Array<{ payments?: { captures?: Array<{ amount?: { value?: string; currency_code?: string }; id?: string }> } }> };
    if (!response.ok || data.status !== "COMPLETED") return NextResponse.json({ error: "PayPal-Zahlung wurde nicht abgeschlossen." }, { status: 409 });
    const capture = data.purchase_units?.[0]?.payments?.captures?.[0];
    if (!capture?.id || Math.round(Number(capture.amount?.value) * 100) !== Math.round(Number(order.total) * 100) || capture.amount?.currency_code !== order.currency) {
      await admin.from("orders").update({ status: "pending_review", risk_score: 100, risk_flags: ["paypal_amount_or_currency_mismatch"] }).eq("id", order.id);
      return NextResponse.json({ error: "Zahlung wird manuell geprüft." }, { status: 202 });
    }
    const { error: finalizeError } = await admin.rpc("finalize_paid_order", {
      p_order_id: order.id, p_provider: "paypal", p_payment_reference: capture.id,
      p_customer_name: auth.user.user_metadata?.full_name || auth.user.email || "Helpmey Kunde",
      p_customer_email: auth.user.email || "", p_customer_phone: null,
      p_shipping_address: null, p_billing_address: null
    });
    if (finalizeError) throw new Error("Order finalization failed.");
    await emailPaidOrderInvoice(order.id);
    return NextResponse.json({ ok: true, status: "COMPLETED", orderId: order.id });
  } catch {
    return NextResponse.json({ error: "PayPal-Capture konnte nicht verarbeitet werden." }, { status: 502 });
  }
}

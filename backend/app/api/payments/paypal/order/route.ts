import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";
import { scorePaymentRisk } from "@/lib/security/payment-risk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.object({
  items: z.array(z.object({ productId: z.string().min(1).max(120), quantity: z.number().int().min(1).max(25), size: z.string().max(40).optional(), color: z.string().max(60).optional() }).strict()).min(1).max(30),
  shipping: z.object({ name: z.string().trim().min(2).max(120), street: z.string().trim().min(3).max(200), city: z.string().trim().min(2).max(120), postalCode: z.string().trim().min(2).max(20), country: z.string().length(2) }).strict()
}).strict();

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
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Bestelldaten." }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Bitte melden Sie sich vor dem Checkout an." }, { status: 401 });
  const admin = createSupabaseAdminClient();
  const quantities = new Map<string, number>();
  parsed.data.items.forEach((item) => quantities.set(item.productId, (quantities.get(item.productId) || 0) + item.quantity));
  const ids = [...quantities.keys()];
  const { data: products, error } = await admin.from("products").select("id,title,price,currency,inventory,variants,active").in("id", ids).eq("active", true);
  if (error || !products || products.length !== ids.length) return NextResponse.json({ error: "Produkt nicht verfügbar." }, { status: 409 });
  const lines = [];
  for (const item of parsed.data.items) {
    const product = products.find((row) => row.id === item.productId);
    const variants = product?.variants && typeof product.variants === "object" ? product.variants as Record<string, unknown> : {};
    if (!product || Number(product.inventory) < (quantities.get(item.productId) || item.quantity) ||
      (item.size && Array.isArray(variants.sizes) && variants.sizes.length > 0 && !variants.sizes.includes(item.size)) ||
      (item.color && Array.isArray(variants.colors) && variants.colors.length > 0 && !variants.colors.includes(item.color))) {
      return NextResponse.json({ error: "Produktvariante oder Lagerbestand ist nicht verfügbar." }, { status: 409 });
    }
    lines.push({ product_id: product.id, product_title: product.title, quantity: item.quantity, unit_price: Number(product.price), selected_size: item.size || null, selected_color: item.color || null });
  }
  const subtotal = lines.reduce((sum, line) => sum + Math.round(line.unit_price * 100) * line.quantity, 0);
  const shippingCents = subtotal >= 7500 ? 0 : 499;
  const totalCents = subtotal + shippingCents;
  const currency = String(products[0].currency || "EUR").toUpperCase();
  if (products.some((p) => String(p.currency).toUpperCase() !== currency)) return NextResponse.json({ error: "Gemischte Währungen sind nicht erlaubt." }, { status: 400 });
  const risk = scorePaymentRisk({ amountCents: totalCents, shippingCountry: parsed.data.shipping.country, ipCountry: request.headers.get("x-vercel-ip-country") ?? request.headers.get("cf-ipcountry") });
  const { data: order, error: orderError } = await admin.from("orders").insert({
    user_id: auth.user.id, status: risk.reviewRequired ? "pending_review" : "pending", currency, subtotal: subtotal / 100,
    shipping_total: shippingCents / 100, total: totalCents / 100, payment_provider: "paypal", shipping_address: { name: parsed.data.shipping.name, line1: parsed.data.shipping.street, city: parsed.data.shipping.city, postal_code: parsed.data.shipping.postalCode, country: parsed.data.shipping.country },
    risk_score: risk.score, risk_flags: risk.flags, shipping_country: parsed.data.shipping.country
  }).select("id").single();
  if (orderError || !order) return NextResponse.json({ error: "Bestellung konnte nicht angelegt werden." }, { status: 502 });
  const { error: itemError } = await admin.from("order_items").insert(lines.map((line) => ({ ...line, order_id: order.id })));
  if (itemError) { await admin.from("orders").update({ status: "cancelled" }).eq("id", order.id); return NextResponse.json({ error: "Bestellpositionen konnten nicht gespeichert werden." }, { status: 502 }); }
  try {
    const { token, base } = await paypalToken();
    const origin = process.env.APP_ORIGIN || new URL(request.url).origin;
    const response = await fetch(base + "/v2/checkout/orders", {
      method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", "PayPal-Request-Id": order.id },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{ reference_id: order.id, custom_id: order.id, invoice_id: "HM-" + order.id, amount: { currency_code: currency, value: (totalCents / 100).toFixed(2) }, description: "Helpmey Bestellung" }],
        payment_source: { paypal: { experience_context: { return_url: origin + "/checkout/success?provider=paypal", cancel_url: origin + "/checkout/cancel", user_action: "PAY_NOW" } } }
      }), cache: "no-store"
    });
    const data = await response.json() as { id?: string; links?: Array<{ rel: string; href: string }>; message?: string };
    if (!response.ok || !data.id) throw new Error(data.message || "PayPal order creation failed.");
    await admin.from("orders").update({ provider_reference: data.id }).eq("id", order.id);
    const approve = data.links?.find((link) => link.rel === "approve")?.href;
    if (!approve) throw new Error("PayPal approval link missing.");
    return NextResponse.json({ orderId: order.id, paypalOrderId: data.id, url: approve }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    await admin.from("orders").update({ status: "cancelled" }).eq("id", order.id);
    return NextResponse.json({ error: "PayPal-Checkout konnte nicht gestartet werden." }, { status: 502 });
  }
}

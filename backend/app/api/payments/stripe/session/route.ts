import Stripe from "stripe";
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
  billingCountry: z.string().length(2).optional(),
  shippingCountry: z.string().length(2).optional(),
  billingPostalCode: z.string().max(20).optional(),
  shippingPostalCode: z.string().max(20).optional()
}).strict();

export async function POST(request: Request) {
  let limit;
  try { limit = await enforceRateLimit(request, "checkout", 5, 60); }
  catch { return NextResponse.json({ error: "Checkout-Schutz ist vorübergehend nicht verfügbar." }, { status: 503 }); }
  if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Warenkorbdaten." }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Bitte melden Sie sich vor dem Checkout an." }, { status: 401 });
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return NextResponse.json({ error: "Stripe ist nicht konfiguriert." }, { status: 503 });
  const admin = createSupabaseAdminClient();
  const quantities = new Map<string, number>();
  parsed.data.items.forEach((item) => quantities.set(item.productId, (quantities.get(item.productId) || 0) + item.quantity));
  const ids = [...quantities.keys()];
  const { data: products, error } = await admin.from("products").select("id,title,price,currency,inventory,variants,active").in("id", ids).eq("active", true);
  if (error || !products || products.length !== ids.length) return NextResponse.json({ error: "Ein Produkt ist nicht verfügbar." }, { status: 409 });
  const lines = [];
  try {
    for (const item of parsed.data.items) {
      const product = products.find((row) => row.id === item.productId);
      if (!product || Number(product.inventory) < (quantities.get(item.productId) || item.quantity)) throw new Error("stock");
      const variants = product.variants && typeof product.variants === "object" ? product.variants as Record<string, unknown> : {};
      const sizes = Array.isArray(variants.sizes) ? variants.sizes : [];
      const colors = Array.isArray(variants.colors) ? variants.colors : [];
      if ((item.size && sizes.length && !sizes.includes(item.size)) || (item.color && colors.length && !colors.includes(item.color))) throw new Error("variant");
      lines.push({ product_id: product.id, product_title: product.title, quantity: item.quantity, unit_price: Number(product.price), selected_size: item.size || null, selected_color: item.color || null });
    }
  } catch {
    return NextResponse.json({ error: "Produktvariante oder Lagerbestand ist nicht verfügbar." }, { status: 409 });
  }
  const subtotal = lines.reduce((sum, item) => sum + Math.round(item.unit_price * 100) * item.quantity, 0);
  const shipping = subtotal >= 7500 ? 0 : 499;
  const total = subtotal + shipping;
  const currency = String(products[0].currency || "EUR").toLowerCase();
  if (products.some((p) => String(p.currency).toLowerCase() !== currency) || total < 1 || total > 100000000) return NextResponse.json({ error: "Ungültige Währung oder Bestellsumme." }, { status: 400 });
  const risk = scorePaymentRisk({ amountCents: total, billingCountry: parsed.data.billingCountry, shippingCountry: parsed.data.shippingCountry, ipCountry: request.headers.get("x-vercel-ip-country") ?? request.headers.get("cf-ipcountry"), billingPostalCode: parsed.data.billingPostalCode, shippingPostalCode: parsed.data.shippingPostalCode });
  const { data: order, error: orderError } = await admin.from("orders").insert({
    user_id: auth.user.id, status: risk.reviewRequired ? "pending_review" : "pending", currency: currency.toUpperCase(),
    subtotal: subtotal / 100, shipping_total: shipping / 100, total: total / 100, payment_provider: "stripe",
    risk_score: risk.score, risk_flags: risk.flags, billing_country: parsed.data.billingCountry || null,
    shipping_country: parsed.data.shippingCountry || null, billing_postal_code: parsed.data.billingPostalCode || null,
    shipping_postal_code: parsed.data.shippingPostalCode || null
  }).select("id").single();
  if (orderError || !order) return NextResponse.json({ error: "Bestellung konnte nicht angelegt werden." }, { status: 502 });
  const { error: itemsError } = await admin.from("order_items").insert(lines.map((line) => ({ ...line, order_id: order.id })));
  if (itemsError) { await admin.from("orders").update({ status: "cancelled" }).eq("id", order.id); return NextResponse.json({ error: "Bestellpositionen konnten nicht gespeichert werden." }, { status: 502 }); }
  try {
    const stripe = new Stripe(stripeKey);
    const session = await stripe.checkout.sessions.create({
      mode: "payment", customer_email: auth.user.email,
      line_items: lines.map((line) => ({ quantity: line.quantity, price_data: { currency, unit_amount: Math.round(line.unit_price * 100), product_data: { name: line.product_title } } })),
      shipping_address_collection: { allowed_countries: ["DE","AT","BE","BG","HR","CY","CZ","DK","EE","ES","FI","FR","GR","HU","IE","IT","LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","SE"] },
      metadata: { order_id: order.id, user_id: auth.user.id, shop: "helpmey" },
      success_url: (process.env.APP_ORIGIN || new URL(request.url).origin) + "/checkout/success?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: (process.env.APP_ORIGIN || new URL(request.url).origin) + "/checkout/cancel"
    });
    const { error: updateError } = await admin.from("orders").update({ provider_reference: session.id }).eq("id", order.id);
    if (updateError || !session.url) throw new Error("Stripe session could not be persisted.");
    return NextResponse.json({ orderId: order.id, sessionId: session.id, url: session.url }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    await admin.from("orders").update({ status: "cancelled" }).eq("id", order.id);
    return NextResponse.json({ error: "Stripe Checkout konnte nicht gestartet werden." }, { status: 502 });
  }
}

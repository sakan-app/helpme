import Stripe from "stripe";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";
import { encryptSensitiveJson } from "@/lib/security/encryption";
import { scorePaymentRisk } from "@/lib/security/payment-risk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.object({
  items: z.array(z.object({
    productId: z.string().min(1).max(120),
    quantity: z.number().int().min(1).max(25),
    size: z.string().max(40).optional(),
    color: z.string().max(60).optional()
  }).strict()).min(1).max(30),
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
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return NextResponse.json({ error: "Bitte melden Sie sich vor dem Checkout an." }, { status: 401 });

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return NextResponse.json({ error: "Zahlung ist noch nicht konfiguriert." }, { status: 503 });
  const stripe = new Stripe(stripeKey);
  const admin = createSupabaseAdminClient();
  const quantities = new Map<string, number>();
  for (const item of parsed.data.items) quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
  const ids = [...quantities.keys()];
  const { data: products, error: productError } = await admin.from("products")
    .select("id,title,price,currency,inventory,variants,active").in("id", ids).eq("active", true);
  if (productError || !products || products.length !== ids.length) {
    return NextResponse.json({ error: "Mindestens ein Produkt ist nicht mehr verfügbar." }, { status: 409 });
  }

  let lines: Array<{ product_id: string; product_title: string; quantity: number; unit_price: number; selected_size: string | null; selected_color: string | null }> = [];
  try {
  lines = parsed.data.items.map((item) => {
    const product = products.find((candidate) => candidate.id === item.productId);
    if (!product) throw new Error("Product lookup mismatch.");
    const variants = product.variants && typeof product.variants === "object" ? product.variants as Record<string, unknown> : {};
    const sizes = Array.isArray(variants.sizes) ? variants.sizes : [];
    const colors = Array.isArray(variants.colors) ? variants.colors : [];
    if (item.size && sizes.length && !sizes.includes(item.size)) throw new Error("Invalid product size.");
    if (item.color && colors.length && !colors.includes(item.color)) throw new Error("Invalid product color.");
    const quantity = item.quantity;
    if (Number(product.inventory) < (quantities.get(product.id) ?? quantity)) throw new Error("Insufficient stock.");
    return { product_id: product.id, product_title: product.title, quantity, unit_price: Number(product.price), selected_size: item.size ?? null, selected_color: item.color ?? null };
  });
  if (ids.length !== parsed.data.items.length) {
    return NextResponse.json({ error: "Ungültige Warenkorbposition." }, { status: 400 });
  }
  const subtotalCents = lines.reduce((sum, line) => sum + Math.round(line.unit_price * 100) * line.quantity, 0);
  const shippingCents = subtotalCents >= 7500 ? 0 : 499;
  const totalCents = subtotalCents + shippingCents;
  if (totalCents < 1 || totalCents > 100000000) return NextResponse.json({ error: "Ungültiger Bestellbetrag." }, { status: 400 });

  const risk = scorePaymentRisk({
    amountCents: totalCents,
    billingCountry: parsed.data.billingCountry,
    shippingCountry: parsed.data.shippingCountry,
    billingPostalCode: parsed.data.billingPostalCode,
    shippingPostalCode: parsed.data.shippingPostalCode
  });
  const currency = String(products[0]?.currency ?? "EUR").toLowerCase();
  if (products.some((product) => String(product.currency).toLowerCase() !== currency)) {
    return NextResponse.json({ error: "Gemischte Währungen können nicht gemeinsam bezahlt werden." }, { status: 400 });
  }

  const { data: order, error: orderError } = await admin.from("orders").insert({
    user_id: auth.user.id, status: risk.reviewRequired ? "pending_review" : "pending",
    currency: currency.toUpperCase(), subtotal: subtotalCents / 100,
    shipping_total: shippingCents / 100, total: totalCents / 100,
    payment_provider: "stripe", risk_score: risk.score, risk_flags: risk.flags,
    billing_country: parsed.data.billingCountry ?? null, shipping_country: parsed.data.shippingCountry ?? null,
    billing_postal_code: parsed.data.billingPostalCode ?? null, shipping_postal_code: parsed.data.shippingPostalCode ?? null
  }).select("id").single();
  if (orderError || !order) return NextResponse.json({ error: "Bestellung konnte nicht angelegt werden." }, { status: 502 });

  const { error: itemsError } = await admin.from("order_items").insert(lines.map((line) => ({ ...line, order_id: order.id })));
  if (itemsError) {
    await admin.from("orders").update({ status: "cancelled" }).eq("id", order.id);
    return NextResponse.json({ error: "Bestellpositionen konnten nicht gespeichert werden." }, { status: 502 });
  }

  try {
    const intent = await stripe.paymentIntents.create({
      amount: totalCents, currency, automatic_payment_methods: { enabled: true },
      metadata: { order_id: order.id, user_id: auth.user.id, risk_score: String(risk.score) }
    });
    const encrypted = encryptSensitiveJson({ paymentIntentId: intent.id, riskFlags: risk.flags, createdAt: new Date().toISOString() });
    const { error: updateError } = await admin.from("orders")
      .update({ provider_reference: intent.id, payment_metadata_ciphertext: encrypted }).eq("id", order.id);
    if (updateError) throw new Error("Could not persist encrypted payment metadata.");
    return NextResponse.json({
      orderId: order.id, clientSecret: intent.client_secret, amount: totalCents,
      currency: currency.toUpperCase(), reviewRequired: risk.reviewRequired
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    await admin.from("orders").update({ status: "cancelled" }).eq("id", order.id);
    return NextResponse.json({ error: "Zahlung konnte nicht initialisiert werden." }, { status: 502 });
  }
}
import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendTransactionalMail } from "@/lib/mailer";

// Sends paid orders to CJ Dropshipping (ported from NEXORA/SakanVIP worker/cj.js): creates the CJ order with
// the customer's address, phone and the exact CJ variants, using CJ's cheapest shipping within CJ_MAX_DAYS,
// and pays it from the CJ wallet when CJ_AUTO_PAY is "on". Before paying it checks CJ's real cost against
// the sale and the wallet balance. Anything that needs the owner is saved in orders.supplier_error and
// emailed once; /api/cj/retry (Cloudflare cron, every 30 minutes) tries again.

const CJ = "https://developers.cjdropshipping.com/api2.0/v1/";
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const regionName = new Intl.DisplayNames(["en"], { type: "region" });

type Address = { name?: string; line1?: string; line2?: string; city?: string; state?: string; postal_code?: string; country?: string };
export type CjOrder = {
  id: string; status: string; total: number | string; invoice_number: string | null; payment_provider: string | null;
  payment_reference: string | null; customer_name: string | null; customer_email: string | null; customer_phone: string | null;
  shipping_address: Address | null; supplier_order_id: string | null; supplier_shipment_id: string | null;
  supplier_error: string | null; supplier_paid_at: string | null;
};
const ORDER_FIELDS = "id,status,total,invoice_number,payment_provider,payment_reference,customer_name,customer_email,customer_phone,shipping_address,supplier_order_id,supplier_shipment_id,supplier_error,supplier_paid_at";

// CJ access tokens last 180 days and getAccessToken returns the same token within 24 hours,
// so one per Worker instance is enough.
let token: string | null = null;
async function cjToken(): Promise<string> {
  if (token) return token;
  if (!process.env.CJ_API_KEY) throw new Error("CJ_API_KEY is not configured");
  const response = await fetch(CJ + "authentication/getAccessToken", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey: process.env.CJ_API_KEY })
  });
  const body = await response.json().catch(() => ({})) as { data?: { accessToken?: string }; message?: string };
  if (!response.ok || !body?.data?.accessToken) throw new Error(`CJ token: ${body?.message || response.status}`);
  token = body.data.accessToken;
  return token;
}

// CJ allows about one request per second.
async function cj<T = Record<string, unknown>>(path: string, init: RequestInit = {}): Promise<T> {
  await sleep(1100);
  const response = await fetch(CJ + path, {
    ...init, headers: { "CJ-Access-Token": await cjToken(), "Content-Type": "application/json", ...init.headers }
  });
  const body = await response.json().catch(() => ({})) as { result?: boolean; data?: T; message?: string };
  if (!response.ok || body.result === false) throw new Error(`CJ ${path.split("?")[0]}: ${body.message || response.status}`);
  return body.data as T;
}

const setOrder = async (id: string, fields: Record<string, unknown>) => {
  const { error } = await createSupabaseAdminClient().from("orders").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(`Order update failed: ${error.message}`);
};
const usd = (n: number) => `${Number(n).toFixed(2)} USD`;
const ownerMail = () => process.env.NEXT_PUBLIC_INFO_EMAIL || "info@digital-future.ai";

async function alertOwner(subject: string, lines: string[]) {
  try { await sendTransactionalMail({ to: ownerMail(), subject: `[Helpmey CJ] ${subject}`, text: lines.join("\n") }); }
  catch (err) { console.error("CJ alert mail failed:", err instanceof Error ? err.message : err); }
}

// Saves why the order is stuck and tells the owner, but only when the reason is new: the cron retries
// every 30 minutes and must not send the same email each time.
async function holdOrder(order: CjOrder, reason: string): Promise<CjOrder> {
  console.error("CJ order held:", order.invoice_number, reason);
  await setOrder(order.id, { supplier_error: reason.slice(0, 500) }).catch(() => undefined);
  if (order.supplier_error !== reason) {
    await alertOwner(`${order.invoice_number}: Aktion nötig`, [
      `Die Bestellung ${order.invoice_number} (${Number(order.total).toFixed(2)} EUR, ${order.customer_name || "Kunde"}) wartet bei CJ.`,
      "", `Grund: ${reason}`, "",
      order.supplier_order_id ? `CJ-Bestellnummer: ${order.supplier_order_id} (CJ → My Orders)` : "Die Bestellung ist noch nicht bei CJ angelegt.",
      "Der Shop versucht es alle 30 Minuten erneut, sobald das Problem behoben ist."
    ]);
  }
  return { ...order, supplier_error: reason };
}

// Cheapest by CJ's real total (totalPostageFee includes customs and clearance, logisticPrice does not),
// among methods that deliver within CJ_MAX_DAYS (default 20).
async function cheapestShipping(country: string, products: { vid: string; quantity: number }[]): Promise<string> {
  const maxDays = Number(process.env.CJ_MAX_DAYS || 20);
  const quotes = await cj<Record<string, unknown>[]>("logistic/freightCalculate", {
    method: "POST", body: JSON.stringify({ startCountryCode: "CN", endCountryCode: country, products: products.map(p => ({ vid: p.vid, quantity: p.quantity })) })
  });
  const total = (q: Record<string, unknown>) => Number(q.totalPostageFee) || Number(q.logisticPrice);
  const days = (q: Record<string, unknown>) => Math.max(...String(q.logisticAging || "").split("-").map(Number).filter(n => n > 0), 0) || 99;
  const best = (quotes || []).filter(q => total(q) > 0 && days(q) <= maxDays).sort((a, b) => total(a) - total(b))[0];
  if (!best) throw new Error(`CJ has no shipping route from CN to ${country} within ${maxDays} days`);
  return String(best.logisticName);
}

// Test payments (Stripe test mode, PayPal sandbox) only ever create CJ sandbox orders and are never paid.
const isSandbox = (order: CjOrder) => process.env.CJ_SANDBOX === "on" || /^cs_test_/.test(order.payment_reference || "") ||
  (order.payment_provider === "paypal" && /sandbox/.test(process.env.PAYPAL_API_BASE || "sandbox"));

// Returns the order as saved afterwards. Never throws: problems are stored in supplier_error.
export async function sendToCj(order: CjOrder): Promise<CjOrder> {
  if (!order || order.status !== "paid" || order.supplier_order_id) return order;
  try {
    const { data: items, error } = await createSupabaseAdminClient().from("order_items")
      .select("product_title,quantity,cj_vid").eq("order_id", order.id).order("id");
    if (error || !items?.length) throw new Error("Order has no items");
    const products = items.map((item, i) => {
      if (!item.cj_vid) throw new Error(`No CJ variant for ${item.product_title}`);
      return { vid: String(item.cj_vid), quantity: Number(item.quantity), storeLineItemId: `${order.invoice_number}-${i + 1}` };
    });
    const a = order.shipping_address || {};
    const country = String(a.country || "").toUpperCase();
    if (!country) throw new Error("Order has no shipping country");
    const logisticName = await cheapestShipping(country, products);
    const sandbox = isSandbox(order);
    const created = await cj<{ orderId: string; shipmentOrderId?: string }>("shopping/order/createOrderV2", {
      method: "POST",
      body: JSON.stringify({
        orderNumber: sandbox ? `${order.invoice_number}-TEST-${Date.now()}` : order.invoice_number,
        shippingCountryCode: country,
        shippingCountry: regionName.of(country) || country,
        shippingProvince: a.state || a.city || "",
        shippingCity: a.city || "",
        shippingZip: a.postal_code || "",
        shippingCustomerName: String(a.name || order.customer_name || "").slice(0, 50),
        shippingAddress: String(a.line1 || "").slice(0, 500),
        shippingAddress2: String(a.line2 || "").slice(0, 500),
        shippingPhone: String(order.customer_phone || "").slice(0, 20),
        email: String(order.customer_email || "").slice(0, 50),
        remark: `Helpmey ${order.invoice_number}`,
        logisticName,
        fromCountryCode: "CN",
        payType: 3, // create only; payment below
        iossType: Number(process.env.CJ_IOSS_TYPE || 3), // 3 = CJ collects EU import VAT, so the customer pays nothing at the door
        isSandbox: sandbox ? 1 : 0,
        products
      })
    });
    order = { ...order, status: "sent_to_supplier", supplier_order_id: created.orderId, supplier_shipment_id: created.shipmentOrderId || null, supplier_error: null };
    await setOrder(order.id, {
      status: "sent_to_supplier", supplier_order_id: created.orderId, supplier_shipment_id: created.shipmentOrderId || null,
      supplier_logistic: logisticName, supplier_error: null
    });
    if (process.env.CJ_AUTO_PAY === "on" && !sandbox) order = await payCj(order);
  } catch (err) {
    order = await holdOrder(order, err instanceof Error ? err.message : String(err));
  }
  return order;
}

// Pays a created CJ order from the CJ wallet, after two checks:
// - CJ's real cost (product, shipping, import VAT) is at most CJ_MAX_COST_SHARE (default 60 %) of what the
//   customer paid, so a supplier price jump never gets paid blindly;
// - the wallet holds enough. Afterwards the owner gets an email when the wallet drops below CJ_LOW_BALANCE_USD.
export async function payCj(order: CjOrder): Promise<CjOrder> {
  if (!order.supplier_order_id || order.supplier_paid_at || isSandbox(order)) return order;
  try {
    const detail = await cj<{ orderAmount?: number | string }>(`shopping/order/getOrderDetail?orderId=${encodeURIComponent(order.supplier_order_id)}`);
    const costUsd = Number(detail?.orderAmount);
    if (!(costUsd > 0)) throw new Error("CJ meldet keinen Bestellbetrag");
    await setOrder(order.id, { supplier_cost_usd: costUsd });
    // A low USD rate on purpose, so the check errs on the safe side.
    const costEur = costUsd / Number(process.env.USD_PER_EUR_MIN || 1.05);
    const maxShare = Number(process.env.CJ_MAX_COST_SHARE || 0.6);
    if (costEur > Number(order.total) * maxShare) {
      return holdOrder(order, `CJ-Kosten ${usd(costUsd)} (ca. ${costEur.toFixed(2)} EUR) sind mehr als ${Math.round(maxShare * 100)} % des Verkaufspreises ${Number(order.total).toFixed(2)} EUR. Bitte Preis in CJ prüfen und die Bestellung dort selbst bezahlen oder stornieren.`);
    }
    const balance = Number((await cj<{ amount?: number | string }>("shopping/pay/getBalance"))?.amount);
    if (!(balance >= costUsd)) {
      return holdOrder(order, `CJ-Guthaben ${usd(balance || 0)} reicht nicht für ${usd(costUsd)}. Bitte das CJ-Wallet aufladen (CJ → My Wallet → Recharge).`);
    }
    order = await payShipment(order);
    const low = Number(process.env.CJ_LOW_BALANCE_USD || 100);
    if (balance - costUsd < low) {
      await alertOwner("CJ-Guthaben niedrig", [
        `Nach der Zahlung für ${order.invoice_number} sind noch etwa ${usd(balance - costUsd)} im CJ-Wallet (Grenze ${usd(low)}).`,
        "Bitte bald aufladen (CJ → My Wallet → Recharge), sonst warten neue Bestellungen."
      ]);
    }
    return order;
  } catch (err) {
    return holdOrder(order, err instanceof Error ? err.message : String(err));
  }
}

// An order created with payType 3 is paid in CJ's three steps: add it to the CJ cart, confirm the cart
// (which returns the shipment id) and pay that shipment from the wallet.
async function payShipment(order: CjOrder): Promise<CjOrder> {
  let shipment = order.supplier_shipment_id;
  if (!shipment) {
    const ids = JSON.stringify({ cjOrderIdList: [order.supplier_order_id] });
    await cj("shopping/order/addCart", { method: "POST", body: ids });
    shipment = (await cj<{ shipmentsId?: string }>("shopping/order/addCartConfirm", { method: "POST", body: ids }))?.shipmentsId || null;
    if (!shipment) throw new Error("CJ did not confirm the order for payment");
    await setOrder(order.id, { supplier_shipment_id: shipment });
  }
  await cj("shopping/pay/payBalanceV2", { method: "POST", body: JSON.stringify({ shipmentOrderId: shipment }) });
  const paidAt = new Date().toISOString();
  await setOrder(order.id, { supplier_paid_at: paidAt, supplier_error: null });
  return { ...order, supplier_shipment_id: shipment, supplier_paid_at: paidAt, supplier_error: null };
}

export async function sendPaidOrderToCj(orderId: string): Promise<CjOrder | null> {
  const { data } = await createSupabaseAdminClient().from("orders").select(ORDER_FIELDS).eq("id", orderId).maybeSingle();
  return data ? sendToCj(data as CjOrder) : null;
}

// Cron: orders paid in the last 30 days that are not at CJ yet, or created there but unpaid (auto-pay on).
export async function retryCjOrders(): Promise<{ sent: number; paid: number }> {
  const admin = createSupabaseAdminClient();
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const { data: waiting } = await admin.from("orders").select(ORDER_FIELDS)
    .eq("status", "paid").is("supplier_order_id", null).gte("created_at", since).order("created_at").limit(10);
  for (const order of (waiting || []) as CjOrder[]) await sendToCj(order);
  let paid = 0;
  if (process.env.CJ_AUTO_PAY === "on") {
    const { data: unpaid } = await admin.from("orders").select(ORDER_FIELDS)
      .eq("status", "sent_to_supplier").is("supplier_paid_at", null).not("supplier_order_id", "is", null)
      .gte("created_at", since).order("created_at").limit(10);
    for (const order of (unpaid || []) as CjOrder[]) if ((await payCj(order)).supplier_paid_at) paid++;
  }
  return { sent: waiting?.length || 0, paid };
}

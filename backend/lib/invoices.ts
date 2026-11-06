import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { sendTransactionalMail } from "@/lib/mailer";

type InvoiceItem = {
  product_title: string;
  quantity: number;
  unit_price: number;
  selected_size?: string | null;
  selected_color?: string | null;
};
type InvoiceOrder = {
  id: string;
  invoice_number: string;
  customer_name: string | null;
  customer_email: string | null;
  shipping_address: Record<string, unknown> | null;
  billing_address: Record<string, unknown> | null;
  total: number;
  currency: string;
  payment_provider: string | null;
  created_at: string;
};
const euro = (value: number, currency = "EUR") =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(Number(value) || 0);
const safeText = (value: unknown) => String(value ?? "").replace(/[\r\n\u0000]/g, " ").slice(0, 240);
const addressLines = (value: Record<string, unknown> | null) => {
  if (!value) return [];
  return [
    value.name, value.line1, value.line2,
    [value.postal_code, value.city].filter(Boolean).join(" "),
    value.state, value.country
  ].map(safeText).filter(Boolean);
};

export async function buildInvoicePdf(order: InvoiceOrder, items: InvoiceItem[]): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  pdf.setTitle(`Helpmey Rechnung ${order.invoice_number}`);
  pdf.setAuthor("Helpmey");
  let page = pdf.addPage([595, 842]);
  const gold = rgb(0.77, 0.66, 0.50);
  const ink = rgb(0.10, 0.10, 0.10);
  const grey = rgb(0.38, 0.38, 0.38);
  const left = 48;
  const right = 547;
  const draw = (value: unknown, x: number, y: number, size = 9, font = regular, color = ink) => {
    const text = safeText(value).normalize("NFKD").replace(/[^\x20-\xFF]/g, "?");
    page.drawText(text, { x, y, size, font, color });
  };
  page.drawRectangle({ x: 0, y: 830, width: 595, height: 12, color: gold });
  draw("Helpmey", left, 790, 24, bold);
  draw("EVERYDAY STORE", left, 775, 8, regular, grey);
  const seller = [
    "digital future · Inhaber: Ahmed Ismail Saed",
    "Ehndorfer Str. 130",
    "24537 Neumünster · Deutschland",
    "info@digital-future.ai"
  ];
  seller.forEach((line, index) => draw(line, right - 210, 795 - index * 12, 8, regular, grey));
  draw("RECHNUNG", left, 720, 19, bold);
  const date = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", dateStyle: "medium" }).format(new Date(order.created_at));
  [
    ["Rechnungsnummer", order.invoice_number],
    ["Rechnungsdatum", date],
    ["Zahlungsart", order.payment_provider === "paypal" ? "PayPal" : "Stripe"],
    ["Zahlungsstatus", "Bezahlt / Zahlung geprüft"]
  ].forEach(([label, value], index) => {
    draw(`${label}:`, left, 695 - index * 15, 9, regular, grey);
    draw(value, left + 115, 695 - index * 15, 9, bold);
  });
  draw("Rechnungsempfänger", 335, 695, 10, bold);
  const customer = [order.customer_name, order.customer_email, ...addressLines(order.billing_address || order.shipping_address)];
  customer.forEach((line, index) => draw(line, 335, 679 - index * 12, 8, regular, grey));
  let y = 570;
  page.drawRectangle({ x: left, y: y - 7, width: right - left, height: 22, color: ink });
  draw("Artikel", left + 8, y, 8, bold, gold);
  draw("Menge", 380, y, 8, bold, gold);
  draw("Einzelpreis", 465, y, 8, bold, gold);
  draw("Gesamt", 540, y, 8, bold, gold);
  y -= 28;
  for (const item of items) {
    if (y < 150) { page = pdf.addPage([595, 842]); y = 790; }
    const title = safeText(item.product_title);
    const variant = [item.selected_size && `Größe: ${item.selected_size}`, item.selected_color && `Farbe: ${item.selected_color}`].filter(Boolean).join(" · ");
    draw(title, left + 8, y, 9, bold);
    if (variant) draw(variant, left + 8, y - 12, 7, regular, grey);
    draw(item.quantity, 390, y, 9);
    draw(euro(item.unit_price, order.currency), 465, y, 8);
    draw(euro(item.unit_price * item.quantity, order.currency), 540, y, 8);
    y -= variant ? 32 : 22;
    page.drawLine({ start: { x: left, y: y + 8 }, end: { x: right, y: y + 8 }, thickness: 0.5, color: gold });
  }
  y -= 8;
  const itemSubtotal = items.reduce((sum, item) => sum + Number(item.unit_price) * Number(item.quantity), 0);
  const shippingTotal = Math.max(0, Number(order.total) - itemSubtotal);
  if (shippingTotal > 0.005) {
    draw("Versand", 420, y, 9, regular);
    draw(euro(shippingTotal, order.currency), 540, y, 9, regular);
    y -= 16;
  }
  draw("Gesamtbetrag", 420, y, 10, bold);
  draw(euro(order.total, order.currency), 540, y, 10, bold);
  y -= 34;
  draw("Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.", left, y, 8, regular, grey);
  draw("Vielen Dank für Ihren Einkauf bei Helpmey.", left, y - 14, 8, regular, grey);
  return Buffer.from(await pdf.save());
}

export async function emailPaidOrderInvoice(orderId: string) {
  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
  const admin = createSupabaseAdminClient();
  const { data: order, error } = await admin.from("orders").select("*").eq("id", orderId).single();
  if (error || !order || !order.invoice_number) throw new Error("Finalized invoice order could not be loaded.");
  if (order.invoice_sent_at) return;
  const { data: items, error: itemsError } = await admin.from("order_items")
    .select("product_title,quantity,unit_price,selected_size,selected_color").eq("order_id", orderId);
  if (itemsError || !items?.length) throw new Error("Invoice line items could not be loaded.");
  const pdf = await buildInvoicePdf(order as InvoiceOrder, items as InvoiceItem[]);
  const filename = `Helpmey-Rechnung-${order.invoice_number}.pdf`;
  const amount = euro(Number(order.total), String(order.currency || "EUR"));
  const text = [
    `Guten Tag ${safeText(order.customer_name)},`,
    "",
    "vielen Dank für Ihre Bestellung bei Helpmey. Ihre Zahlung wurde bestätigt.",
    `Rechnungsnummer: ${order.invoice_number}`,
    `Gesamtbetrag: ${amount}`,
    "",
    "Ihre Rechnung finden Sie als PDF im Anhang.",
    "Mit freundlichen Grüßen",
    "Helpmey"
  ].join("\n");
  const shopEmail = process.env.NEXT_PUBLIC_INFO_EMAIL || "info@digital-future.ai";
  const recipients = [order.customer_email, shopEmail].filter((value): value is string => typeof value === "string" && value.includes("@"));
  if (!recipients.length) throw new Error("No invoice recipients are configured.");
  for (const recipient of recipients) {
    await sendTransactionalMail({
      to: recipient,
      subject: `Helpmey – Rechnung ${order.invoice_number}`,
      text,
      attachments: [{ filename, content: pdf, contentType: "application/pdf" }],
      replyTo: shopEmail
    });
  }
  const { error: updateError } = await admin.from("orders").update({ invoice_sent_at: new Date().toISOString() }).eq("id", orderId);
  if (updateError) throw new Error("Invoice email status could not be saved.");
}

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const productSchema = z.object({
  id: z.string().min(1).max(120),
  title: z.string().min(1).max(240),
  category: z.string().min(1).max(120),
  description: z.string().max(2000).default(""),
  price: z.number().nonnegative().max(10000000),
  currency: z.string().length(3).default("EUR"),
  imageUrl: z.string().url().max(2048).nullable().optional(),
  sku: z.string().max(120).nullable().optional(),
  supplier: z.string().max(120).nullable().optional(),
  inventory: z.number().int().nonnegative().max(10000000).default(0),
  sizes: z.array(z.string().max(40)).max(40).default([]),
  colors: z.array(z.string().max(60)).max(40).default([]),
  active: z.boolean().default(true)
});
const payloadSchema = z.object({ products: z.array(productSchema).min(1).max(250) });

function validToken(expected: string, supplied: string | null): boolean {
  if (!supplied) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  const token = process.env.SUPPLIER_SYNC_TOKEN;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\\s+/i, "") ?? null;
  if (!token || !validToken(token, supplied)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid supplier payload", details: parsed.error.flatten() }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.json({ error: "Supplier ingestion is not configured." }, { status: 503 });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const rows = parsed.data.products.map((product) => ({
    id: product.id, title: product.title, category: product.category, description: product.description,
    price: product.price, currency: product.currency.toUpperCase(), image_url: product.imageUrl ?? null,
    sku: product.sku ?? null, supplier: product.supplier ?? "CJ Dropshipping", inventory: product.inventory,
    variants: { sizes: product.sizes, colors: product.colors }, active: product.active, updated_at: new Date().toISOString()
  }));
  const { error } = await admin.from("products").upsert(rows, { onConflict: "id" });
  if (error) return NextResponse.json({ error: "Supplier products could not be saved." }, { status: 502 });
  return NextResponse.json({ ok: true, accepted: rows.length }, { headers: { "Cache-Control": "no-store" } });
}
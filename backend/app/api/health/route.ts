import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, "ok" | "unavailable"> = {
    application: "ok",
    supabase: "unavailable",
    smtp: process.env.SMTP_HOST && process.env.SMTP_USER && (process.env.SMTP_PASS || process.env.SMTP_PASSWORD) ? "ok" : "unavailable",
    stripe: process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET ? "ok" : "unavailable",
    paypal: process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET ? "ok" : "unavailable"
  };
  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("products").select("id").limit(1);
    if (!error) checks.supabase = "ok";
  } catch { /* Keep health response free of internal exception details. */ }
  const healthy = checks.application === "ok" && checks.supabase === "ok";
  return NextResponse.json({ ok: healthy, checks }, { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}

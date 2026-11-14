import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const LINK_DAYS = 7;

export async function GET(request: Request) {
  const origin = process.env.APP_ORIGIN || new URL(request.url).origin;
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const result = (status: string) => NextResponse.redirect(new URL(`/?newsletter=${status}#newsletter`, origin));
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return result("invalid");
  try {
    const since = new Date(Date.now() - LINK_DAYS * 86400000).toISOString();
    const { data, error } = await createSupabaseAdminClient().from("newsletter_subscribers")
      .update({ confirmed_at: new Date().toISOString(), token_hash: null })
      .eq("token_hash", createHash("sha256").update(token).digest("hex")).gte("requested_at", since)
      .select("email");
    if (error) throw error;
    return result(data?.length ? "confirmed" : "invalid");
  } catch {
    return result("error");
  }
}

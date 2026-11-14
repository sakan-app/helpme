import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const TYPES: EmailOtpType[] = ["signup", "email", "recovery", "invite", "email_change"];

// Email links (Supabase templates) point here with token_hash. Unlike the PKCE code in /auth/callback,
// verifying a token hash works from any browser or mail app, so confirmation and password reset do
// not depend on the browser that started them.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = process.env.APP_ORIGIN || url.origin;
  const tokenHash = url.searchParams.get("token_hash") ?? "";
  const type = url.searchParams.get("type") as EmailOtpType | null;
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(tokenHash) || !type || !TYPES.includes(type)) {
    return NextResponse.redirect(new URL("/?auth=link-expired", origin));
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) return NextResponse.redirect(new URL("/?auth=link-expired", origin));
  return NextResponse.redirect(new URL(type === "recovery" ? "/account/reset-password" : "/?auth=confirmed", origin));
}

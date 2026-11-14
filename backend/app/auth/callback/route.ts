import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const requestedNext = url.searchParams.get("next") ?? "/";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/";
  const origin = process.env.APP_ORIGIN;
  if (!origin) return NextResponse.json({ error: "Auth redirect is not configured." }, { status: 503 });
  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
    // Supabase only sends a code after it has verified the email. Signing in from the link needs the
    // browser that registered (PKCE cookie); from another browser or mail app the account is still
    // confirmed, so ask the customer to sign in instead of reporting a failure.
    return NextResponse.redirect(new URL("/?auth=confirmed-signin", origin));
  }
  // Expired or already used links come back with error parameters instead of a code.
  return NextResponse.redirect(new URL(url.searchParams.get("error_code") || url.searchParams.get("error") ? "/?auth=link-expired" : "/?auth=confirmation-failed", origin));
}
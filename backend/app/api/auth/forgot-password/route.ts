import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { enforceRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.object({ email: z.string().trim().email().max(254).transform((v) => v.toLowerCase()) }).strict();

export async function POST(request: Request) {
  let limit;
  try { limit = await enforceRateLimit(request, "password-reset", 3, 3600); }
  catch { return NextResponse.json({ error: "Passwortschutz ist vorübergehend nicht verfügbar." }, { status: 503 }); }
  if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bitte geben Sie eine gültige E-Mail-Adresse ein." }, { status: 400 });
  const origin = process.env.APP_ORIGIN;
  if (!origin) return NextResponse.json({ error: "Auth redirect is not configured." }, { status: 503 });
  const supabase = await createSupabaseServerClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: new URL("/auth/callback?next=/account/reset-password", origin).toString()
  });
  return NextResponse.json({ message: "Falls ein Konto existiert, wurde eine Anleitung versendet." }, { headers: { "Cache-Control": "no-store" } });
}
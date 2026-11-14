import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { enforceRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.object({
  email: z.string().trim().email().max(254).transform((v) => v.toLowerCase()),
  password: z.string().min(12).max(128).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/)
}).strict();

export async function POST(request: Request) {
  let limit;
  try { limit = await enforceRateLimit(request, "signup", 5, 3600); }
  catch { return NextResponse.json({ error: "Registrierungsschutz ist vorübergehend nicht verfügbar." }, { status: 503 }); }
  if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bitte gültige E-Mail und ein Passwort mit mindestens 12 Zeichen aus Groß- und Kleinbuchstaben sowie einer Zahl eingeben." }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const origin = process.env.APP_ORIGIN;
  if (!origin || new URL(origin).protocol !== "https:" && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Auth redirect is not configured securely." }, { status: 503 });
  }
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email, password: parsed.data.password,
    options: { emailRedirectTo: new URL("/auth/callback", origin).toString() }
  });
  if (error) return NextResponse.json({ error: "Registrierung konnte nicht abgeschlossen werden." }, { status: 400 });
  // Supabase answers a sign-up for an existing address with a user without identities and sends no
  // email. Customers kept registering again and then could not sign in, so the shop says it plainly.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return NextResponse.json({ error: "Diese E-Mail-Adresse hat bereits ein Konto. Bitte melden Sie sich an oder nutzen Sie \u201ePasswort vergessen?\u201c.", code: "account_exists" }, { status: 409 });
  }
  return NextResponse.json({
    user: data.user ? { id: data.user.id, email: data.user.email } : null,
    message: "Bitte bestätigen Sie Ihre E-Mail-Adresse über den zugesandten Aktivierungslink."
  }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
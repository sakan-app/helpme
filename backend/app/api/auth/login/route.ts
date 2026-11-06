import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { clearFailedLogin, enforceRateLimit, rateLimitResponse, recordFailedLogin } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.object({ email: z.string().trim().email().max(254).transform((v) => v.toLowerCase()), password: z.string().min(1).max(128) }).strict();

export async function POST(request: Request) {
  let general;
  try { general = await enforceRateLimit(request, "login", 20, 600); }
  catch { return NextResponse.json({ error: "Login-Schutz ist vorübergehend nicht verfügbar." }, { status: 503 }); }
  if (!general.allowed) return rateLimitResponse(general.retryAfter);

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Anmeldedaten." }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    try {
      const failed = await recordFailedLogin(request, parsed.data.email);
      if (!failed.allowed) return rateLimitResponse(failed.retryAfter);
    } catch {
      return NextResponse.json({ error: "Login-Schutz ist vorübergehend nicht verfügbar." }, { status: 503 });
    }
    return NextResponse.json({ error: "Anmeldung fehlgeschlagen. Prüfen Sie E-Mail und Passwort." }, { status: 401 });
  }
  try { await clearFailedLogin(request, parsed.data.email); } catch {
    await supabase.auth.signOut();
    return NextResponse.json({ error: "Anmeldung vorübergehend nicht verfügbar." }, { status: 503 });
  }
  return NextResponse.json({ user: { id: data.user.id, email: data.user.email } }, { headers: { "Cache-Control": "no-store" } });
}
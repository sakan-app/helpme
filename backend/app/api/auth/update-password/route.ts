import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { enforceRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.object({ password: z.string().min(12).max(128).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/) }).strict();

export async function POST(request: Request) {
  let limit;
  try { limit = await enforceRateLimit(request, "password-update", 5, 3600); }
  catch { return NextResponse.json({ error: "Passwortschutz ist vorübergehend nicht verfügbar." }, { status: 503 }); }
  if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Das Passwort muss mindestens 12 Zeichen, Groß- und Kleinbuchstaben sowie eine Zahl enthalten." }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return NextResponse.json({ error: "Der Passwort-Link ist ungültig oder abgelaufen." }, { status: 401 });
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return NextResponse.json({ error: "Das Passwort konnte nicht aktualisiert werden." }, { status: 400 });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

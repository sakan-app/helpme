import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const schema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128)
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bitte gültige E-Mail und ein Passwort mit mindestens 12 Zeichen eingeben." }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const origin = process.env.APP_ORIGIN;
  if (!origin) return NextResponse.json({ error: "Auth redirect is not configured." }, { status: 503 });

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: `${origin}/auth/callback` }
  });
  if (error) return NextResponse.json({ error: "Registrierung konnte nicht abgeschlossen werden." }, { status: 400 });
  return NextResponse.json({
    user: data.user ? { id: data.user.id, email: data.user.email } : null,
    message: "Bitte bestätigen Sie Ihre E-Mail-Adresse über den zugesandten Aktivierungslink."
  }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
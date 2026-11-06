import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const schema = z.object({ email: z.string().trim().email().max(254) });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bitte geben Sie eine gültige E-Mail-Adresse ein." }, { status: 400 });
  const origin = process.env.APP_ORIGIN;
  if (!origin) return NextResponse.json({ error: "Auth redirect is not configured." }, { status: 503 });
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/callback?next=/account/reset-password`
  });
  if (error) return NextResponse.json({ error: "Die Anfrage konnte nicht verarbeitet werden." }, { status: 400 });
  return NextResponse.json({ message: "Falls ein Konto existiert, wurde eine Anleitung versendet." }, { headers: { "Cache-Control": "no-store" } });
}
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const schema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(128) });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Anmeldedaten." }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) return NextResponse.json({ error: "Anmeldung fehlgeschlagen. Prüfen Sie E-Mail und Passwort." }, { status: 401 });
  return NextResponse.json({ user: { id: data.user.id, email: data.user.email } }, { headers: { "Cache-Control": "no-store" } });
}
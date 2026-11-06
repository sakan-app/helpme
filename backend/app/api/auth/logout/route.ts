import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export async function POST() {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut();
  if (error) return NextResponse.json({ error: "Abmeldung fehlgeschlagen." }, { status: 400 });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
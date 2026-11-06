import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return NextResponse.json({ user: null }, { status: 401, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ user: { id: data.user.id, email: data.user.email } }, { headers: { "Cache-Control": "no-store" } });
}
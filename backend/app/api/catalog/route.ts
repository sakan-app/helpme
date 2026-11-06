import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from("products")
      .select("id,title,category,description,price,currency,image_url,variants")
      .eq("active", true).order("created_at", { ascending: true });
    if (error) throw error;
    const products = (data ?? []).map((row) => {
      const variants = row.variants && typeof row.variants === "object" ? row.variants as Record<string, unknown> : {};
      return {
        id: row.id, title: row.title, category: row.category, description: row.description,
        price: Number(row.price), currency: row.currency, imageUrl: row.image_url,
        sizes: Array.isArray(variants.sizes) ? variants.sizes.filter((x): x is string => typeof x === "string") : ["One Size"],
        colors: Array.isArray(variants.colors) ? variants.colors.filter((x): x is string => typeof x === "string") : ["Standard"]
      };
    });
    return NextResponse.json({ products }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Produktkatalog ist derzeit nicht verfügbar." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
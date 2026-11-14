import { NextResponse } from "next/server";
import { retryCjOrders } from "@/lib/cj";
import { enforceRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Called every 30 minutes by the Worker's cron (custom-worker.ts). It only retries this shop's own paid
// orders that are not at CJ yet or not paid there, so it needs no secret; the rate limit keeps it cheap.
export async function POST(request: Request) {
  let limit;
  try { limit = await enforceRateLimit(request, "cj-retry", 3, 600); }
  catch { return NextResponse.json({ error: "Rate limiting unavailable." }, { status: 503 }); }
  if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
  try {
    return NextResponse.json(await retryCjOrders(), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("CJ retry failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "CJ retry failed." }, { status: 500 });
  }
}

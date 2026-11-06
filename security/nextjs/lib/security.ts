import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { z } from "zod";

/**
 * Shared security primitives for Next.js Route Handlers.
 * Requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.
 * Distributed Redis limiting is used instead of an unsafe per-process Map.
 */
const redis = Redis.fromEnv();

export const apiRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, "1 m"),
  analytics: true,
  prefix: "helpmey:ratelimit:api",
});

export const authRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "15 m"),
  analytics: true,
  prefix: "helpmey:ratelimit:auth",
});

export function clientIp(request: Request): string {
  // On production, trust forwarding headers only when set by your known proxy.
  // Configure your platform's trusted proxy behavior; never trust arbitrary client IP headers.
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first && first.length <= 64 ? first : "unknown";
}

export async function enforceLimit(
  request: Request,
  limiter: Ratelimit = apiRateLimit,
): Promise<Response | null> {
  const ip = clientIp(request);
  const result = await limiter.limit(ip);
  if (result.success) return null;
  return Response.json(
    { error: "Zu viele Anfragen. Bitte später erneut versuchen." },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.max(1, Math.ceil((result.reset - Date.now()) / 1000))),
        "Cache-Control": "no-store",
      },
    },
  );
}

export const emailSchema = z.string().trim().email().max(254);
export const identifierSchema = z.string().trim().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);
export const moneySchema = z.number().finite().nonnegative().max(100000);

/** Use only server-side parameterized SQL / ORM methods after validating with schemas. */
export function jsonError(message: string, status = 400): Response {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

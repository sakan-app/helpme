import { createHash } from "node:crypto";

type RateResult = { allowed: boolean; remaining: number; retryAfter: number };
const localWindows = new Map<string, { count: number; expiresAt: number }>();

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return request.headers.get("x-real-ip")?.trim() || forwarded || "unknown";
}

async function redisCommand<T>(command: unknown[]): Promise<T> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("Rate limiting is not configured.");
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store"
  });
  if (!response.ok) throw new Error("Rate-limit storage unavailable.");
  const payload = await response.json() as { result?: T; error?: string };
  if (payload.error) throw new Error("Rate-limit storage command failed.");
  return payload.result as T;
}

async function increment(key: string, limit: number, windowSeconds: number): Promise<RateResult> {
  const script = "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]); end; local ttl=redis.call('TTL',KEYS[1]); return {n,ttl}";
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const result = await redisCommand<[number, number]>(["EVAL", script, "1", key, String(windowSeconds)]);
    const count = Number(result[0]);
    const ttl = Math.max(1, Number(result[1]));
    return { allowed: count <= limit, remaining: Math.max(0, limit - count), retryAfter: ttl };
  }
  if (process.env.NODE_ENV === "production") throw new Error("Production rate limiting requires Upstash Redis.");
  const now = Date.now();
  const current = localWindows.get(key);
  const entry = !current || current.expiresAt <= now
    ? { count: 0, expiresAt: now + windowSeconds * 1000 }
    : current;
  entry.count += 1;
  localWindows.set(key, entry);
  return { allowed: entry.count <= limit, remaining: Math.max(0, limit - entry.count), retryAfter: Math.max(1, Math.ceil((entry.expiresAt - now) / 1000)) };
}

export async function enforceRateLimit(request: Request, scope: string, limit: number, windowSeconds: number): Promise<RateResult> {
  const ip = clientIp(request);
  return increment(`helpmey:rl:${scope}:${digest(ip)}`, limit, windowSeconds);
}

export async function recordFailedLogin(request: Request, email: string): Promise<RateResult> {
  const ip = clientIp(request);
  return increment(`helpmey:login-fail:${digest(ip)}:${digest(email.toLowerCase())}`, 5, 600);
}

export async function clearFailedLogin(request: Request, email: string): Promise<void> {
  const ip = clientIp(request);
  const key = `helpmey:login-fail:${digest(ip)}:${digest(email.toLowerCase())}`;
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    await redisCommand<number>(["DEL", key]);
    return;
  }
  if (process.env.NODE_ENV !== "production") localWindows.delete(key);
}

export function rateLimitResponse(retryAfter: number): Response {
  return Response.json({ error: "Zu viele Anfragen. Bitte versuchen Sie es später erneut." }, {
    status: 429,
    headers: { "Retry-After": String(retryAfter), "Cache-Control": "no-store" }
  });
}

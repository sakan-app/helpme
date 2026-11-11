import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieOptions = Parameters<NextResponse["cookies"]["set"]>[2];
type CookieUpdate = { name: string; value: string; options?: CookieOptions };

function securityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    // Next.js dev mode evaluates code for hot reload; production keeps eval blocked.
    "script-src 'self' 'nonce-" + nonce + "' 'strict-dynamic' https://js.stripe.com" + (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    "connect-src 'self' https://*.supabase.co https://api.stripe.com https://api-m.paypal.com https://api-m.sandbox.paypal.com https://*.klarna.com",
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://www.paypal.com https://www.sandbox.paypal.com",
    "form-action 'self'", "base-uri 'self'", "object-src 'none'", "frame-ancestors 'none'", "upgrade-insecure-requests"
  ].join("; ");
}

export async function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const policy = securityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  const path = request.nextUrl.pathname;
  const providerWebhook = path.startsWith("/api/webhooks/") || path === "/api/payments/stripe/webhook";
  const requiresSameOrigin = request.method !== "GET" && request.method !== "HEAD" &&
    (path.startsWith("/api/auth/") || path === "/api/checkout" ||
      (path.startsWith("/api/payments/") && !providerWebhook) || path === "/api/contact");
  if (requiresSameOrigin && !providerWebhook) {
    const origin = request.headers.get("origin");
    if (!origin || origin !== request.nextUrl.origin) {
      const denied = NextResponse.json({ error: "Cross-origin request denied." }, { status: 403 });
      denied.headers.set("Content-Security-Policy", policy);
      denied.headers.set("X-Content-Type-Options", "nosniff");
      denied.headers.set("X-Frame-Options", "DENY");
      return denied;
    }
  }

  let response = NextResponse.next({ request: { headers: requestHeaders } });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) {
    const supabase = createServerClient(url, key, {
      cookieOptions: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet: CookieUpdate[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        }
      }
    });
    await supabase.auth.getUser();
  }

  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-site");
  if (process.env.NODE_ENV === "production") response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};

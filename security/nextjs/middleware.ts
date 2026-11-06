import { NextRequest, NextResponse } from "next/server";

/**
 * Next.js security middleware starter for the HELPMEY backend.
 * IMPORTANT: this file is intentionally under security/nextjs/ and is NOT
 * automatically activated by the current static GitHub Pages site.
 * Move it to the application root (or src/middleware.ts) when migrating to Next.js.
 */
const productionOrigin = process.env.APP_ORIGIN ?? "https://saiedahm.github.io";
const allowedOrigins = new Set([productionOrigin]);

const securityHeaders: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(self)",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-DNS-Prefetch-Control": "off",
  // Tune this policy to the exact assets / payment providers before enabling.
  "Content-Security-Policy": [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self' https://checkout.stripe.com https://www.paypal.com",
    "img-src 'self' data: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "script-src 'self' https://js.stripe.com",
    "connect-src 'self' https://api.stripe.com",
    "frame-src https://js.stripe.com https://hooks.stripe.com https://www.paypal.com",
    "upgrade-insecure-requests",
  ].join("; "),
};

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  for (const [key, value] of Object.entries(securityHeaders)) {
    response.headers.set(key, value);
  }

  const origin = request.headers.get("origin");
  if (origin && allowedOrigins.has(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Vary", "Origin");
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Stripe-Signature, X-CSRF-Token");
    response.headers.set("Access-Control-Max-Age", "600");
  } else if (origin && request.nextUrl.pathname.startsWith("/api/")) {
    return new NextResponse("Origin not allowed", { status: 403, headers: securityHeaders });
  }

  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: response.headers });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const commit = process.env.CF_PAGES_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || "local";
  const deployedAt = process.env.VERCEL_GIT_COMMIT_DATE || process.env.BUILD_TIMESTAMP || null;
  const environment = process.env.CF_PAGES ? "cloudflare-pages" : process.env.VERCEL_ENV || process.env.NODE_ENV || "development";

  return NextResponse.json(
    { name: "Helpmey", version: process.env.npm_package_version || "1.0.0", commit, deployedAt, environment },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

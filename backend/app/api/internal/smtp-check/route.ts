import { NextResponse } from "next/server";
import { verifySmtpConnection } from "@/lib/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const token = process.env.SMTP_TEST_TOKEN;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || !supplied || supplied.length !== token.length ||
      !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await verifySmtpConnection();
    return NextResponse.json({ ok: true, host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT ?? 465), tls: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "SMTP TLS connection or authentication failed. Check host credentials and provider settings." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
import { NextResponse } from "next/server";
import { z } from "zod";
import { sendTransactionalMail } from "@/lib/mailer";
import { enforceRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  subject: z.string().trim().min(3).max(160),
  message: z.string().trim().min(5).max(5000)
}).strict();

export async function POST(request: Request) {
  let limit;
  try { limit = await enforceRateLimit(request, "contact", 5, 60); }
  catch { return NextResponse.json({ error: "Kontaktformular ist vorübergehend nicht verfügbar." }, { status: 503 }); }
  if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bitte prüfen Sie Ihre Eingaben." }, { status: 400 });
  const { name, email, subject, message } = parsed.data;
  try {
    const body = `Name: ${name}\nE-Mail: ${email}\n\n${message}`;
    await Promise.all([
      sendTransactionalMail({ to: process.env.NEXT_PUBLIC_INFO_EMAIL || "info@digital-future.ai", subject: `[Helpmey Kontakt] ${subject}`, text: body, replyTo: email }),
      sendTransactionalMail({ to: process.env.NEXT_PUBLIC_SERVER_EMAIL || "server@digital-future.ai", subject: `[Helpmey Kontakt] ${subject}`, text: body, replyTo: email })
    ]);
    return NextResponse.json({ ok: true }, { status: 202 });
  } catch {
    return NextResponse.json({ error: "Ihre Nachricht konnte momentan nicht versendet werden." }, { status: 503 });
  }
}

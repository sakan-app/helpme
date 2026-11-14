import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendTransactionalMail } from "@/lib/mailer";
import { enforceRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  locale: z.string().regex(/^[A-Z]{2}$/).optional()
}).strict();
// Same answer whether or not the address is already subscribed, so the form cannot reveal subscribers.
const RESEND_AFTER_MS = 10 * 60 * 1000;
const accepted = { message: "Bitte bestätigen Sie Ihre Anmeldung über den Link in der E-Mail. / Please confirm your subscription with the link in the email." };

export async function POST(request: Request) {
  let limit;
  try { limit = await enforceRateLimit(request, "newsletter", 5, 3600); }
  catch { return NextResponse.json({ error: "Newsletter-Anmeldung ist vorübergehend nicht verfügbar." }, { status: 503 }); }
  if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bitte geben Sie eine gültige E-Mail-Adresse ein." }, { status: 400 });
  const origin = process.env.APP_ORIGIN;
  if (!origin) return NextResponse.json({ error: "Newsletter-Anmeldung ist vorübergehend nicht verfügbar." }, { status: 503 });

  try {
    const admin = createSupabaseAdminClient();
    const { email, locale } = parsed.data;
    const { data: existing, error: readError } = await admin.from("newsletter_subscribers").select("confirmed_at,requested_at,token_hash").eq("email", email).maybeSingle();
    if (readError) throw readError;
    // A second click within a few minutes must not replace the link already on its way.
    const recentlySent = existing?.token_hash && Date.now() - new Date(existing.requested_at).getTime() < RESEND_AFTER_MS;
    if (!existing?.confirmed_at && !recentlySent) {
      const token = randomBytes(32).toString("base64url");
      const { error } = await admin.from("newsletter_subscribers").upsert({
        email, locale: locale ?? null, token_hash: createHash("sha256").update(token).digest("hex"),
        requested_at: new Date().toISOString(), confirmed_at: null
      }, { onConflict: "email" });
      if (error) throw error;
      const link = new URL(`/api/newsletter/confirm?token=${token}`, origin).toString();
      try {
        await sendTransactionalMail({
          to: email,
          subject: "Helpmey: Bitte bestätigen Sie Ihre Newsletter-Anmeldung / Please confirm",
          text: [
            "Guten Tag,", "",
            "bitte bestätigen Sie Ihre Anmeldung zum Helpmey-Newsletter mit diesem Link (7 Tage gültig):", link, "",
            "Wenn Sie sich nicht angemeldet haben, ignorieren Sie diese E-Mail; Sie erhalten dann keine weiteren Nachrichten.", "",
            "Hello,", "", "please confirm your subscription to the Helpmey newsletter with the link above (valid for 7 days).",
            "If you did not sign up, ignore this email and you will not hear from us again.", "", "Helpmey"
          ].join("\n")
        });
      } catch (err) {
        // The email never left, so the next attempt may send a fresh link straight away.
        await admin.from("newsletter_subscribers").update({ token_hash: null }).eq("email", email);
        throw err;
      }
    }
    return NextResponse.json(accepted, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Die Anmeldung konnte momentan nicht gespeichert werden." }, { status: 503 });
  }
}

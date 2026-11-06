import nodemailer, { type SendMailOptions, type Transporter } from "nodemailer";
import { z } from "zod";

let transport: Transporter | undefined;
const emailSchema = z.string().trim().email().max(254);
const orderMailSchema = z.object({
  to: emailSchema,
  orderReference: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  total: z.string().max(40).regex(/^[0-9]+(?:[.,][0-9]{2})?\\s?(?:EUR|€)$/)
}).strict();

function getTransport(): Transporter {
  if (transport) return transport;
  const host = process.env.SMTP_HOST ?? "smtps.udag.de";
  const port = Number(process.env.SMTP_PORT ?? 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS ?? process.env.SMTP_PASSWORD;
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  if (!user || !pass || ![465, 587].includes(port)) {
    throw new Error("SMTP is not configured. Set SMTP_USER and SMTP_PASS in the hosting secret manager.");
  }
  transport = nodemailer.createTransport({
    host, port, secure, auth: { user, pass }, requireTLS: port === 587,
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000
  });
  return transport;
}

export async function verifySmtpConnection(): Promise<void> {
  await getTransport().verify();
}

export async function sendTransactionalMail(options: Omit<SendMailOptions, "from"> & { from?: string }) {
  if (typeof options.to !== "string" || !emailSchema.safeParse(options.to).success) {
    throw new Error("Transactional email recipient is invalid.");
  }
  const subject = typeof options.subject === "string" ? options.subject.replace(/[\\r\\n]+/g, " ").slice(0, 200) : "Helpmey notification";
  const replyTo = typeof options.replyTo === "string" && emailSchema.safeParse(options.replyTo).success ? options.replyTo : undefined;
  const from = options.from ?? process.env.SMTP_FROM ?? "Helpmey <server@digital-future.ai>";
  return getTransport().sendMail({ ...options, from, to: options.to, subject, replyTo });
}

export async function sendOrderConfirmation(input: { to: string; orderReference: string; total: string }) {
  const parsed = orderMailSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid order confirmation data.");
  return sendTransactionalMail({
    to: parsed.data.to,
    subject: `Helpmey – Bestellbestätigung ${parsed.data.orderReference}`,
    text: `Vielen Dank für Ihre Bestellung bei Helpmey. Bestellnummer: ${parsed.data.orderReference}. Gesamtbetrag: ${parsed.data.total}.`,
    replyTo: process.env.CONTACT_EMAIL ?? "contact@digital-future.ai"
  });
}

export async function sendOperationsAlert(subject: string, message: string) {
  return sendTransactionalMail({
    to: process.env.SERVER_EMAIL ?? "server@digital-future.ai",
    subject: subject.replace(/[\\r\\n]+/g, " ").slice(0, 160),
    text: message.replace(/\\u0000/g, "").slice(0, 10000)
  });
}

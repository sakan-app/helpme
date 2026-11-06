import nodemailer, { type SendMailOptions, type Transporter } from "nodemailer";

let transport: Transporter | undefined;

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
    host,
    port,
    secure,
    auth: { user, pass },
    requireTLS: port === 587,
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000
  });
  return transport;
}

export async function verifySmtpConnection(): Promise<void> {
  await getTransport().verify();
}

export async function sendTransactionalMail(options: Omit<SendMailOptions, "from"> & { from?: string }) {
  const from = options.from ?? process.env.SMTP_FROM ?? "Helpmey <contact@digital-future.ai>";
  return getTransport().sendMail({ ...options, from });
}

export async function sendOrderConfirmation(input: { to: string; orderReference: string; total: string }) {
  const safeReference = input.orderReference.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  if (!safeReference || input.total.length > 40) throw new Error("Invalid order confirmation data.");
  return sendTransactionalMail({
    to: input.to,
    subject: `Helpmey – Bestellbestätigung ${safeReference}`,
    text: `Vielen Dank für Ihre Bestellung bei Helpmey. Bestellnummer: ${safeReference}. Gesamtbetrag: ${input.total}.`,
    replyTo: process.env.CONTACT_EMAIL ?? "contact@digital-future.ai"
  });
}

export async function sendOperationsAlert(subject: string, message: string) {
  return sendTransactionalMail({
    to: process.env.SERVER_EMAIL ?? "server@digital-future.ai",
    subject: subject.slice(0, 160),
    text: message.slice(0, 10000)
  });
}
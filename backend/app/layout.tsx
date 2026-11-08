import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./luxury-store.css";

export const metadata: Metadata = {
  title: "Helpmey — Everyday Store",
  description: "Zeitlose Essentials, Naturfasern, ehrliche Keramik und leise Accessoires. Helpmey Everyday Store.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://example.com"),
  applicationName: "Helpmey",
  robots: { index: true, follow: true }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="de"><body>{children}</body></html>;
}

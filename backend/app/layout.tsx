import type { Metadata } from "next";
import type { ReactNode } from "react";
// Fonts ship with the site (Fontsource packages), so neither the build nor visitors contact Google Fonts.
import "@fontsource/cormorant-garamond/400.css";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "./globals.css";
import "./luxury-store.css";

// The middleware CSP uses a per-request nonce, which only reaches pages rendered per request.
export const dynamic = "force-dynamic";

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

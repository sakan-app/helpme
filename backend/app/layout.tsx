import type { Metadata, Viewport } from "next";
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

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://example.com";
const description = "Discover a world of timeless luxury, fashion, beauty, watches, jewellery and exceptional gifts at Helpmey. Luxury beyond limits.";

export const metadata: Metadata = {
  title: "Helpmey — Luxury Beyond Limits",
  description,
  metadataBase: new URL(siteUrl),
  applicationName: "Helpmey",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website", siteName: "Helpmey", url: "/", locale: "en_GB", alternateLocale: ["de_DE", "ar_AR"],
    title: "Helpmey — Luxury Beyond Limits", description,
    images: [{ url: "/helpmey-palace-hero.jpg", width: 1365, height: 768, alt: "Helpmey luxury storefront" }]
  },
  twitter: { card: "summary_large_image", title: "Helpmey — Luxury Beyond Limits", description, images: ["/helpmey-palace-hero.jpg"] }
};

export const viewport: Viewport = { themeColor: "#100e0b" };

// Tells search engines this is an online store, with its logo and contact address.
const storeData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "OnlineStore", "@id": `${siteUrl}/#store`, name: "Helpmey", url: siteUrl, description,
      logo: `${siteUrl}/icon.png`, image: `${siteUrl}/helpmey-palace-hero.jpg`, email: "info@digital-future.ai",
      address: { "@type": "PostalAddress", streetAddress: "Ehndorfer Str. 130", postalCode: "24537", addressLocality: "Neumünster", addressCountry: "DE" }
    },
    { "@type": "WebSite", "@id": `${siteUrl}/#website`, name: "Helpmey", url: siteUrl, inLanguage: ["en", "de", "ar"], publisher: { "@id": `${siteUrl}/#store` } }
  ]
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // English is the storefront's default language; the page updates lang when a visitor switches.
  return <html lang="en"><body>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(storeData).replace(/</g, "\\u003c") }}/>
    {children}
  </body></html>;
}

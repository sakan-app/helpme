import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Helpmey Account Services",
  robots: { index: false, follow: false }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="de"><body style={{ margin: 0, background: "#121212", color: "#f8f5f0", fontFamily: "Arial, sans-serif" }}>{children}</body></html>;
}
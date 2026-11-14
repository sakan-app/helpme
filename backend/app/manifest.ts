import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Helpmey — Luxury Beyond Limits", short_name: "Helpmey", start_url: "/", display: "standalone",
    background_color: "#100e0b", theme_color: "#100e0b",
    icons: [{ src: "/icon.png", sizes: "192x192", type: "image/png" }, { src: "/apple-icon.png", sizes: "180x180", type: "image/png" }]
  };
}

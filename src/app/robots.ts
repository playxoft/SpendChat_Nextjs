import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/app",
          "/transactions",
          "/analytics",
          "/files",
          "/settings",
          "/api/",
          "/sign-in",
          "/sign-up",
          "/verify-email",
          // Public-but-secret share links; noIndex'd too, but keep crawlers out.
          "/share/",
        ],
      },
    ],
    sitemap: `${siteConfig.url}/sitemap.xml`,
    host: siteConfig.url,
  };
}

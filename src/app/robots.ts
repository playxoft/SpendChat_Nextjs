import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          // Every authenticated app page lives under /app — one prefix covers
          // them all, so new app routes need no entry here.
          "/app",
          "/api/",
          // JSON build/version info, not a page — nothing for an index.
          "/version",
          "/sign-in",
          "/sign-up",
          "/verify-email",
          // Public-but-secret share links; noIndex'd too, but keep crawlers out.
          "/share/",
          // Development-only scratch routes (the demo gallery). They 404 in
          // production, but listing the prefix keeps crawlers from spending
          // budget discovering that for themselves.
          "/dev/",
        ],
      },
    ],
    sitemap: `${siteConfig.url}/sitemap.xml`,
    host: siteConfig.url,
  };
}

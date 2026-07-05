import type { NextConfig } from "next";
import createMDX from "@next/mdx";

/**
 * Security headers applied to every response.
 * CSP allows inline styles (required by the UI lib). Firebase Auth runs in the
 * browser: it calls Google's Identity Toolkit / Secure Token / JWKS endpoints
 * (`*.googleapis.com`) and opens a Google sign-in popup + a hidden iframe on the
 * Firebase auth domain — hence the extra script/connect/frame sources below.
 * Tighten to a nonce-based policy as a future step.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://www.gstatic.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.googleapis.com https://*.firebaseapp.com https://securetoken.googleapis.com https://identitytoolkit.googleapis.com",
      "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com https://apis.google.com",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Let `.md`/`.mdx` files be imported as React components (blog content lives in
  // `src/content/blog`). The default page extensions must stay listed too.
  pageExtensions: ["ts", "tsx", "js", "jsx", "md", "mdx"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

// remark-gfm is referenced by name (string) so it works under Turbopack, which
// can't accept plugin functions. It adds tables, strikethrough, and autolinks.
const withMDX = createMDX({
  options: {
    remarkPlugins: [["remark-gfm"]],
  },
});

export default withMDX(nextConfig);

// Enables Cloudflare bindings (env, secrets) during `next dev` via OpenNext.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();

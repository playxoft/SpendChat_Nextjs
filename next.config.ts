import type { NextConfig } from "next";
import createMDX from "@next/mdx";

/**
 * Security headers applied to every response.
 * CSP allows inline styles (required by the UI lib). Firebase Auth runs in the
 * browser: it calls Google's Identity Toolkit / Secure Token / JWKS endpoints
 * (`*.googleapis.com`) and opens a Google sign-in popup + a hidden iframe on the
 * Firebase auth domain — hence the extra script/connect/frame sources below.
 * `unsafe-eval` is dev-only (Turbopack/webpack eval source maps); production
 * Next.js and the Firebase SDK don't eval. `unsafe-inline` stays until a
 * nonce-based policy is possible (needs middleware, which OpenNext on Workers
 * can't run).
 */
const isDev = process.env.NODE_ENV === "development";

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
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://apis.google.com https://www.gstatic.com`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.googleapis.com https://*.firebaseapp.com https://securetoken.googleapis.com https://identitytoolkit.googleapis.com",
      "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com https://apis.google.com",
      // pdf.js renders PDF thumbnails in a same-origin (bundled) module worker.
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
];

/**
 * The attachments API streams file bytes that the in-app preview embeds in a
 * same-origin `<iframe>` (PDFs). The app-wide `X-Frame-Options: DENY` +
 * `frame-ancestors 'none'` would block even that same-origin frame, so this route
 * gets a relaxed pair — framing is allowed from our own origin only. It's still
 * an authenticated route, so this doesn't widen access.
 */
const attachmentHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Let `.md`/`.mdx` files be imported as React components (blog content lives in
  // `src/content/blog`). The default page extensions must stay listed too.
  pageExtensions: ["ts", "tsx", "js", "jsx", "md", "mdx"],
  // pg's Cloudflare socket shim (pg-cloudflare) only exposes its real build
  // (dist/index.js) under the "workerd" export condition; the `default` is a
  // stub (dist/empty.js). Next's dependency tracing runs in a node context, so
  // it resolves `default` and copies only the stub — but OpenNext bundles the
  // server with the workerd condition and needs dist/index.js, which then isn't
  // in the traced output ("Could not resolve pg-cloudflare"). Force the real
  // workerd build into the trace so esbuild can bundle it.
  outputFileTracingIncludes: {
    "**/*": [
      "./node_modules/.pnpm/pg-cloudflare@*/node_modules/pg-cloudflare/dist/**/*",
    ],
  },
  async headers() {
    return [
      // The attachments API allows same-origin framing (for the in-app preview);
      // every other route keeps the strict DENY / frame-ancestors 'none'. Only
      // one source matches a given path (the negative lookahead excludes the
      // attachments route from the general rule) so headers never conflict.
      { source: "/api/attachments/:path*", headers: attachmentHeaders },
      { source: "/((?!api/attachments).*)", headers: securityHeaders },
    ];
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
// Gate to actual dev: OpenNext's `shouldContextInitializationRun` only checks for
// a global AsyncLocalStorage, which is also present during `next build` — so
// without this guard the production build spins up the Miniflare platform proxy
// and fails on the Hyperdrive binding's missing local connection string. The
// build doesn't need it (the deployed worker initializes its own context, and
// getDb() falls back to NEON_POSTGRES_DATABASE_URL).
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
if (process.env.NODE_ENV === "development") {
  initOpenNextCloudflareForDev();
}

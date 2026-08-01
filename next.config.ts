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
 * can't run). The googletagmanager.com/google-analytics.com/clarity.ms sources
 * are GA4 + Microsoft Clarity, consent-gated and marketing-pages-only
 * (see src/components/marketing/analytics-provider.tsx) — they still need to
 * be allow-listed everywhere since this header applies to every route.
 */
const isDev = process.env.NODE_ENV === "development";

/**
 * One `Permissions-Policy` string, built in one place so the three variants
 * below can't drift. Everything stays fully closed except the microphone, which
 * only the tracker opens (see `appHeaders`).
 */
function permissionsPolicy(microphone: "()" | "(self)"): string {
  return `camera=(), microphone=${microphone}, geolocation=(), browsing-topics=()`;
}

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    // Fully closed by default. Voice entry needs `microphone=(self)`, but only
    // on `/app` — see `appHeaders`, which is this list with that one value
    // swapped. Marketing pages, the blog and auth never record, so they keep
    // advertising no mic access at all.
    key: "Permissions-Policy",
    value: permissionsPolicy("()"),
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://apis.google.com https://www.gstatic.com https://www.googletagmanager.com https://www.clarity.ms`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.googleapis.com https://*.firebaseapp.com https://securetoken.googleapis.com https://identitytoolkit.googleapis.com https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://www.clarity.ms https://*.clarity.ms",
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
 * The tracker, and only the tracker. `/app` is the one page that renders the
 * composer, so it's the one page that records through MediaRecorder.
 *
 * The distinction matters because `microphone=()` doesn't merely fail to grant
 * the mic — it *disables* the API for every origin including our own. A page
 * under that header can't get the mic no matter what the user allows in their
 * browser: the permission reads back as "denied" and getUserMedia rejects with
 * `NotAllowedError`, no prompt shown. `(self)` grants it to this origin only,
 * so embedded third-party frames still get nothing.
 *
 * Derived from `securityHeaders` rather than copied, so the CSP (the long,
 * easily-desynced one) has exactly one definition.
 */
const appHeaders = securityHeaders.map((h) =>
  h.key === "Permissions-Policy" ? { ...h, value: permissionsPolicy("(self)") } : h,
);

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
    // Fully closed like `securityHeaders`, and unlike `appHeaders`: this route
    // only streams file bytes into a preview iframe and has no use for a mic.
    key: "Permissions-Policy",
    value: permissionsPolicy("()"),
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
  experimental: {
    serverActions: {
      // Voice entry posts a recording through a server action
      // (`transcribeVoiceNoteAction`) as multipart. Next caps server-action
      // bodies at 1MB by default, but a recording may be up to
      // `MAX_AUDIO_BYTES` (4MB) — so the default would reject longer clips
      // (Safari's fatter AAC especially) with an opaque framework error before
      // the action's own friendly size check ever runs. 5mb covers the cap plus
      // multipart overhead; the action still enforces the real 4MB limit itself,
      // after the role + quota gates.
      //
      // **This is global — Next has no per-action override.** Every server
      // action in the app now accepts up to 5MB, not just the voice one, so
      // each is responsible for its own size check (as attachments, also
      // capped at 5MB, already are). Raise it only for a body that genuinely
      // needs it, and keep the per-action check next to the action.
      bodySizeLimit: "5mb",
    },
  },
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
      // Three header sets, and **exactly one source matches any given path** —
      // the negative lookahead in the catch-all excludes every special case, so
      // no path is ever handed two conflicting values for the same key:
      //   the file-serving APIs  same-origin framing, for the in-app and
      //                          share-page PDF previews
      //   /app                   the composer's mic (`microphone=(self)`)
      //   everything else        strict DENY / frame-ancestors 'none', mic closed
      { source: "/api/attachments/:path*", headers: attachmentHeaders },
      { source: "/api/files/:path*", headers: attachmentHeaders },
      { source: "/api/share/:path*", headers: attachmentHeaders },
      { source: "/app", headers: appHeaders },
      { source: "/app/:path*", headers: appHeaders },
      {
        source: "/((?!api/attachments|api/files|api/share|app$|app/).*)",
        headers: securityHeaders,
      },
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

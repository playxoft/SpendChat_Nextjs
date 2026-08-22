import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { AuthBridge } from "@/components/auth-bridge";
import { ogImage } from "@/lib/seo";
import { siteConfig } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${siteConfig.name} — ${siteConfig.tagline}`,
    template: `%s — ${siteConfig.name}`,
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  // No `keywords` here on purpose — see `siteConfig.topics`.
  authors: [{ name: siteConfig.author }],
  creator: siteConfig.author,
  alternates: { canonical: "/" },
  // The landing page's own preview, and the fallback for any page that doesn't
  // build its metadata with `createMetadata` (see src/lib/seo.ts). Next replaces
  // — never deep-merges — `openGraph` per segment, so a page defining its own
  // must restate `images`; `createMetadata` does that for you.
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteConfig.url,
    siteName: siteConfig.name,
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
    images: [ogImage],
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
    images: [ogImage],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  // Google Search Console ownership proof. Set NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
  // in Doppler and rebuild — NEXT_PUBLIC_* values are inlined at build time, so the
  // token is never committed. Left out entirely when unset (an empty tag fails
  // verification). Verifying by DNS TXT record instead needs no code at all.
  ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    ? { verification: { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION } }
    : {}),
  // Icons are set via the file conventions in `app/`: `icon.svg` (the SpendChat
  // mark, preferred by modern browsers) and `favicon.ico` (legacy fallback).
  // Tell the Dark Reader extension to leave this page alone — the app manages
  // its own light/dark theme, and extension overrides break our color tokens.
  // The content must be non-empty: Next drops `other` meta tags whose value is
  // an empty string, and Dark Reader's lock is presence-only (content ignored).
  other: { "darkreader-lock": "darkreader-lock" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
          <Toaster richColors position="top-right" />
          <AuthBridge />
        </ThemeProvider>
      </body>
    </html>
  );
}

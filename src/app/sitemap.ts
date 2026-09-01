import type { MetadataRoute } from "next";
import { getPosts } from "@/lib/blog";
import { featurePath, publishedFeatures } from "@/lib/features";
import { siteConfig } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes: { path: string; priority: number; freq: "weekly" | "monthly" }[] = [
    { path: "", priority: 1, freq: "weekly" },
    { path: "/features", priority: 0.8, freq: "monthly" },
    { path: "/pricing", priority: 0.7, freq: "monthly" },
    { path: "/blog", priority: 0.7, freq: "weekly" },
    { path: "/docs", priority: 0.7, freq: "monthly" },
    { path: "/about", priority: 0.6, freq: "monthly" },
    { path: "/faq", priority: 0.7, freq: "monthly" },
    { path: "/privacy", priority: 0.3, freq: "monthly" },
    { path: "/terms", priority: 0.3, freq: "monthly" },
    { path: "/cookie-policy", priority: 0.3, freq: "monthly" },
  ];

  const staticEntries: MetadataRoute.Sitemap = routes.map((r) => ({
    url: `${siteConfig.url}${r.path}`,
    lastModified: now,
    changeFrequency: r.freq,
    priority: r.priority,
  }));

  // Feature pages come from the registry rather than being listed by hand, so a
  // new page can't be forgotten here — being absent from the sitemap is the
  // quiet way a page never gets crawled. `publishedFeatures()` filters out
  // entries whose page doesn't exist yet; submitting those would just earn
  // "Submitted URL not found (404)" in Search Console.
  const featureEntries: MetadataRoute.Sitemap = publishedFeatures().map((feature) => ({
    url: `${siteConfig.url}${featurePath(feature.slug)}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  // Each post carries its own last-modified date so search engines see real freshness.
  const postEntries: MetadataRoute.Sitemap = getPosts().map((post) => ({
    url: `${siteConfig.url}/blog/${post.slug}`,
    lastModified: new Date(`${post.updated ?? post.date}T00:00:00`),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [...staticEntries, ...featureEntries, ...postEntries];
}

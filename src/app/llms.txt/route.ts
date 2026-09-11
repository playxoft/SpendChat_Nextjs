import { getPosts } from "@/lib/blog";
import { COMPARISONS } from "@/lib/compare";
import { docsSections } from "@/lib/docs";
import { faqs } from "@/lib/faq";
import { FEATURES } from "@/lib/features";
import { buildLlmsTxt } from "@/lib/llms-txt";

/**
 * `GET /llms.txt` — see `lib/llms-txt.ts` for what it contains and why. Built
 * at deploy time from the same registries as the sitemap, so it's served as a
 * static asset and can never describe a page that doesn't exist.
 */
export const dynamic = "force-static";

export function GET(): Response {
  const body = buildLlmsTxt({
    features: FEATURES,
    comparisons: COMPARISONS,
    posts: getPosts().map((p) => ({
      slug: p.slug,
      title: p.title,
      date: p.date,
      excerpt: p.excerpt,
    })),
    faqs,
    docs: docsSections,
  });
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}

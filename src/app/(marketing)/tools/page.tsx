import { JsonLd } from "@/components/json-ld";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { ToolsDirectory } from "@/components/tools/tools-directory";
import { breadcrumbJsonLd, createMetadata } from "@/lib/seo";
import { siteConfig } from "@/lib/site";
import { TOOL_GROUPS, publishedTools, toolPath, toolsInGroup } from "@/lib/tools";

export const metadata = createMetadata({
  title: "Free Money Tools & Calculators",
  description:
    "Free calculators for everyday money: percentages, VAT and GST, interest, SIP, credit card payoff, dates, invoices and more. No signup, no ads.",
  path: "/tools",
});

const trail = [
  { name: "Home", path: "/" },
  { name: "Free tools", path: "/tools" },
];

export default function ToolsHubPage() {
  const tools = publishedTools();
  const groups = TOOL_GROUPS.map((g) => ({ ...g, items: toolsInGroup(g.id) })).filter(
    (g) => g.items.length > 0,
  );

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-8 sm:pt-12">
      <JsonLd data={breadcrumbJsonLd(trail)} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "Free money tools",
          itemListElement: tools.map((t, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: t.h1,
            url: `${siteConfig.url}${toolPath(t.slug)}`,
          })),
        }}
      />

      <Breadcrumbs trail={trail} />

      <header className="max-w-3xl">
        <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          Free money tools
        </h1>
        <p className="mt-3 text-pretty text-lg leading-relaxed text-muted-foreground">
          Quick calculators for the money questions that come up every day. They
          run in your browser, answer as you type, and never ask you to sign up.
        </p>
      </header>

      <ToolsDirectory groups={groups} />
    </div>
  );
}

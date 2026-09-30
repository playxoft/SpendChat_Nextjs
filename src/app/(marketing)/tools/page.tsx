import { JsonLd } from "@/components/json-ld";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { toolPreviews } from "@/components/tools/tool-previews";
import { ToolsDirectory } from "@/components/tools/tools-directory";
import { breadcrumbJsonLd, createMetadata } from "@/lib/seo";
import { siteConfig } from "@/lib/site";
import { TOOL_GROUPS, publishedTools, toolOgImage, toolPath, toolsInGroup } from "@/lib/tools";

export const metadata = createMetadata({
  title: "Free Financial Calculators & Money Tools",
  description:
    `Free money tools, no sign-up: invoice maker, EMI & loan, GST & VAT, SIP, FD, inflation, currency converter, FIRE and more — ${publishedTools().length} calculators in all.`,
  path: "/tools",
  image: toolOgImage("index"),
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
          name: "Free financial calculators & money tools",
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
          Free financial calculators &amp; money tools
        </h1>
        <p className="mt-3 text-pretty text-lg leading-relaxed text-muted-foreground">
          Invoices and quotations, EMI and loans, GST and VAT, SIP and FDs,
          inflation, currencies, FIRE and more — {tools.length} calculators for
          the money questions that come up every day. They run in your browser,
          answer as you type, and never ask you to sign up.
        </p>
      </header>

      <ToolsDirectory groups={groups} previews={toolPreviews(tools.map((t) => t.slug))} />
    </div>
  );
}

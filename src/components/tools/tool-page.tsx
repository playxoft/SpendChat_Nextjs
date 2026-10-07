import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JsonLd } from "@/components/json-ld";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { FaqSection } from "@/components/marketing/faq-section";
import { ToolCardGrid } from "@/components/tools/tool-card";
import { toolPreviews } from "@/components/tools/tool-previews";
import { ToolCta } from "@/components/tools/result";
import { getTool, relatedTools, toolPath } from "@/lib/tools";
import { breadcrumbJsonLd, faqJsonLd, webApplicationJsonLd, type Faq } from "@/lib/seo";
import { marketingCta } from "@/lib/marketing";
import { cn } from "@/lib/utils";

/**
 * The shared skeleton every `/tools/<slug>` page is built on.
 *
 * Tool first: a one-line header, then the calculator above the fold — the
 * visitor came from a search for "percentage calculator", not to read about
 * one. The explanation, formula, FAQ and related tools sit underneath, where
 * they do their other job: they're the indexable text that lets the page rank,
 * and the internal links that keep the cluster crawlable.
 *
 * SEO requirements are structural here, as on `FeaturePage`: breadcrumbs and
 * their `BreadcrumbList`, the FAQ and its `FAQPage` (from one array), the
 * `WebApplication` markup, and the related-tool links all come with the shell.
 */
export function ToolPage({
  slug,
  intro,
  faqs,
  category,
  tool,
  cta,
  ctaHref,
  saves = false,
  children,
}: {
  /** Must match an entry in `src/lib/tools.ts`. */
  slug: string;
  /**
   * The one SpendChat line, tied to what the visitor just did ("Counting the
   * days to payday?"). Rendered once, full width under the whole tool — never
   * inside the result panel, where it competed with the answer.
   */
  cta: string;
  /** Where that line signs people up to, when the tool's work carries into the app. */
  ctaHref?: string;
  /**
   * The tool can send what you typed to SpendChat when you ask it to (save to
   * an account) — the privacy line then says "until you choose to save it".
   */
  saves?: boolean;
  /** One or two sentences under the h1 — what it does, in plain words. */
  intro: ReactNode;
  /** Rendered visibly *and* as `FAQPage` markup, from this one array. */
  faqs: Faq[];
  /** schema.org `applicationCategory`; defaults to `FinanceApplication`. */
  category?: "FinanceApplication" | "BusinessApplication" | "UtilitiesApplication";
  /** The interactive calculator (a client component). */
  tool: ReactNode;
  /** The explainer sections under the tool — use `ToolSection`. */
  children: ReactNode;
}) {
  const entry = getTool(slug);
  if (!entry) {
    throw new Error(`ToolPage: "${slug}" is not in src/lib/tools.ts.`);
  }

  const path = toolPath(slug);
  const related = relatedTools(slug, 4);
  const trail = [
    { name: "Home", path: "/" },
    { name: "Free tools", path: "/tools" },
    { name: entry.label, path },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-8 sm:pt-12">
      <JsonLd data={breadcrumbJsonLd(trail)} />
      <JsonLd
        data={webApplicationJsonLd({
          name: entry.h1,
          description: entry.description,
          path,
          category,
        })}
      />
      {faqs.length > 0 && <JsonLd data={faqJsonLd(faqs)} />}

      <Breadcrumbs trail={trail} />

      <header className="max-w-3xl">
        <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          {entry.h1}
        </h1>
        <div className="mt-3 text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
          {intro}
        </div>
      </header>

      {/* Masked from session replay (Clarity): what people type into a tool
          — and the invoice it builds — never goes into a recording. */}
      <div className="mt-8" data-clarity-mask="true">
        {tool}
      </div>

      <ToolCta slug={slug} message={cta} href={ctaHref} className="mt-4" />

      <p className="mt-4 text-xs text-muted-foreground">
        Runs in your browser — what you type isn&apos;t sent to our servers
        {saves ? " until you choose to save it" : ""}, and never goes into analytics.
        Results are estimates for planning, not financial advice.
      </p>

      <div className="mx-auto mt-16 max-w-3xl space-y-12">{children}</div>

      <div className="mx-auto max-w-3xl">
        <FaqSection faqs={faqs} heading={`${entry.label} FAQ`} />

        {related.length > 0 && (
          <section className="mt-16">
            <h2 className="text-2xl font-semibold tracking-tight">More free tools</h2>
            <ToolCardGrid
              items={related}
              previews={toolPreviews(related.map((t) => t.slug))}
              location={`${slug}_related`}
              columns={2}
              className="mt-6"
            />
            <Link
              href="/tools"
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium hover:underline"
            >
              All free tools <ArrowRight className="size-3.5" />
            </Link>
          </section>
        )}

        <div className="mt-16 overflow-hidden rounded-3xl border bg-card px-6 py-12 text-center">
          <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
            Know where your money goes
          </h2>
          <p className="mx-auto mt-3 max-w-md text-muted-foreground">
            SpendChat is a free money tracker you use like a chat: type what you
            spent, and it adds up your month. No bank login.
          </p>
          <Button asChild className={`mt-8 ${marketingCta}`}>
            <Link
              href="/sign-up"
              data-track-event="cta_click"
              data-track-params={JSON.stringify({
                location: `tool_${slug}_footer`,
                label: "create_free_account",
              })}
            >
              Start tracking free <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

/** An explainer section under the tool: one `<h2>` and its prose. */
export function ToolSection({
  title,
  id,
  children,
}: {
  title: string;
  /** Anchor, so a section (e.g. one calculator mode) can be linked to directly. */
  id?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-4 space-y-4 leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

/** A formula or worked calculation, set apart from the prose. */
export function Formula({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "overflow-x-auto rounded-xl border bg-muted/40 px-4 py-3 font-mono text-sm text-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}

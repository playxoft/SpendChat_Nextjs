import { createMetadata } from "@/lib/seo";
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GithubIcon } from "@/components/icons/github";
import { siteConfig } from "@/lib/site";
import { marketingCta } from "@/lib/marketing";
import { docsSections } from "@/lib/docs";

export const metadata = createMetadata({
  title: "Docs",
  description:
    "Documentation for SpendChat — getting started, adding transactions, categories, bulk import, filtering, exporting, keyboard shortcuts, privacy, and self-hosting the open-source app.",
  path: "/docs",
});

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-10 sm:pt-16">
      {/* Header */}
      <div className="max-w-2xl">
        <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-muted-foreground">
          <BookOpen className="size-3.5" /> Documentation
        </span>
        <h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          Everything you need to know
        </h1>
        <p className="mt-4 text-pretty text-lg text-muted-foreground">
          A practical guide to using {siteConfig.name} — from your first transaction
          to exporting, shortcuts, and self-hosting the open-source app.
        </p>
      </div>

      <div className="mt-12 gap-10 lg:grid lg:grid-cols-[220px_1fr]">
        {/* Table of contents */}
        <aside className="hidden lg:block">
          <nav className="sticky top-24 space-y-1 border-l pl-4 text-sm">
            <p className="mb-3 -ml-4 pl-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              On this page
            </p>
            {docsSections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="block py-1 text-muted-foreground transition-colors hover:text-foreground"
              >
                {s.title}
              </a>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <div className="min-w-0 space-y-12">
          {docsSections.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-24">
              <h2 className="text-2xl font-semibold tracking-tight">{s.title}</h2>
              <div className="mt-4 space-y-4">
                {s.blocks.map((b, i) => {
                  if (b.kind === "p") {
                    return (
                      <p key={i} className="leading-relaxed text-muted-foreground">
                        {b.text}
                      </p>
                    );
                  }
                  if (b.kind === "ul") {
                    return (
                      <ul
                        key={i}
                        className="list-inside list-disc space-y-2 text-muted-foreground"
                      >
                        {b.items.map((it) => (
                          <li key={it}>{it}</li>
                        ))}
                      </ul>
                    );
                  }
                  return (
                    <ol key={i} className="space-y-3">
                      {b.items.map((it, idx) => (
                        <li key={it} className="flex gap-3 text-muted-foreground">
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">
                            {idx + 1}
                          </span>
                          <span className="leading-relaxed">{it}</span>
                        </li>
                      ))}
                    </ol>
                  );
                })}
              </div>
            </section>
          ))}

          {/* CTA */}
          <div className="rounded-3xl border bg-card p-7 text-center">
            <h2 className="text-xl font-semibold tracking-tight">
              Ready to start tracking?
            </h2>
            <p className="mt-2 text-muted-foreground">
              Create a free account, or dive into the source on GitHub.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button asChild className={marketingCta}>
                <Link href="/sign-up">
                  Get started <ArrowRight />
                </Link>
              </Button>
              <Button asChild variant="outline" className={marketingCta}>
                <a href={siteConfig.links.github} target="_blank" rel="noreferrer">
                  <GithubIcon /> View source
                </a>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

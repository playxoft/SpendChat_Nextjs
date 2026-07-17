import { createMetadata } from "@/lib/seo";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JsonLd } from "@/components/json-ld";
import { faqs } from "@/lib/faq";
import { marketingCta } from "@/lib/marketing";

export const metadata = createMetadata({
  title: "FAQ",
  description:
    "Answers to common questions about SpendChat — pricing, adding and bulk-importing transactions, exporting and printing, currencies, and privacy.",
  path: "/faq",
});

export default function FaqPage() {
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <JsonLd data={faqJsonLd} />
      <div className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight">
          Frequently asked questions
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Everything you might want to know before getting started.
        </p>
      </div>

      <div className="mt-12 space-y-3">
        {faqs.map((f) => (
          <details
            key={f.q}
            className="group rounded-xl border bg-card px-5 py-4 [&_summary::-webkit-details-marker]:hidden"
          >
            <summary className="flex cursor-pointer items-center justify-between gap-4 font-medium">
              {f.q}
              <Plus className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-45" />
            </summary>
            <p className="mt-3 text-sm text-muted-foreground">{f.a}</p>
          </details>
        ))}
      </div>

      <div className="mt-12 text-center">
        <p className="text-muted-foreground">Still have questions?</p>
        <Button asChild variant="outline" className={`mt-4 ${marketingCta}`}>
          <Link href="/sign-up">Just try it — it&apos;s free</Link>
        </Button>
      </div>
    </div>
  );
}

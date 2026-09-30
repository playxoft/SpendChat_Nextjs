import { createMetadata, faqJsonLd } from "@/lib/seo";
import Link from "next/link";
import { FaqSection } from "@/components/marketing/faq-section";
import { Button } from "@/components/ui/button";
import { JsonLd } from "@/components/json-ld";
import { faqs } from "@/lib/faq";
import { marketingCta } from "@/lib/marketing";
import { siteConfig } from "@/lib/site";

export const metadata = createMetadata({
  title: "FAQ",
  description:
    "Answers to common questions about SpendChat — pricing, adding and bulk-importing transactions, exporting and printing, currencies, and privacy.",
  path: "/faq",
});

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      {/* The markup and the visible list come from the same array, so an answer
          can never be marked up without being on the page. */}
      <JsonLd data={faqJsonLd(faqs)} />
      <div className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight">
          Frequently asked questions
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Everything you might want to know before getting started.
        </p>
      </div>

      <FaqSection faqs={faqs} className="mt-12" />

      <div className="mt-12 text-center">
        <p className="text-muted-foreground">
          Still have questions? Email us at{" "}
          <a
            href={`mailto:${siteConfig.supportEmail}`}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {siteConfig.supportEmail}
          </a>
          .
        </p>
        <Button asChild variant="outline" className={`mt-4 ${marketingCta}`}>
          <Link href="/sign-up">Just try it — it&apos;s free</Link>
        </Button>
      </div>
    </div>
  );
}

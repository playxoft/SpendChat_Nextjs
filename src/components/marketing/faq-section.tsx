import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import type { Faq } from "@/lib/seo";

/**
 * The visible half of a page's FAQ — the accordion that `faqJsonLd()` marks up.
 *
 * Feature pages and blog posts render the same block from the same array, so it
 * lives here rather than in either of them. That matters beyond tidiness: the
 * structured data is only honest while the visible answers and the marked-up
 * ones come from one source, and two hand-maintained copies of the markup is
 * how the two drift.
 *
 * `AccordionContent` keeps its answer mounted while collapsed, which is what
 * puts the text in the server-rendered HTML that crawlers read — a panel that
 * only renders on click would leave `FAQPage` describing text that isn't there.
 */
export function FaqSection({
  faqs,
  heading,
  className,
}: {
  faqs: Faq[];
  heading: string;
  className?: string;
}) {
  if (faqs.length === 0) return null;

  return (
    <section className={cn("mt-16", className)}>
      <h2 className="text-2xl font-semibold tracking-tight">{heading}</h2>
      <Accordion type="multiple" className="mt-6 border-t">
        {faqs.map((faq, i) => (
          // Keyed by position, not by the question text. Two entries can
          // legitimately ask the same thing under different headings, and a
          // duplicated `value` makes Radix open both panels from one click
          // while React reuses the wrong subtree — a failure that shows up as
          // "the accordion is haunted" long after the copy edit that caused it.
          <AccordionItem key={i} value={`faq-${i}`}>
            <AccordionTrigger>{faq.q}</AccordionTrigger>
            <AccordionContent className="leading-relaxed text-muted-foreground">
              {faq.a}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}

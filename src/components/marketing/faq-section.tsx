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
 * Every FAQ on the site — the homepage, `/faq`, feature, comparison, tool and
 * blog pages — renders this one block, so they look and behave the same, and
 * each renders it from the same array as its markup. That matters beyond tidiness: the
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
  answerClassName,
}: {
  faqs: Faq[];
  /** The section's `<h2>`. Leave it out where the page's own `<h1>` already names the list (`/faq`). */
  heading?: string;
  className?: string;
  /** Extra classes for each answer — e.g. a larger size on a page where the answers carry the detail. */
  answerClassName?: string;
}) {
  if (faqs.length === 0) return null;

  return (
    // One FAQ look across the site: a tinted panel that sets the questions
    // apart from the prose around them, with the same accordion inside.
    <section className={cn("mt-16 rounded-3xl border bg-muted/40 px-5 py-8 sm:px-8 sm:py-10", className)}>
      {heading && <h2 className="text-2xl font-semibold tracking-tight">{heading}</h2>}
      <Accordion type="multiple" className={cn("border-t", heading && "mt-6")}>
        {faqs.map((faq, i) => (
          // Keyed by position, not by the question text. Two entries can
          // legitimately ask the same thing under different headings, and a
          // duplicated `value` makes Radix open both panels from one click
          // while React reuses the wrong subtree — a failure that shows up as
          // "the accordion is haunted" long after the copy edit that caused it.
          <AccordionItem key={i} value={`faq-${i}`}>
            <AccordionTrigger>{faq.q}</AccordionTrigger>
            <AccordionContent className={cn("leading-relaxed text-muted-foreground", answerClassName)}>
              {faq.a}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}

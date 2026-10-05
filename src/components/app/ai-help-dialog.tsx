"use client";

import { Info, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * The "i" help for AI entry — a dialog explaining the free-text syntax
 * (/category, #tag, (description), income words, dates) with worked examples and
 * their output. Pure
 * instructional content; the `symbol` just makes the example amounts feel local.
 */
export function AiHelpDialog({ symbol = "$" }: { symbol?: string }) {
  const rules: { k: string; d: string }[] = [
    { k: "200 fruits", d: "Amount first, then what it was for." },
    { k: "Ravi lunch A2B", d: "Your words become the title as you typed them — names, shops and apps stay." },
    { k: "a, b, c", d: "Commas separate items — each becomes its own transaction." },
    { k: "salary, got", d: "Income words (salary, got, refund, sold) mark money in." },
    { k: "/Food", d: "Pick a category. Matched to your existing ones — never creates new." },
    { k: "#travel", d: "Tag it. Matched to your existing tags — and tags that fit are added for you, so check the review." },
    { k: "(June bill)", d: "Text in parentheses becomes the description." },
    { k: "yesterday", d: "Plain dates set the day; otherwise today is used." },
  ];
  const examples: { in: string; out: string[] }[] = [
    {
      in: "200 fruits, 100 veg, 1000 electricity",
      out: [`Fruits — ${symbol}200`, `Veg — ${symbol}100`, `Electricity — ${symbol}1,000`],
    },
    {
      in: "Ravi dinner A2B Swiggy 254",
      out: [`Ravi dinner A2B Swiggy — ${symbol}254`],
    },
    {
      in: "got 50000 salary, 1200 electricity (June bill) /Bills",
      out: [
        `Salary — +${symbol}50,000 · income`,
        `Electricity — ${symbol}1,200 · /Bills · “June bill”`,
      ],
    },
    {
      in: "500 groceries /Food #weekly yesterday",
      out: [`Groceries — ${symbol}500 · /Food · #weekly · dated yesterday`],
    },
  ];

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="How AI entry works">
          <Info className="size-4" />
        </Button>
      </DialogTrigger>
      {/* Reference text, not a form: nothing here can be lost, so a click
          outside dismisses it like any other hint (dialogs opt into that).
          The content box itself never scrolls — only the body below the header
          does — so the title and the ✕ (absolutely placed in the content box)
          stay put however far down the examples you are. */}
      <DialogContent
        closeOnOutsideClick
        className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        <DialogHeader className="shrink-0 border-b px-4 pt-4 pb-3 pr-12">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-violet-600" /> How AI entry works
          </DialogTitle>
          <DialogDescription>
            Type what you spent or earned in plain words. AI splits it into
            transactions you review and edit before anything is saved.
          </DialogDescription>
        </DialogHeader>

        <div className="scrollbar-slim min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 text-sm">
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Syntax
            </h3>
            <dl className="space-y-1.5">
              {rules.map((r) => (
                <div key={r.k} className="flex gap-3">
                  <dt className="w-28 shrink-0 font-mono text-xs leading-5 text-foreground sm:w-32">
                    {r.k}
                  </dt>
                  <dd className="min-w-0 leading-5 text-muted-foreground">{r.d}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Examples
            </h3>
            {examples.map((ex) => (
              <div key={ex.in} className="rounded-lg border bg-muted/30 p-3">
                <p className="font-mono text-xs text-foreground">{ex.in}</p>
                <ul className="mt-2 space-y-1">
                  {ex.out.map((o, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-muted-foreground">
                      <span aria-hidden className="text-violet-600">
                        →
                      </span>
                      <span className="min-w-0">{o}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

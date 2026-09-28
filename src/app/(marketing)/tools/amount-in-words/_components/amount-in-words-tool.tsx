"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CurrencyField, NumberField, Segmented } from "@/components/tools/fields";
import {
  ResultActions,
  ResultEmpty,
  ResultHero,
  ToolCta,
  ToolLayout,
  ToolPanel,
} from "@/components/tools/result";
import { useToolCurrency, useToolLocale, useUrlState } from "@/components/tools/tool-state";
import { parseNumber } from "@/lib/tools/format";
import {
  MAX_AMOUNT_IN_WORDS,
  amountParts,
  applyLetterCase,
  checkWordsFraction,
  chequeWordsOnly,
  defaultNumberingSystem,
  formatGrouped,
  partsInWords,
  type AmountParts,
  type LetterCase,
  type NumberingSystem,
} from "@/lib/tools/number-words";

// `sys` stays empty until the visitor picks a system, so the default can
// follow the currency (rupees → lakh/crore) without overriding a choice.
const DEFAULTS = { amt: "120000.50", sys: "", case: "sentence" };

const SYSTEMS = [
  { value: "indian", label: "Indian (lakh, crore)" },
  { value: "international", label: "International (million)" },
] as const;

const CASES = [
  { value: "sentence", label: "Sentence" },
  { value: "title", label: "Title Case" },
  { value: "upper", label: "UPPERCASE" },
] as const;

export function AmountInWordsTool() {
  const [s, set, reset] = useUrlState(DEFAULTS);
  const [currency] = useToolCurrency();
  const locale = useToolLocale();

  const system: NumberingSystem =
    s.sys === "indian" || s.sys === "international" ? s.sys : defaultNumberingSystem(currency);
  const letterCase: LetterCase = s.case === "title" || s.case === "upper" ? s.case : "sentence";

  const amount = parseNumber(s.amt, locale);
  let parts: AmountParts | null = null;
  let problem: string | null = null;
  if (amount === null) {
    problem = s.amt.trim() ? "That doesn't look like a number." : "Type an amount to see it in words.";
  } else if (Math.abs(amount) > MAX_AMOUNT_IN_WORDS) {
    problem = "That's more than 999 trillion — too large to write out in words.";
  } else {
    parts = amountParts(amount, currency);
  }

  const cased = (text: string | null, as: LetterCase = letterCase) =>
    text ? applyLetterCase(text, as) : null;
  const words = parts ? cased(partsInWords(parts, currency, system)) : null;
  const cheque = parts ? cased(chequeWordsOnly(parts, currency, system)) : null;
  // A US check line is sentence case by convention; only UPPERCASE overrides it.
  const check = parts
    ? cased(checkWordsFraction(parts, currency, system), letterCase === "upper" ? "upper" : "sentence")
    : null;

  return (
    <ToolLayout>
      <ToolPanel className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)]">
          <NumberField
            label="Amount"
            value={s.amt}
            onChange={(v) => set({ amt: v })}
            error={parts === null && amount !== null ? problem : null}
          />
          <CurrencyField />
        </div>
        <Segmented
          label="Numbering"
          value={system}
          onChange={(v) => set({ sys: v })}
          options={SYSTEMS}
        />
        <Segmented
          label="Letter case"
          value={letterCase}
          onChange={(v) => set({ case: v })}
          options={CASES}
        />
      </ToolPanel>

      <ToolPanel sticky className="space-y-5">
        {parts && words ? (
          <>
            <ResultHero
              label="In words"
              value={<span className="text-2xl leading-snug sm:text-3xl">{words}</span>}
            />
            <dl className="divide-y border-y text-sm">
              {cheque && <LineRow label="Cheque (India, UK)" text={cheque} />}
              {check && <LineRow label="Check (US)" text={check} />}
              <div className="grid gap-1 py-3">
                <dt className="text-muted-foreground">In figures</dt>
                <dd className="flex flex-wrap gap-x-4 gap-y-1 tabular-nums">
                  <span>
                    {formatGrouped(parts, "indian")}{" "}
                    <span className="text-muted-foreground">(Indian)</span>
                  </span>
                  <span>
                    {formatGrouped(parts, "international")}{" "}
                    <span className="text-muted-foreground">(international)</span>
                  </span>
                </dd>
              </div>
            </dl>
            {parts.rounded && (
              <p className="text-xs text-muted-foreground">
                Rounded to {parts.decimals === 0 ? "a whole number" : `${parts.decimals} decimal places`}, as{" "}
                {currency} is written.
              </p>
            )}
            <ResultActions copy={words} onReset={reset} />
            <ToolCta slug="amount-in-words" message="Writing out amounts for bills and invoices?" />
          </>
        ) : (
          <ResultEmpty>{problem}</ResultEmpty>
        )}
      </ToolPanel>
    </ToolLayout>
  );
}

/** One cheque-style line with its own copy button. */
function LineRow({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0">
        <dt className="text-muted-foreground">{label}</dt>
        <dd className="mt-1 break-words text-foreground">{text}</dd>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-9 shrink-0 text-muted-foreground"
        aria-label={`Copy the ${label} line`}
        onClick={() =>
          navigator.clipboard.writeText(text).then(
            () => toast.success("Copied"),
            () => toast.error("Couldn't copy — your browser blocked clipboard access."),
          )
        }
      >
        <Copy />
      </Button>
    </div>
  );
}

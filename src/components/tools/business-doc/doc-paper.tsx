import type { ReactNode } from "react";
import { siteConfig } from "@/lib/site";
import { isSupportedCurrency } from "@/lib/currencies";
import { formatMoney } from "@/lib/money";
import { toolPath } from "@/lib/tools";
import { formatDate } from "@/lib/tools/date-math";
import { EMPTY, formatNumber } from "@/lib/tools/format";
import type { BusinessDoc, DocEvaluation } from "@/lib/tools/invoice";
import { applyLetterCase, defaultNumberingSystem, minorAmountInWords } from "@/lib/tools/number-words";
import type { DocLabels } from "./labels";

/**
 * The document itself — what the preview shows and exactly what prints.
 *
 * It's a sheet of paper, not a themed surface: black on white in dark mode
 * too, because that's what the client receives. Every size is in `em` off one
 * base font size, so the whole page scales with the preview column (the base
 * is set from the container width) and prints at a fixed 10pt (see the print
 * stylesheet in `business-doc-tool.tsx`). On screen the sheet keeps A4's
 * 210 × 297 proportions and simply grows when the items run past one page.
 *
 * Empty fields show a faint prompt ("Your business name") that is
 * `visibility: hidden` in print, so an unfinished field never prints as
 * placeholder text.
 */
export function DocPaper({
  doc,
  labels,
  evaluation,
  dates,
  currency,
  locale,
}: {
  doc: BusinessDoc;
  labels: DocLabels;
  evaluation: DocEvaluation;
  dates: { issue: string | null; due: string | null };
  currency: string;
  locale: string;
}) {
  const code = isSupportedCurrency(currency) ? currency : "USD";
  const money = (minor: number) => formatMoney(minor, code, locale);
  const { totals } = evaluation;

  const rows = doc.items
    .map((item, i) => ({ item, result: evaluation.items[i]! }))
    .filter(({ result }) => !result.blank);

  const due =
    doc.kind === "invoice" && doc.dueDays === 0
      ? "On receipt"
      : dates.due
        ? formatDate(dates.due, locale, "plain")
        : EMPTY;

  const taxName = doc.taxLabel.trim() || "Tax";
  const words = totals ? amountWords(totals.total, code) : null;
  const showSubtotal = totals !== null && (totals.discount > 0 || evaluation.taxRate > 0);

  return (
    <article
      aria-label={`${labels.title} preview`}
      className="bd-paper flex aspect-[210/297] flex-col rounded-[0.25em] bg-white p-[1.6em] leading-[1.45] text-neutral-900 shadow-sm ring-1 ring-black/10 @md:p-[3.2em]"
      // 10pt on an A4-wide sheet is 1.68% of its width; a touch larger reads
      // better on screen, and the floor keeps a phone preview legible.
      style={{ fontSize: "clamp(10px, 1.9cqi, 13.5px)" }}
    >
      {/* Container queries (`@md:`) give a phone-width preview tighter margins
          and a stacked header; the printed A4 page is always wider than that. */}
      {/* Seller and document details */}
      <header className="flex flex-col gap-[1.2em] @md:flex-row @md:items-start @md:justify-between @md:gap-[2em]">
        <div className="min-w-0 [overflow-wrap:anywhere]">
          {doc.logo && (
            // A data URL the visitor picked — next/image has nothing to optimise.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={doc.logo}
              alt={doc.from.name ? `${doc.from.name} logo` : "Logo"}
              className="mb-[1em] max-h-[4.5em] max-w-[12em] object-contain object-left"
            />
          )}
          <p className="text-[1.2em] font-semibold leading-tight">
            {doc.from.name || <Placeholder>Your business name</Placeholder>}
          </p>
          <div className="mt-[0.4em] space-y-[0.1em] text-neutral-600">
            {doc.from.address && <p className="whitespace-pre-line">{doc.from.address}</p>}
            {doc.from.contact && <p>{doc.from.contact}</p>}
            {doc.from.taxId && <p>Tax ID: {doc.from.taxId}</p>}
          </div>
        </div>

        <div className="shrink-0 @md:text-right">
          <p className="text-[2em] font-semibold uppercase leading-none tracking-[0.06em]">{labels.title}</p>
          <dl className="mt-[1em] grid grid-cols-[auto_auto] justify-start gap-x-[1em] @md:justify-end gap-y-[0.15em] text-[0.9em]">
            <dt className="text-neutral-500">{labels.numberShort}</dt>
            <dd className="font-medium [overflow-wrap:anywhere]">
              {doc.number || <Placeholder>{EMPTY}</Placeholder>}
            </dd>
            <dt className="text-neutral-500">{labels.issue}</dt>
            <dd className="tabular-nums">{dates.issue ? formatDate(dates.issue, locale, "plain") : EMPTY}</dd>
            <dt className="text-neutral-500">{labels.due}</dt>
            <dd className="tabular-nums">{due}</dd>
          </dl>
        </div>
      </header>

      {/* Client */}
      <section className="mt-[2.2em] [overflow-wrap:anywhere] @md:max-w-[60%]">
        <p className="text-[0.75em] font-semibold uppercase tracking-[0.08em] text-neutral-500">{labels.to}</p>
        <p className="mt-[0.3em] font-medium">{doc.to.name || <Placeholder>Client name</Placeholder>}</p>
        <div className="space-y-[0.1em] text-neutral-600">
          {doc.to.address && <p className="whitespace-pre-line">{doc.to.address}</p>}
          {doc.to.email && <p>{doc.to.email}</p>}
        </div>
      </section>

      {/* Items */}
      <table className="mt-[2em] w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-neutral-300 text-[0.75em] uppercase tracking-[0.06em] text-neutral-500">
            <th scope="col" className="py-[0.6em] pr-[1em] font-semibold">
              Description
            </th>
            <th scope="col" className="px-[0.8em] py-[0.6em] text-right font-semibold">
              Qty
            </th>
            <th scope="col" className="px-[0.8em] py-[0.6em] text-right font-semibold">
              Unit price
            </th>
            <th scope="col" className="py-[0.6em] pl-[0.8em] text-right font-semibold">
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr className="border-b border-neutral-200">
              <td className="py-[0.7em] pr-[1em]">
                <Placeholder>Item description</Placeholder>
              </td>
              <td className="px-[0.8em] py-[0.7em] text-right">
                <Placeholder>1</Placeholder>
              </td>
              <td className="px-[0.8em] py-[0.7em] text-right">
                <Placeholder>{money(0)}</Placeholder>
              </td>
              <td className="py-[0.7em] pl-[0.8em] text-right">
                <Placeholder>{money(0)}</Placeholder>
              </td>
            </tr>
          ) : (
            rows.map(({ item, result }) => (
              <tr key={item.id} className="border-b border-neutral-200 align-top">
                <td className="py-[0.7em] pr-[1em] whitespace-pre-line [overflow-wrap:anywhere]">
                  {item.description || <Placeholder>Item description</Placeholder>}
                </td>
                <td className="px-[0.8em] py-[0.7em] text-right whitespace-nowrap tabular-nums">
                  {result.qty === null ? EMPTY : formatNumber(result.qty, locale, 4)}
                </td>
                <td className="px-[0.8em] py-[0.7em] text-right whitespace-nowrap tabular-nums">
                  {result.unitMinor === null ? EMPTY : money(result.unitMinor)}
                </td>
                <td className="py-[0.7em] pl-[0.8em] text-right whitespace-nowrap tabular-nums">
                  {result.amountMinor === null ? EMPTY : money(result.amountMinor)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* Totals */}
      <div className="bd-keep mt-[1em] ml-auto w-full max-w-[20em]">
        {totals === null ? (
          <p className="text-right text-neutral-600">These amounts are too large to total exactly.</p>
        ) : (
          <>
            <dl className="text-[0.95em]">
              {showSubtotal && <TotalRow label="Subtotal" value={money(totals.subtotal)} />}
              {totals.discount > 0 && (
                <TotalRow
                  label={
                    evaluation.discountPercent !== null
                      ? `Discount (${formatNumber(evaluation.discountPercent, locale, 4)}%)`
                      : "Discount"
                  }
                  value={`−${money(totals.discount)}`}
                />
              )}
              {evaluation.taxRate > 0 && (
                <TotalRow
                  label={`${taxName} (${formatNumber(evaluation.taxRate, locale, 4)}%)`}
                  value={money(totals.tax)}
                />
              )}
            </dl>
            <div className="mt-[0.4em] flex items-baseline justify-between gap-[1em] border-t-2 border-neutral-900 pt-[0.5em] text-[1.3em] font-semibold">
              <span>Total</span>
              <span className="tabular-nums whitespace-nowrap">{money(totals.total)}</span>
            </div>
          </>
        )}
      </div>
      {words && (
        <p className="bd-keep mt-[0.8em] text-right text-[0.9em] text-neutral-600">
          <span className="text-neutral-500">Amount in words: </span>
          {words}
        </p>
      )}

      {doc.notes.trim() && (
        <section className="bd-keep mt-[2em] [overflow-wrap:anywhere]">
          <p className="text-[0.75em] font-semibold uppercase tracking-[0.08em] text-neutral-500">Notes</p>
          <p className="mt-[0.3em] whitespace-pre-line text-neutral-700">{doc.notes}</p>
        </section>
      )}
      {doc.kind === "quotation" && doc.terms.trim() && (
        <section className="bd-keep mt-[1.5em] [overflow-wrap:anywhere]">
          <p className="text-[0.75em] font-semibold uppercase tracking-[0.08em] text-neutral-500">Terms</p>
          <p className="mt-[0.3em] whitespace-pre-line text-neutral-700">{doc.terms}</p>
        </section>
      )}

      {doc.credit && (
        <p className="mt-auto pt-[2.5em] text-center text-[0.75em] text-neutral-400">
          Made with{" "}
          <a href={`${siteConfig.url}${toolPath(labels.slug)}`} className="text-neutral-500 underline-offset-2 hover:underline">
            SpendChat
          </a>{" "}
          · {siteConfig.domain}
        </p>
      )}
    </article>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-[1em] py-[0.2em]">
      <dt className="text-neutral-600">{label}</dt>
      <dd className="tabular-nums whitespace-nowrap">{value}</dd>
    </div>
  );
}

/** A prompt for an empty field — shown faintly on screen, never printed. */
function Placeholder({ children }: { children: ReactNode }) {
  return <span className="bd-ph text-neutral-400">{children}</span>;
}

/** "Sixty-three dollars and sixty-eight cents" — null if it can't be written out. */
function amountWords(totalMinor: number, currency: string): string | null {
  try {
    return applyLetterCase(minorAmountInWords(totalMinor, currency, defaultNumberingSystem(currency)), "sentence");
  } catch {
    return null;
  }
}

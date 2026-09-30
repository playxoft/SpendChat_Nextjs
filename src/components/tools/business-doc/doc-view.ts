import { isSupportedCurrency } from "@/lib/currencies";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/tools/date-math";
import { EMPTY, formatNumber } from "@/lib/tools/format";
import { docFileName, type BusinessDoc, type DocEvaluation } from "@/lib/tools/invoice";
import type { DocView } from "@/lib/tools/invoice-pdf";
import { applyLetterCase, defaultNumberingSystem, minorAmountInWords } from "@/lib/tools/number-words";
import { siteConfig } from "@/lib/site";
import type { DocLabels } from "./labels";

/**
 * Everything the document says, as display strings — the one place the
 * on-screen paper and the downloaded PDF get their dates, figures and wording
 * from, so the two can't disagree.
 */
export function buildDocView({
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
}): DocView {
  const code = isSupportedCurrency(currency) ? currency : "USD";
  const money = (minor: number) => formatMoney(minor, code, locale);
  const { totals } = evaluation;

  const due =
    doc.kind === "invoice" && doc.dueDays === 0
      ? "On receipt"
      : dates.due
        ? formatDate(dates.due, locale, "plain")
        : EMPTY;

  const taxName = doc.taxLabel.trim() || "Tax";
  const totalRows: { label: string; value: string }[] = [];
  if (totals) {
    if (totals.discount > 0 || evaluation.taxRate > 0) {
      totalRows.push({ label: "Subtotal", value: money(totals.subtotal) });
    }
    if (totals.discount > 0) {
      totalRows.push({
        label:
          evaluation.discountPercent !== null
            ? `Discount (${formatNumber(evaluation.discountPercent, locale, 4)}%)`
            : "Discount",
        value: `−${money(totals.discount)}`,
      });
    }
    if (evaluation.taxRate > 0) {
      totalRows.push({
        label: `${taxName} (${formatNumber(evaluation.taxRate, locale, 4)}%)`,
        value: money(totals.tax),
      });
    }
  }

  const lines = (text: string) =>
    text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

  return {
    title: labels.title,
    fileName: docFileName(doc, "pdf"),
    logo: doc.logo,
    seller: {
      name: doc.from.name.trim(),
      lines: [
        ...lines(doc.from.address),
        ...(doc.from.contact.trim() ? [doc.from.contact.trim()] : []),
        ...(doc.from.taxId.trim() ? [`Tax ID: ${doc.from.taxId.trim()}`] : []),
      ],
    },
    meta: [
      { label: labels.numberShort, value: doc.number.trim() || EMPTY },
      { label: labels.issue, value: dates.issue ? formatDate(dates.issue, locale, "plain") : EMPTY },
      { label: labels.due, value: due },
    ],
    clientLabel: labels.to,
    client: {
      name: doc.to.name.trim(),
      lines: [...lines(doc.to.address), ...(doc.to.email.trim() ? [doc.to.email.trim()] : [])],
    },
    items: doc.items
      .map((item, i) => ({ item, result: evaluation.items[i]! }))
      .filter(({ result }) => !result.blank)
      .map(({ item, result }) => ({
        description: item.description.trim(),
        qty: result.qty === null ? EMPTY : formatNumber(result.qty, locale, 4),
        unitPrice: result.unitMinor === null ? EMPTY : money(result.unitMinor),
        amount: result.amountMinor === null ? EMPTY : money(result.amountMinor),
      })),
    totalRows,
    total: totals ? money(totals.total) : null,
    amountInWords: totals ? amountWords(totals.total, code) : null,
    notes: doc.notes.trim(),
    terms: doc.kind === "quotation" ? doc.terms.trim() : "",
    credit: doc.credit ? `Made with SpendChat · ${siteConfig.domain}` : null,
  };
}

/** "Sixty-three dollars and sixty-eight cents" — null if it can't be written out. */
function amountWords(totalMinor: number, currency: string): string | null {
  try {
    return applyLetterCase(minorAmountInWords(totalMinor, currency, defaultNumberingSystem(currency)), "sentence");
  } catch {
    return null;
  }
}

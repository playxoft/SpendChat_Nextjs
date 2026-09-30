"use client";

import { useId, useState } from "react";
import { Check, Eraser, Printer, Shuffle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ChoiceChips, CurrencyField, DateField, NumberField, Segmented } from "@/components/tools/fields";
import {
  ResultActions,
  ResultEmpty,
  ResultHero,
  ResultRows,
  ToolLayout,
  ToolPanel,
  type ResultRow,
} from "@/components/tools/result";
import { useToolCurrency, useToolLocale, useUrlState } from "@/components/tools/tool-state";
import { useToday } from "@/components/tools/use-today";
import { getCurrency } from "@/lib/currencies";
import { regionFromLocale } from "@/lib/geo";
import { fromMinorUnits, toMinorUnits } from "@/lib/money";
import { siteConfig } from "@/lib/site";
import { formatDate, resolveDateInput } from "@/lib/tools/date-math";
import { EMPTY, currencySymbol, formatCurrency, formatNumber } from "@/lib/tools/format";
import { amountRangeError, readField } from "@/lib/tools/growth";
import {
  CHALLENGE_WEEKS,
  LIMITS,
  challengeProgress,
  currentWeekIndex,
  customChallenge,
  envelopeChallenge,
  finishDate,
  percentDone,
  runningTotals,
  trackerKey,
  weekDate,
  weeklyChallenge,
  type Challenge,
  type ChallengeKind,
} from "@/lib/tools/savings-challenge";
import { cn } from "@/lib/utils";
import { clearTracker, restoreTracker, setTick, setTrackerStart, useTracker } from "./tracker-store";

/**
 * The savings challenge tracker: pick a challenge, tick off each week (or
 * envelope) as the money goes in, and print it as a paper tracker.
 *
 * The challenge itself — type, amount, start date — lives in the URL like
 * every tool's inputs, so a link shares the plan. The ticks are personal, so
 * they stay in this browser (`tracker-store.ts`), one tracker per challenge.
 */

// Short, stable query keys — they're in every shared link.
const DEFAULTS = {
  t: "up", // up | down | env | custom
  b: "1", // week-1 / envelope-1 amount
  g: "1000", // custom: goal
  w: "52", // custom: weeks
  d: "today", // start date
};

const TYPE_OPTIONS = [
  { value: "up", label: "52-week" },
  { value: "down", label: "Reverse" },
  { value: "env", label: "Envelopes" },
  { value: "custom", label: "Custom" },
];

const QUICK_AMOUNTS = ["1", "5", "10", "100"];

const NAMES: Record<ChallengeKind, string> = {
  up: "52-week savings challenge",
  down: "Reverse 52-week savings challenge",
  envelopes: "100-envelope savings challenge",
  custom: "Savings challenge",
};

/**
 * Print only the tracker sheet. Everything else is hidden twice over —
 * `visibility: hidden`, and `display: none` on every element that neither is
 * the sheet nor contains it, so the page around it can't print as blank pages.
 * The sheet's ancestors lose their padding and borders, so it starts at the
 * page's top-left margin; the sheet itself is `display: none` on screen.
 * No `@page` size: it fits A4 and US Letter alike, whichever the printer uses.
 */
const PRINT_CSS = `
@media print {
  @page { margin: 12mm; }
  html, body { background: #fff !important; }
  body * { visibility: hidden !important; }
  .sc-print, .sc-print * { visibility: visible !important; }
  body *:not(:has(.sc-print)):not(.sc-print):not(.sc-print *) { display: none !important; }
  body *:has(.sc-print) {
    display: block !important;
    position: static !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    width: auto !important;
    min-width: 0 !important;
    max-width: none !important;
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    overflow: visible !important;
    background: none !important;
    box-shadow: none !important;
    transform: none !important;
  }
  .sc-print {
    display: block !important;
    color: #000 !important;
    font-size: 9pt !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .sc-print .sc-cell { break-inside: avoid; }
}
@supports not selector(:has(*)) {
  @media print {
    .sc-print { position: absolute !important; top: 0; left: 0; right: 0; }
  }
}
`;

function kindOf(t: string): ChallengeKind {
  return t === "down" ? "down" : t === "env" ? "envelopes" : t === "custom" ? "custom" : "up";
}

/** "5 Oct" — English month names in the visitor's day/month order, like the rest of the page. */
function shortDate(iso: string, locale: string): string {
  const region = /^en(?:-|$)/i.test(locale) ? null : regionFromLocale(locale);
  const tag = region ? `en-${region}` : /^en(?:-|$)/i.test(locale) ? locale : "en-US";
  try {
    return new Intl.DateTimeFormat(tag, { day: "numeric", month: "short", timeZone: "UTC" }).format(
      new Date(`${iso}T00:00:00Z`),
    );
  } catch {
    return iso;
  }
}

/** One item at random — for "Draw an envelope", only ever called from a click. */
function pickAtRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

export function SavingsChallengeTool() {
  const [s, set, reset] = useUrlState(DEFAULTS);
  const [currency] = useToolCurrency();
  const locale = useToolLocale();
  const today = useToday();
  const uid = useId();
  const [drawn, setDrawn] = useState<number | null>(null);

  const kind = kindOf(s.t);
  const symbol = currencySymbol(currency, locale);
  const minorPerUnit = 10 ** getCurrency(currency).decimals;

  // --- Inputs
  const base = readField(s.b, locale, {
    min: 0,
    max: LIMITS.maxBase,
    required: "Enter an amount.",
    range: amountRangeError,
  });
  const goal = readField(s.g, locale, {
    min: 0,
    max: LIMITS.maxGoal,
    required: "Enter your savings goal.",
    range: amountRangeError,
  });
  const weeksRead = readField(s.w, locale, {
    min: LIMITS.minWeeks,
    max: LIMITS.maxWeeks,
    required: "Enter a number of weeks.",
    range: `Use between ${LIMITS.minWeeks} and ${LIMITS.maxWeeks} weeks.`,
  });
  const weeksError =
    weeksRead.error ?? (weeksRead.value !== null && !Number.isInteger(weeksRead.value) ? "Use a whole number of weeks." : null);
  const weeks = weeksError ? null : weeksRead.value;

  let challenge: Challenge | null = null;
  let problem: string | null = null;
  let baseError = base.error;
  let goalError = goal.error;
  if (kind === "custom") {
    if (goalError) problem = `Savings goal: ${goalError}`;
    else if (weeksError) problem = `Weeks: ${weeksError}`;
    else {
      const goalMinor = toMinorUnits(goal.value!, currency);
      challenge = goalMinor > 0 ? customChallenge(goalMinor, weeks!) : null;
      if (!challenge) {
        goalError = goalMinor > 0 ? `Too small to split over ${weeks} weeks.` : "Enter a goal above zero.";
        problem = `Savings goal: ${goalError}`;
      }
    }
  } else if (baseError) {
    problem = `Amount: ${baseError}`;
  } else {
    const baseMinor = toMinorUnits(base.value!, currency);
    if (baseMinor <= 0) {
      baseError = "Enter an amount above zero.";
      problem = `Amount: ${baseError}`;
    } else {
      challenge = kind === "envelopes" ? envelopeChallenge(baseMinor) : weeklyChallenge(baseMinor, kind);
    }
  }

  // --- Ticks, remembered per challenge
  const key = challenge
    ? trackerKey(kind, kind === "custom" ? goal.value! : base.value!, kind === "custom" ? weeks! : undefined)
    : "none";
  const tracker = useTracker(key);
  const ticked = new Set(challenge ? (tracker?.ticks ?? []) : []);

  // A challenge started "today" keeps the day its first tick pinned; an
  // explicit date in the link always wins.
  const relativeStart = /^today/i.test(s.d.trim());
  const typedStart = resolveDateInput(s.d, today);
  const start = relativeStart ? (tracker?.start ?? typedStart) : typedStart;

  // Whole amounts show without decimals ($1, not $1.00) unless a step needs them.
  const whole = challenge ? challenge.steps.every((st) => st.amount % minorPerUnit === 0) : true;
  const money = (minor: number) =>
    formatCurrency(fromMinorUnits(minor, currency), currency, locale, whole ? { decimals: 0 } : {});
  const moneyAvg = (minor: number) => formatCurrency(fromMinorUnits(minor, currency), currency, locale);

  const progress = challenge ? challengeProgress(challenge, ticked) : null;
  const pct = progress ? percentDone(progress.fraction) : 0;
  const unitWord = challenge?.unit === "envelope" ? "envelope" : "week";
  const count = challenge?.steps.length ?? 0;
  const finish = challenge && start ? finishDate(challenge, start) : null;
  const thisWeek =
    challenge?.unit === "week" && start && today ? currentWeekIndex(start, today, count) : null;
  const byId = challenge ? [...challenge.steps].sort((a, b) => a.id - b.id) : [];

  // What the chosen challenge is, in a sentence.
  let plan = "";
  if (challenge) {
    const first = byId[0]!.amount;
    const last = byId.at(-1)!.amount;
    if (kind === "up") {
      plan = `Save ${money(first)} in week 1, ${money(first * 2)} in week 2, and so on up to ${money(last)} in week ${CHALLENGE_WEEKS}.`;
    } else if (kind === "down") {
      plan = `Start with ${money(first)} in week 1 and save ${money(last)} less each week, down to ${money(last)} in week ${CHALLENGE_WEEKS}.`;
    } else if (kind === "envelopes") {
      plan = `Envelope 1 holds ${money(first)} and envelope 100 holds ${money(last)}. Draw one at random, fill it, tick it off.`;
    } else {
      plan =
        count === 1
          ? `${money(first)} in one go.`
          : `${money(first)} a week for ${formatNumber(count, locale)} weeks` +
            (last !== first ? `, with ${money(last)} in the last week.` : ".");
    }
  }

  const toggle = (id: number, checked: boolean) => {
    if (!challenge) return;
    setTick(key, id, checked, start ?? null);
    if (checked && id === drawn) setDrawn(null);
  };

  const draw = () => {
    if (!challenge) return;
    const left = challenge.steps.filter((st) => !ticked.has(st.id));
    if (left.length === 0) return;
    const pick = pickAtRandom(left);
    setDrawn(pick.id);
    const el = document.getElementById(`${uid}-step-${pick.id}`);
    el?.scrollIntoView({ block: "center" });
    el?.focus({ preventScroll: true });
    toast(`Envelope ${pick.id}: put in ${money(pick.amount)}`, { description: "Tick it off once it's in." });
  };

  const clear = () => {
    const removed = clearTracker(key);
    if (!removed) return;
    toast("Ticks cleared", {
      action: { label: "Undo", onClick: () => restoreTracker(key, removed) },
    });
  };

  const print = () => {
    const previous = document.title;
    document.title = `${NAMES[kind]} tracker`;
    window.addEventListener(
      "afterprint",
      () => {
        document.title = previous;
      },
      { once: true },
    );
    window.print();
  };

  const pickStart = (v: string) => {
    set({ d: v });
    if (challenge) setTrackerStart(key, v);
  };

  // --- Result
  const rows: ResultRow[] = [];
  let copy: string | null = null;
  if (challenge && progress) {
    rows.push(
      { label: "Challenge total", value: money(challenge.total), strong: true },
      { label: "Still to save", value: money(progress.remaining) },
    );
    if (challenge.unit === "week") {
      rows.push({
        label: "Next up",
        value: progress.next
          ? `Week ${progress.next.id} · ${money(progress.next.amount)}`
          : "All done",
      });
      rows.push({ label: "Last week", value: finish ? formatDate(finish, locale, "short") : EMPTY });
      if (count > 1) rows.push({ label: "Average a week", value: moneyAvg(challenge.total / count) });
    } else {
      rows.push({ label: "Envelopes left", value: formatNumber(count - progress.done, locale) });
      rows.push({ label: "Done by, at one a day", value: finish ? formatDate(finish, locale, "short") : EMPTY });
    }
    copy =
      `${NAMES[kind]} (${currency}): ${plan} ${money(challenge.total)} in total. ` +
      `Saved so far: ${money(progress.saved)} (${formatNumber(progress.done, locale)} of ${formatNumber(count, locale)} ${unitWord}s).`;
  }

  const complete = progress !== null && progress.done === progress.count;
  const amountLabel = kind === "down" ? "Week 52 amount" : kind === "envelopes" ? "Envelope 1 amount" : "Week 1 amount";

  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <ToolLayout>
        <ToolPanel className="space-y-5">
          <div>
            <Segmented
              label="Challenge"
              value={TYPE_OPTIONS.some((o) => o.value === s.t) ? s.t : "up"}
              onChange={(v) => {
                set({ t: v });
                setDrawn(null);
              }}
              options={TYPE_OPTIONS}
            />
            {plan && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{plan}</p>}
          </div>

          {kind === "custom" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField
                label="Savings goal"
                prefix={symbol}
                value={s.g}
                onChange={(v) => set({ g: v })}
                error={goalError}
              />
              <NumberField
                label="Weeks"
                integer
                suffix="weeks"
                value={s.w}
                onChange={(v) => set({ w: v })}
                error={weeksError}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <NumberField
                label={amountLabel}
                prefix={symbol}
                value={s.b}
                onChange={(v) => set({ b: v })}
                error={baseError}
              />
              <ChoiceChips
                label="Quick pick"
                value={s.b.trim()}
                onChange={(v) => set({ b: v })}
                options={QUICK_AMOUNTS.map((v) => ({
                  value: v,
                  label: formatCurrency(Number(v), currency, locale, { decimals: 0 }),
                }))}
              />
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <DateField
              label="Start date"
              value={start ?? ""}
              onChange={pickStart}
              hint={
                kind === "envelopes"
                  ? "The day you fill your first envelope."
                  : "Week 1's saving day; each week after falls 7 days later."
              }
            />
            <CurrencyField />
          </div>
        </ToolPanel>

        <ToolPanel sticky className="space-y-5">
          {challenge && progress ? (
            <>
              <ResultHero
                label="Saved so far"
                value={money(progress.saved)}
                sub={
                  complete
                    ? `All ${formatNumber(count, locale)} ${unitWord}s done — challenge complete.`
                    : `${formatNumber(progress.done, locale)} of ${formatNumber(count, locale)} ${unitWord}s ticked · ${pct}% of ${money(challenge.total)}`
                }
              />
              <div
                role="progressbar"
                aria-label="Challenge progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
                className="h-2 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
                  style={{ width: `${progress.fraction * 100}%` }}
                />
              </div>
              <ResultRows rows={rows} />
            </>
          ) : (
            <ResultEmpty>{problem}</ResultEmpty>
          )}
          <ResultActions copy={copy} onReset={reset} />
        </ToolPanel>
      </ToolLayout>

      <ToolPanel as="section" className="mt-4 lg:mt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-medium">Your tracker</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {challenge?.unit === "envelope"
                ? "Tick each envelope as you fill it."
                : "Tick each week as you save it."}{" "}
              Ticks are kept in this browser only.
            </p>
          </div>
          {challenge && (
            <div className="flex flex-wrap gap-2">
              {challenge.unit === "envelope" && !complete && (
                <Button type="button" className="h-9 rounded-lg" onClick={draw}>
                  <Shuffle /> Draw an envelope
                </Button>
              )}
              <Button type="button" variant="outline" className="h-9 rounded-lg" onClick={print}>
                <Printer /> Print tracker
              </Button>
              {ticked.size > 0 && (
                <Button type="button" variant="ghost" className="h-9 rounded-lg" onClick={clear}>
                  <Eraser /> Clear ticks
                </Button>
              )}
            </div>
          )}
        </div>

        {challenge ? (
          <fieldset className="mt-4 min-w-0">
            <legend className="sr-only">{challenge.unit === "envelope" ? "Envelopes filled" : "Weeks saved"}</legend>
            {challenge.unit === "envelope" ? (
              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5 md:grid-cols-10">
                {challenge.steps.map((st) => (
                  <label
                    key={st.id}
                    className={cn(
                      "relative flex min-h-11 cursor-pointer items-center justify-center rounded-lg border px-1 py-1.5 text-center transition-colors select-none hover:bg-muted/60 has-checked:border-emerald-600/30 has-checked:bg-emerald-50 has-focus-visible:ring-3 has-focus-visible:ring-ring/40 dark:has-checked:border-emerald-400/30 dark:has-checked:bg-emerald-950/40 lg:min-h-10",
                      drawn === st.id && !ticked.has(st.id) && "ring-2 ring-foreground",
                    )}
                  >
                    <input
                      id={`${uid}-step-${st.id}`}
                      type="checkbox"
                      className="peer sr-only"
                      checked={ticked.has(st.id)}
                      onChange={(e) => toggle(st.id, e.target.checked)}
                    />
                    <span className="sr-only">
                      Envelope {st.id}, {money(st.amount)}
                    </span>
                    <span
                      aria-hidden
                      className="text-[13px] leading-tight font-medium tabular-nums [overflow-wrap:anywhere] peer-checked:text-emerald-700 dark:peer-checked:text-emerald-300"
                    >
                      {money(st.amount)}
                    </span>
                    <Check
                      aria-hidden
                      className="absolute top-1 right-1 hidden size-3 text-emerald-600 peer-checked:block dark:text-emerald-400"
                    />
                  </label>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {challenge.steps.map((st, index) => {
                  const date = start ? weekDate(start, st.id) : null;
                  const now = thisWeek === index;
                  return (
                    <label
                      key={st.id}
                      className={cn(
                        "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-1.5 transition-colors select-none hover:bg-muted/60 has-checked:border-emerald-600/30 has-checked:bg-emerald-50 has-focus-visible:ring-3 has-focus-visible:ring-ring/40 dark:has-checked:border-emerald-400/30 dark:has-checked:bg-emerald-950/40 lg:min-h-10",
                        now && "border-foreground/50",
                      )}
                    >
                      <input
                        id={`${uid}-step-${st.id}`}
                        type="checkbox"
                        className="size-4 shrink-0 cursor-pointer accent-emerald-600"
                        checked={ticked.has(st.id)}
                        onChange={(e) => toggle(st.id, e.target.checked)}
                      />
                      <span className="sr-only">
                        Week {st.id}, {money(st.amount)}
                        {date ? `, ${formatDate(date, locale, "short")}` : ""}
                        {now ? " (this week)" : ""}
                      </span>
                      <span aria-hidden className="min-w-0 flex-1 leading-tight">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="text-xs text-muted-foreground">Wk {st.id}</span>
                          <span className="text-sm font-medium tabular-nums [overflow-wrap:anywhere]">
                            {money(st.amount)}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "block text-xs tabular-nums",
                            now ? "font-medium text-foreground" : "text-muted-foreground",
                          )}
                        >
                          {now ? "This week" : date ? shortDate(date, locale) : " "}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </fieldset>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            Fix the inputs above to see your tracker.
          </p>
        )}
      </ToolPanel>

      {challenge && progress && (
        <PrintSheet
          challenge={challenge}
          kind={kind}
          plan={plan}
          ticked={ticked}
          start={start ?? null}
          finish={finish}
          currency={currency}
          locale={locale}
          money={money}
          saved={progress.saved}
        />
      )}
    </div>
  );
}

/**
 * The paper tracker: hidden on screen, the only thing that prints. Black on
 * white whatever the theme; envelopes in number order (easier to find on
 * paper than the shuffled screen order), weeks with their date and the running
 * total to check against.
 */
function PrintSheet({
  challenge,
  kind,
  plan,
  ticked,
  start,
  finish,
  currency,
  locale,
  money,
  saved,
}: {
  challenge: Challenge;
  kind: ChallengeKind;
  plan: string;
  ticked: ReadonlySet<number>;
  start: string | null;
  finish: string | null;
  currency: string;
  locale: string;
  money: (minor: number) => string;
  saved: number;
}) {
  const totals = runningTotals(challenge);
  const steps = [...challenge.steps].sort((a, b) => a.id - b.id);
  const envelopes = challenge.unit === "envelope";
  return (
    <div className="sc-print hidden bg-white text-black">
      <div className="flex items-baseline justify-between gap-4 border-b-2 border-black pb-[2mm]">
        <p className="text-[15pt] font-bold">{NAMES[kind]}</p>
        <p className="text-[10pt] font-semibold whitespace-nowrap">
          {currency} · {money(challenge.total)}
        </p>
      </div>
      <p className="mt-[2mm] text-[9pt]">{plan}</p>
      <p className="mt-[1mm] text-[9pt] text-neutral-700">
        {start ? `Starts ${formatDate(start, locale, "short")}` : ""}
        {finish ? (envelopes ? ` · one a day finishes ${formatDate(finish, locale, "short")}` : ` · last week ${formatDate(finish, locale, "short")}`) : ""}
        {saved > 0 ? ` · saved so far ${money(saved)}` : ""}
      </p>

      <div
        className={cn("mt-[4mm] grid gap-[1.5mm]", envelopes ? "grid-cols-10" : "grid-cols-4")}
      >
        {steps.map((st) => {
          const done = ticked.has(st.id);
          const date = !envelopes && start ? weekDate(start, st.id) : null;
          return (
            <div
              key={st.id}
              className={cn(
                "sc-cell flex gap-[1.5mm] rounded-[1mm] border border-neutral-400 px-[1.5mm] py-[1.2mm]",
                envelopes ? "flex-col items-center text-center" : "items-start",
              )}
            >
              <span className="flex size-[3.4mm] shrink-0 items-center justify-center border border-black text-[7pt] leading-none font-bold">
                {done ? "✓" : ""}
              </span>
              {envelopes ? (
                <span className="min-w-0 leading-tight">
                  <span className="block text-[10pt] font-bold">{st.id}</span>
                  <span className="block text-[7pt] [overflow-wrap:anywhere]">{money(st.amount)}</span>
                </span>
              ) : (
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="flex justify-between gap-[1mm] text-[8pt]">
                    <span>Week {st.id}</span>
                    <span>{date ? shortDate(date, locale) : ""}</span>
                  </span>
                  <span className="block text-[10pt] font-bold [overflow-wrap:anywhere]">{money(st.amount)}</span>
                  <span className="block text-[7pt] text-neutral-600 [overflow-wrap:anywhere]">
                    Total {money(totals.get(st.id)!)}
                  </span>
                </span>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-[4mm] text-[7.5pt] text-neutral-600">
        Free savings challenge tracker · {siteConfig.domain}/tools/savings-challenge
      </p>
    </div>
  );
}

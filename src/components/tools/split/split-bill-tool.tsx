"use client";

import { useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Copy,
  Share2,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/tools/fields";
import { ResultEmpty, ResultHero, ToolLayout, ToolPanel } from "@/components/tools/result";
import { useToolLocale } from "@/components/tools/tool-state";
import { useToday } from "@/components/tools/use-today";
import { trackEvent } from "@/lib/analytics";
import { CURRENCIES } from "@/lib/currencies";
import { formatMoney } from "@/lib/money";
import { siteConfig } from "@/lib/site";
import { SETTLED_UP } from "@/lib/split-display";
import { SPLIT_SIGN_UP_HREF } from "@/lib/split-import";
import {
  computeLedger,
  DRAFT_EXPENSES_MAX,
  DRAFT_NAME_MAX,
  DRAFT_PEOPLE_MAX,
  exampleDraft,
  isBlankDraft,
  nextId,
  peopleInUse,
  personLabel,
  settleUpText,
  splitSummary,
  type DraftExpense,
  type SplitDraft,
} from "@/lib/tools/split-bill";
import { toolPath } from "@/lib/tools";
import { cn } from "@/lib/utils";
import { ExpenseDialog } from "./expense-dialog";
import { PeopleEditor } from "./people-editor";
import { clearDraft, dismissNudge, setDraft, useDraft, useNudgeDismissed } from "./draft-store";
import { SENDS_INVITES, SignUpGate, type GateKind } from "./sign-up-gate";
import { recordSendIntentFor } from "./send-intent";

/**
 * The free split calculator: name the group, add people by name, add what was
 * spent — and see everyone's balance and who pays whom to settle it,
 * worked out with the app's own split maths. Saved in this browser as you go.
 *
 * What needs other people — saving the group for everyone, sharing it,
 * inviting by email — opens a sign-up prompt (`SignUpGate`), and the group
 * carries over to the app after sign-up (`/app/split/import`).
 */

const SLUG = "split-bill-calculator";
const GATE_LOCATION = `tool_${SLUG}_gate`;
const NUDGE_LOCATION = `tool_${SLUG}_nudge`;

const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }));


export function SplitBillTool() {
  const draft = useDraft();
  const locale = useToolLocale();
  const today = useToday();
  const nudgeDismissed = useNudgeDismissed();
  const [gate, setGate] = useState<{ kind: GateKind; open: boolean }>({ kind: "save", open: false });
  const [editing, setEditing] = useState<DraftExpense | "new" | null>(null);
  const focusId = useRef<string | null>(null);

  const fmt = (minor: number) => formatMoney(minor, draft.currency, locale);
  const ledger = computeLedger(draft);
  const inUse = peopleInUse(draft);
  const label = (id: string) => personLabel(draft.people, id);
  const blank = isBlankDraft(draft);

  const update = (patch: Partial<SplitDraft>) => setDraft({ ...draft, ...patch });

  function openGate(kind: GateKind) {
    setGate({ kind, open: true });
    trackEvent("tool_gate_open", { tool: SLUG, gate: kind });
  }

  function addPerson() {
    if (draft.people.length >= DRAFT_PEOPLE_MAX) return;
    const id = nextId("p", draft.people);
    focusId.current = id;
    update({ people: [...draft.people, { id, name: "" }] });
  }

  function removePerson(id: string) {
    if (inUse.has(id)) {
      toast.error(`${label(id)} is on an expense. Change or delete that expense first.`);
      return;
    }
    update({ people: draft.people.filter((p) => p.id !== id) });
  }

  function saveExpense(next: Omit<DraftExpense, "id">) {
    if (editing === "new") {
      update({ expenses: [...draft.expenses, { ...next, id: nextId("e", draft.expenses) }] });
    } else if (editing) {
      const id = editing.id;
      update({ expenses: draft.expenses.map((e) => (e.id === id ? { ...next, id } : e)) });
    }
    setEditing(null);
  }

  function deleteExpense(id: string) {
    const before = draft;
    update({ expenses: draft.expenses.filter((e) => e.id !== id) });
    setEditing(null);
    toast("Expense deleted", { action: { label: "Undo", onClick: () => setDraft(before, { immediate: true }) } });
  }

  function startOver() {
    const before = draft;
    clearDraft();
    toast("Started over", { action: { label: "Undo", onClick: () => setDraft(before, { immediate: true }) } });
  }

  async function copySummary() {
    const text = settleUpText(draft, ledger, fmt, `${siteConfig.url}${toolPath(SLUG)}`);
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied — paste it into the group chat");
    } catch {
      toast.error("Couldn't copy — your browser blocked clipboard access.");
    }
  }

  const hasResult = ledger.totalMinor > 0;
  const atExpenseCap = draft.expenses.length >= DRAFT_EXPENSES_MAX;

  return (
    <>
      <ToolLayout>
        {/* ---- The group ---- */}
        <ToolPanel className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,12rem)]">
            <TextField
              label="Group name"
              value={draft.name}
              onChange={(name) => update({ name })}
              placeholder="Goa trip, flat bills, Friday dinner…"
              maxLength={DRAFT_NAME_MAX}
            />
            <SelectField
              label="Currency"
              value={draft.currency}
              onChange={(currency) => update({ currency })}
              options={CURRENCY_OPTIONS}
              disabled={draft.expenses.length > 0}
              hint={draft.expenses.length > 0 ? "Fixed once there's an expense." : undefined}
            />
          </div>

          <PeopleEditor
            people={draft.people}
            focusId={focusId}
            onChange={(people) => update({ people })}
            onAdd={addPerson}
            onRemove={removePerson}
            onInvite={() => openGate("invite")}
          />

          <section aria-labelledby="split-expenses">
            <div className="flex items-baseline justify-between gap-3 border-b pb-2">
              <h2 id="split-expenses" className="text-base font-semibold">
                Expenses
              </h2>
              {draft.expenses.length > 0 && (
                <span className="text-sm text-muted-foreground tabular-nums">{fmt(ledger.totalMinor)}</span>
              )}
            </div>
            {draft.expenses.length > 0 ? (
              <ul className="mt-3 divide-y rounded-xl border">
                {draft.expenses.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => setEditing(e)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{e.title.trim() || "Expense"}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {label(e.paidBy)} paid · {splitSummary(e.split)}
                          {ledger.invalid.includes(e.id) && " · doesn't add up"}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm tabular-nums">{fmt(e.amountMinor)}</span>
                      <Pencil className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                Nothing yet. Add the first thing someone paid for.
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                className="h-10 rounded-xl"
                onClick={() => setEditing("new")}
                disabled={atExpenseCap || !today}
              >
                <Plus /> Add an expense
              </Button>
              {blank && today && (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10 rounded-xl"
                  onClick={() => setDraft(exampleDraft(draft.currency, today))}
                >
                  <Sparkles /> Try an example
                </Button>
              )}
            </div>
            {atExpenseCap && (
              <p className="mt-2 text-xs text-muted-foreground">
                That&apos;s {DRAFT_EXPENSES_MAX} expenses — the most one group can bring along. Save it to keep going.
              </p>
            )}
          </section>
        </ToolPanel>

        {/* ---- Who owes whom ---- */}
        <ToolPanel sticky as="section" className="space-y-5">
          <h2 className="sr-only">Who owes whom</h2>
          {hasResult ? (
            <>
              <ResultHero
                label="Total spent"
                value={fmt(ledger.totalMinor)}
                sub={
                  ledger.payments.length === 0
                    ? "Everyone is settled up."
                    : ledger.payments.length === 1
                      ? "One payment settles everyone."
                      : `${ledger.payments.length} payments settle everyone.`
                }
              />

              <div>
                <h3 className="text-sm font-medium">Who pays whom</h3>
                {ledger.payments.length > 0 ? (
                  <ol className="mt-2 divide-y rounded-xl border">
                    {ledger.payments.map((p) => (
                      <li key={`${p.from}-${p.to}`} className="flex items-center gap-2 px-3 py-2.5 text-sm">
                        <span className="min-w-0 truncate font-medium">{label(p.from)}</span>
                        <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-label="pays" />
                        <span className="min-w-0 flex-1 truncate font-medium">{label(p.to)}</span>
                        <span className="shrink-0 tabular-nums">{fmt(p.amountMinor)}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-2">
                    <span className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                      {SETTLED_UP}
                    </span>
                  </p>
                )}
              </div>

              {ledger.payments.length > 0 && !nudgeDismissed && (
                <div className="relative rounded-xl border border-dashed p-4 pr-10">
                  <p className="text-sm font-medium">Send this to the group?</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Save it free, then invite everyone — once they join, they all see the live balance, so nobody has to chase anyone. You&apos;ll see who gets invited before anything is sent.
                  </p>
                  <Link
                    href={SPLIT_SIGN_UP_HREF}
                    data-track-event="cta_click"
                    data-track-params={JSON.stringify({ location: NUDGE_LOCATION, label: "save_group" })}
                    className="mt-2 inline-flex items-center gap-1 text-sm font-medium hover:underline"
                  >
                    Save the group, free <ArrowRight className="size-3.5" />
                  </Link>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 size-8 text-muted-foreground"
                    aria-label="Dismiss"
                    onClick={dismissNudge}
                  >
                    <X />
                  </Button>
                </div>
              )}

              <div>
                <h3 className="text-sm font-medium">Balances</h3>
                <ul className="mt-2 divide-y border-y text-sm">
                  {ledger.balances.map((b) => (
                    <li key={b.id} className="flex items-baseline justify-between gap-3 py-2.5">
                      <span className="min-w-0">
                        <span className="block truncate">{label(b.id)}</span>
                        <span className="block text-xs text-muted-foreground tabular-nums">
                          Paid {fmt(b.paidMinor)} · share {fmt(b.shareMinor)}
                        </span>
                      </span>
                      <BalanceWords netMinor={b.netMinor} fmt={fmt} />
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : (
            <ResultEmpty>
              Add who&apos;s in and what each person paid for, and you&apos;ll see everyone&apos;s balance
              here — and who pays whom to settle it.
            </ResultEmpty>
          )}

          {/* One row, never wrapped: labels shorten as the panel narrows (a
              container query on the row itself), and on the narrowest phones
              Copy and Start over keep only their icons. If even that doesn't
              fit, the row scrolls sideways. Each button's name is its full label. */}
          <div className="@container -mx-1 overflow-x-auto px-1 pb-1">
            <div className="flex w-max min-w-full flex-nowrap gap-2">
              <ActionButton icon={<Save />} full="Save group" short="Save" onClick={() => openGate("save")} primary />
              <ActionButton
                icon={<Share2 />}
                full="Share with the group"
                short="Share"
                onClick={() => openGate("share")}
              />
              {hasResult && (
                <ActionButton icon={<Copy />} full="Copy summary" short="Copy" onClick={copySummary} compact />
              )}
              {!blank && (
                <ActionButton icon={<RotateCcw />} full="Start over" short="Reset" onClick={startOver} ghost compact />
              )}
            </div>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Saved in this browser as you go. Save the group to share it — it carries over when you sign up.
          </p>
        </ToolPanel>
      </ToolLayout>

      {today && (
        <ExpenseDialog
          open={editing !== null}
          onOpenChange={(open) => !open && setEditing(null)}
          people={draft.people}
          expense={editing === "new" ? null : editing}
          currency={draft.currency}
          locale={locale}
          today={today}
          onSave={saveExpense}
          onDelete={editing && editing !== "new" ? () => deleteExpense(editing.id) : undefined}
        />
      )}
      <SignUpGate
        kind={gate.kind}
        open={gate.open}
        location={GATE_LOCATION}
        onOpenChange={(open) => setGate({ ...gate, open })}
        // Only "Send invites" / "Share with the group" may send without a click
        // in the app — and only for this exact draft, for a short while.
        onContinue={(kind) => SENDS_INVITES[kind] && recordSendIntentFor(draft)}
      />
    </>
  );
}

/**
 * A result action whose label fits the room: the full label from 34rem of row
 * width, a short one from 22rem, and below that — for `compact` buttons — the
 * icon alone. `aria-label` is always the full label.
 */
function ActionButton({
  icon,
  full,
  short,
  onClick,
  primary,
  ghost,
  compact,
}: {
  icon: ReactNode;
  full: string;
  short: string;
  onClick: () => void;
  primary?: boolean;
  ghost?: boolean;
  compact?: boolean;
}) {
  return (
    <Button
      type="button"
      variant={primary ? "default" : ghost ? "ghost" : "outline"}
      className="h-9 shrink-0 rounded-lg"
      aria-label={full}
      title={full}
      onClick={onClick}
    >
      {icon}
      <span aria-hidden className="hidden @[34rem]:inline">
        {full}
      </span>
      <span aria-hidden className={cn("@[34rem]:hidden", compact && "hidden @[22rem]:inline")}>
        {short}
      </span>
    </Button>
  );
}

function BalanceWords({ netMinor, fmt }: { netMinor: number; fmt: (minor: number) => string }) {
  if (netMinor === 0) return <span className="shrink-0 text-muted-foreground">{SETTLED_UP}</span>;
  if (netMinor > 0) {
    return (
      <span className="shrink-0 text-emerald-600 tabular-nums dark:text-emerald-400">gets back {fmt(netMinor)}</span>
    );
  }
  return <span className="shrink-0 tabular-nums">owes {fmt(-netMinor)}</span>;
}

"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { clearDraft, useStoredDraft } from "@/components/tools/split/draft-store";
import { importSplitDraft } from "@/actions/split-import";
import { formatMoney } from "@/lib/money";
import {
  buildImportInput,
  computeLedger,
  DRAFT_NAME_MAX,
  importOrder,
  personLabel,
  type SplitDraft,
} from "@/lib/tools/split-bill";
import { toolPath } from "@/lib/tools";
import { cn } from "@/lib/utils";

/**
 * `/app/split/import`: the group from the free split calculator, made real.
 * The visitor built it by name only; the app invites people by email, so this
 * asks for one per person (and which of them is you), shows the balances as
 * they'll be saved, then creates the group, its people and its expenses in
 * one go (`services/split-import.ts`) and clears the browser's copy.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SplitImport({ locale }: { locale: string }) {
  const draft = useStoredDraft();
  if (draft === undefined) return <ImportSkeleton />;
  if (draft === null) return <NothingToImport />;
  // Keyed on the draft's shape, so a change from another tab starts the form afresh.
  return (
    <ImportForm
      key={`${draft.people.map((p) => p.id).join(",")}|${draft.expenses.length}`}
      draft={draft}
      locale={locale}
    />
  );
}

function ImportForm({ draft, locale }: { draft: SplitDraft; locale: string }) {
  const router = useRouter();
  const [name, setName] = useState(draft.name.trim());
  const [meId, setMeId] = useState(draft.people[0]!.id);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const fmt = (minor: number) => formatMoney(minor, draft.currency, locale);
  const label = (id: string) => personLabel(draft.people, id);
  const others = draft.people.filter((p) => p.id !== meId);
  // The balances as the app will store them: it creates you first, then everyone
  // else in order — the order `computeShares` breaks a leftover cent's tie in.
  const ledger = computeLedger(draft, importOrder(draft, meId));

  function validate(): Record<string, string> {
    const found: Record<string, string> = {};
    const seen = new Map<string, string>();
    for (const p of others) {
      const email = (emails[p.id] ?? "").trim().toLowerCase();
      if (!email) found[p.id] = "Add their email";
      else if (!EMAIL.test(email)) found[p.id] = "That doesn't look like an email address";
      else if (seen.has(email)) found[p.id] = `Same email as ${label(seen.get(email)!)}`;
      else seen.set(email, p.id);
    }
    return found;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Give the group a name");
      return;
    }
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) return;

    setPending(true);
    let res: Awaited<ReturnType<typeof importSplitDraft>>;
    try {
      res = await importSplitDraft(buildImportInput({ draft, name, meId, emails }));
    } catch {
      setPending(false);
      toast.error("Couldn't reach SpendChat — check your connection and try again");
      return;
    }
    if (!res.ok) {
      setPending(false);
      // Refusals about particular people (a cooldown, too many open invites)
      // name their addresses; show the message on those rows too.
      const named = (res.details as { emails?: unknown } | undefined)?.emails;
      if (Array.isArray(named)) {
        const flagged: Record<string, string> = {};
        for (const p of others) {
          if (named.includes((emails[p.id] ?? "").trim().toLowerCase())) flagged[p.id] = "Can't be invited right now";
        }
        setErrors(flagged);
      }
      toast.error(res.error);
      return;
    }
    // Stays "Creating…" until the group page takes over; the browser's copy goes
    // quietly, so this page doesn't flash "nothing to bring in" on the way out.
    clearDraft({ quiet: true });
    toast.success(`${name.trim()} is ready — everyone's invited`);
    router.push(`/app/split/${res.groupId}`);
  }

  function discard() {
    clearDraft();
    toast("The calculator's group was cleared from this browser");
    router.push("/app/split");
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-3xl space-y-6 px-4 py-6" noValidate>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Bring your group in</h1>
        <p className="text-sm text-muted-foreground">
          From the free split calculator: {draft.people.length} {draft.people.length === 1 ? "person" : "people"},{" "}
          {draft.expenses.length} {draft.expenses.length === 1 ? "expense" : "expenses"}, {fmt(ledger.totalMinor)}{" "}
          in all. Add everyone&apos;s email and it becomes a group you can all see.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="split-import-name">Group name</Label>
        <Input
          id="split-import-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Goa trip"
          maxLength={DRAFT_NAME_MAX}
        />
        <p className="text-xs text-muted-foreground">
          Amounts stay in {draft.currency}, as in the calculator.
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Which one is you?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {draft.people.map((p) => (
            <label
              key={p.id}
              className="flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition-colors has-checked:border-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/40"
            >
              <input
                type="radio"
                name="split-import-me"
                value={p.id}
                checked={meId === p.id}
                onChange={() => {
                  setMeId(p.id);
                  setErrors({});
                }}
                className="accent-foreground"
              />
              <span className="min-w-0 truncate">{label(p.id)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {others.length > 0 && (
        <section aria-labelledby="split-import-emails" className="space-y-2">
          <h2 id="split-import-emails" className="text-sm font-medium">
            Everyone else&apos;s email
          </h2>
          <p className="text-xs text-muted-foreground">
            Each person gets an invitation to join — by email, or in the app if they already use SpendChat. Only you
            see these addresses. Until someone joins they&apos;re still in the group and on every expense.
          </p>
          <ul className="space-y-3">
            {others.map((p) => {
              const id = `split-import-email-${p.id}`;
              const error = errors[p.id];
              return (
                <li key={p.id} className="grid items-start gap-1.5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-3">
                  <Label htmlFor={id} className="truncate pt-2 font-normal">
                    {label(p.id)}
                  </Label>
                  <div className="space-y-1">
                    <Input
                      id={id}
                      type="email"
                      inputMode="email"
                      autoComplete="off"
                      placeholder="name@example.com"
                      value={emails[p.id] ?? ""}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? `${id}-error` : undefined}
                      onChange={(e) => setEmails({ ...emails, [p.id]: e.target.value })}
                    />
                    {error && (
                      <p id={`${id}-error`} className="text-xs text-destructive">
                        {error}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="split-import-balances" className="space-y-2">
        <h2 id="split-import-balances" className="text-sm font-medium">
          Balances once it&apos;s in
        </h2>
        <ul className="divide-y rounded-xl border text-sm">
          {ledger.balances.map((b) => (
            <li key={b.id} className="flex items-baseline justify-between gap-3 px-3 py-2.5">
              <span className="min-w-0 truncate">
                {label(b.id)}
                {b.id === meId && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
              </span>
              <span
                className={cn(
                  "shrink-0 tabular-nums",
                  b.netMinor > 0 && "text-emerald-600 dark:text-emerald-400",
                  b.netMinor === 0 && "text-muted-foreground",
                )}
              >
                {b.netMinor === 0 ? "settled up" : b.netMinor > 0 ? `is owed ${fmt(b.netMinor)}` : `owes ${fmt(-b.netMinor)}`}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button type="button" variant="ghost" className="text-muted-foreground" onClick={discard} disabled={pending}>
          Discard this group
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create group and invite"}
        </Button>
      </div>
    </form>
  );
}

function NothingToImport() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="rounded-xl border border-dashed p-8 text-center">
        <Calculator className="mx-auto mb-3 size-8 text-muted-foreground" aria-hidden />
        <h1 className="font-medium">Nothing to bring in</h1>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          There&apos;s no group from the split calculator in this browser. Start one here, or in the calculator and
          bring it over.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href="/app/split">Go to Split</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={toolPath("split-bill-calculator")}>Open the calculator</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function ImportSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6" aria-busy="true">
      <div className="space-y-1.5">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-80" />
      </div>
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-xl" />
      ))}
    </div>
  );
}

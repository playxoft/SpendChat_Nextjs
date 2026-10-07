"use client";

import { useEffect, useEffectEvent, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Calculator, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { clearDraft, useStoredDraft } from "@/components/tools/split/draft-store";
import {
  claimSendIntentFor,
  clearImportingMarker,
  markImportingFor,
  mayAlreadyBeImported,
} from "@/components/tools/split/send-intent";
import { importSplitDraft } from "@/actions/split-import";
import { formatMoney } from "@/lib/money";
import { SETTLED_UP } from "@/lib/split-display";
import {
  buildImportInput,
  computeLedger,
  DRAFT_EMAIL_MAX,
  DRAFT_NAME_MAX,
  emailProblems,
  importOrder,
  importStart,
  normalizeEmail,
  personLabel,
  readyToImport,
  resolveMe,
  UNNAMED_GROUP,
  type SplitDraft,
} from "@/lib/tools/split-bill";
import { toolPath } from "@/lib/tools";
import { cn } from "@/lib/utils";

/**
 * `/app/split/import`: the group from the free split calculator, made real.
 *
 * It sends invites without a click here only when the visitor asked for that
 * a moment ago: a fresh, one-time "send invites" intent for exactly this draft
 * (`lib/tools/split-send-intent.ts`), recorded by the calculator's "Send
 * invites" / "Share with the group" prompts and claimed once, in one tab.
 * Then, if it's clear which person is you and everyone else has a valid,
 * distinct email, the group is created and everyone invited straight away; if
 * only "which one is you?" is unclear, that's asked first.
 *
 * Without an intent — a "Save" click, an old draft, a link opened later — it
 * never sends on its own: a draft with everything gets one confirm screen that
 * lists who will be invited, anything else gets the form (emails prefilled,
 * problems on their rows, nothing left out without saying so). A reload while
 * a request was out lands on the form with a "check your groups" note, and the
 * server refuses the same draft twice either way (its idempotency key).
 */

type Phase =
  | { kind: "checking" }
  | { kind: "form" }
  | { kind: "confirm" }
  | { kind: "ask-me" }
  | { kind: "creating" }
  | { kind: "done"; name: string }
  | { kind: "already" };

type Outcome =
  | { ok: true; name: string }
  | { ok: "already" }
  | { ok: false; me: string; error: string; named?: unknown; overrides: Record<string, string> };

/** The draft whose import is running — so a re-mounted page (Strict Mode, a fast refresh) never sends it twice. */
let inFlight: SplitDraft | null = null;

export function SplitImport({ locale, myEmail }: { locale: string; myEmail: string | null }) {
  const draft = useStoredDraft();
  if (draft === undefined) return <ImportSkeleton />;
  if (draft === null) return <NothingToImport />;
  // Keyed on the draft's shape, so a change from another tab starts afresh.
  return (
    <ImportFlow
      key={`${draft.people.map((p) => p.id).join(",")}|${draft.expenses.length}`}
      draft={draft}
      locale={locale}
      myEmail={myEmail}
    />
  );
}

function ImportFlow({
  draft,
  locale,
  myEmail,
}: {
  draft: SplitDraft;
  locale: string;
  /** The signed-in account's address: it finds "you" in the draft, and can't be someone else's. */
  myEmail: string | null;
}) {
  const router = useRouter();
  const resolved = resolveMe(draft, myEmail);
  const [meId, setMeId] = useState<string | null>(resolved);
  const [name, setName] = useState(draft.name.trim());
  const [emails, setEmails] = useState<Record<string, string>>(() =>
    Object.fromEntries(draft.people.map((p) => [p.id, p.email?.trim() ?? ""])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  // Storage is read in an effect (it decides how to start), so the first paint is "checking".
  const [phase, setPhase] = useState<Phase>({ kind: "checking" });

  const fmt = (minor: number) => formatMoney(minor, draft.currency, locale);
  const label = (id: string) => personLabel(draft.people, id);
  const others = draft.people.filter((p) => p.id !== meId);
  const ledger = computeLedger(draft, meId ? importOrder(draft, meId) : undefined);
  const leftOut = draft.expenses.filter((e) => ledger.invalid.includes(e.id));

  /**
   * Send it, and say how it went — no state is touched here, so the arrival
   * effect can start it and apply the outcome when it lands. An "importing"
   * marker brackets the request: a reload while it's out finds the marker and
   * asks the visitor to check their groups instead of sending blind.
   */
  async function send(me: string, groupName: string, overrides: Record<string, string>): Promise<Outcome | null> {
    if (inFlight === draft) return null;
    inFlight = draft;
    markImportingFor(draft);
    let res: Awaited<ReturnType<typeof importSplitDraft>>;
    try {
      res = await importSplitDraft(buildImportInput({ draft, name: groupName, meId: me, emails: overrides }));
    } catch {
      // The outcome is unknown, so the marker stays: a retry (or a reload)
      // is told to check first, and the server's key refuses a repeat anyway.
      inFlight = null;
      return {
        ok: false,
        me,
        error: "Couldn't reach SpendChat. Check your groups before trying again — it may have gone through.",
        overrides,
      };
    }
    clearImportingMarker();
    if (!res.ok && res.code === "already_imported") {
      clearDraft({ quiet: true });
      return { ok: "already" };
    }
    if (!res.ok) {
      inFlight = null;
      return { ok: false, me, error: res.error, named: (res.details as { emails?: unknown } | undefined)?.emails, overrides };
    }
    // The browser's copy goes quietly, so this page doesn't flash "nothing to bring in".
    clearDraft({ quiet: true });
    // The result is said once, in the toast — it stays up on the group page.
    toast.success(resultLine(res.invited));
    router.push(`/app/split/${res.groupId}`);
    return { ok: true, name: groupName.trim() || UNNAMED_GROUP };
  }

  function apply(outcome: Outcome | null) {
    if (!outcome) return;
    if (outcome.ok === "already") {
      setPhase({ kind: "already" });
      return;
    }
    if (outcome.ok) {
      setPhase({ kind: "done", name: outcome.name });
      return;
    }
    // Refusals about particular people (a cooldown, too many open invites,
    // an inbox already in) name their addresses: mark those rows too.
    if (Array.isArray(outcome.named)) {
      const named = outcome.named;
      const flagged: Record<string, string> = {};
      for (const p of draft.people) {
        if (p.id === outcome.me) continue;
        if (named.includes(normalizeEmail(outcome.overrides[p.id] ?? p.email))) flagged[p.id] = outcome.error;
      }
      setErrors(flagged);
    }
    setMeId(outcome.me);
    setBanner(`The group wasn't created yet: ${outcome.error}`);
    setPhase({ kind: "form" });
  }

  // How to start: claim this draft's send intent (once, in one tab), then decide.
  const begin = useEffectEvent(() => {
    void claimSendIntentFor(draft).then((claimed) => {
      if (mayAlreadyBeImported(draft)) {
        setBanner("Check your groups — we may have already created this one. Creating it again won't make a second copy.");
        setPhase({ kind: "form" });
        return;
      }
      const how = importStart(draft, myEmail, claimed);
      if (how === "send" && resolved) {
        setPhase({ kind: "creating" });
        void send(resolved, draft.name, {}).then(apply);
        return;
      }
      setPhase({ kind: how === "send" ? "form" : how });
    });
  });
  useEffect(() => {
    begin();
  }, []);

  /** The form's problems: missing, malformed, duplicate or your own address. */
  function validate(me: string): Record<string, string> {
    const people = draft.people.map((p) => ({ ...p, email: emails[p.id] ?? "" }));
    const found = emailProblems(people, { skip: me, mine: myEmail });
    for (const p of people) {
      if (p.id !== me && !normalizeEmail(p.email) && !found[p.id]) found[p.id] = "Add their email";
    }
    return found;
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setBanner(null);
    if (!meId) {
      setBanner("Pick which one is you first.");
      return;
    }
    if (!name.trim()) {
      toast.error("Give the group a name");
      return;
    }
    const found = validate(meId);
    setErrors(found);
    if (Object.keys(found).length) return;
    setPhase({ kind: "creating" });
    void send(meId, name, emails).then(apply);
  }

  function pickMe(id: string) {
    setMeId(id);
    if (readyToImport(draft, id, myEmail)) {
      setPhase({ kind: "creating" });
      void send(id, draft.name, {}).then(apply);
    } else {
      setPhase({ kind: "form" });
    }
  }

  function discard() {
    clearDraft();
    toast("The calculator's group was cleared from this browser");
    router.push("/app/split");
  }

  const groupName = (phase.kind === "done" ? phase.name : name.trim() || draft.name.trim()) || UNNAMED_GROUP;

  if (phase.kind === "checking") return <ImportSkeleton />;

  if (phase.kind === "already") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="rounded-xl border p-8 text-center" role="status">
          <Check className="mx-auto mb-3 size-6 text-muted-foreground" aria-hidden />
          <h1 className="font-medium">This group is already in Split</h1>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            It was created a moment ago — from another tab, or before a reload. Nothing was made twice.
          </p>
          <Button asChild className="mt-4">
            <Link href="/app/split">Go to Split</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (phase.kind === "confirm" && meId) {
    const expenses = `${draft.expenses.length} ${draft.expenses.length === 1 ? "expense" : "expenses"}`;
    return (
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Create “{groupName}” and invite everyone?</h1>
          <p className="text-sm text-muted-foreground">
            From the free split calculator: {expenses}, {fmt(ledger.totalMinor)} in all. Nothing has been sent yet.
          </p>
        </div>
        <ul className="divide-y rounded-xl border text-sm">
          <li className="flex items-baseline justify-between gap-3 px-3 py-2.5">
            <span className="min-w-0 truncate font-medium">{label(meId)}</span>
            <span className="shrink-0 text-xs text-muted-foreground">You — no invite needed</span>
          </li>
          {others.map((p) => (
            <li key={p.id} className="flex items-baseline justify-between gap-3 px-3 py-2.5">
              <span className="min-w-0 truncate">{label(p.id)}</span>
              <span className="min-w-0 truncate text-muted-foreground">{normalizeEmail(p.email)}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          Each of them gets an invitation to join — by email, or in the app if they already use SpendChat. Only you
          see these addresses.
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button type="button" variant="ghost" onClick={() => setPhase({ kind: "form" })}>
            Change something
          </Button>
          <Button
            type="button"
            onClick={() => {
              setPhase({ kind: "creating" });
              void send(meId, draft.name, {}).then(apply);
            }}
          >
            Create group and send invites
          </Button>
        </div>
      </div>
    );
  }

  if (phase.kind === "creating" || phase.kind === "done") {
    const done = phase.kind === "done";
    const inviting = draft.people.length - 1;
    const expenses = `${draft.expenses.length} ${draft.expenses.length === 1 ? "expense" : "expenses"}`;
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="rounded-xl border p-8 text-center" role="status" aria-live="polite">
          <span
            className={cn(
              "mx-auto mb-3 flex size-10 items-center justify-center rounded-full border",
              done && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
            )}
          >
            {done ? <Check className="size-5" aria-hidden /> : <Loader2 className="size-5 animate-spin" aria-hidden />}
          </span>
          <h1 className="font-medium">{done ? `Opening “${groupName}”…` : `Creating “${groupName}”…`}</h1>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            {done
              ? "It's ready, with every expense from the calculator."
              : inviting > 0
                ? `Adding ${expenses} and inviting ${inviting} ${inviting === 1 ? "person" : "people"}.`
                : `Adding ${expenses}.`}
          </p>
        </div>
      </div>
    );
  }

  if (phase.kind === "ask-me") {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Which one is you?</h1>
          <p className="text-sm text-muted-foreground">
            Everyone else gets an invite to “{groupName}” as soon as you pick — you&apos;re in it already.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {draft.people.map((p) => (
            <Button
              key={p.id}
              type="button"
              variant="outline"
              className="h-auto justify-start rounded-xl px-3 py-2.5 text-left"
              onClick={() => pickMe(p.id)}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{label(p.id)}</span>
                {p.email?.trim() && (
                  <span className="block truncate text-xs font-normal text-muted-foreground">{p.email.trim()}</span>
                )}
              </span>
            </Button>
          ))}
        </div>
      </div>
    );
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

      {banner && (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm">
          {banner}
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="split-import-name">Group name</Label>
        <Input
          id="split-import-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Goa trip"
          maxLength={DRAFT_NAME_MAX}
        />
        <p className="text-xs text-muted-foreground">Amounts stay in {draft.currency}, as in the calculator.</p>
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
                  setBanner(null);
                }}
                className="accent-foreground"
              />
              <span className="min-w-0 truncate">{label(p.id)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {meId && others.length > 0 && (
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
                      maxLength={DRAFT_EMAIL_MAX}
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

      {leftOut.length > 0 && (
        <p className="rounded-xl border border-dashed px-3 py-2.5 text-sm text-muted-foreground">
          {leftOut.length === 1 ? "One expense doesn't" : `${leftOut.length} expenses don't`} add up and won&apos;t be
          brought in: {leftOut.map((e) => e.title.trim() || "Untitled").join(", ")}. Fix{" "}
          {leftOut.length === 1 ? "it" : "them"} in the{" "}
          <Link href={toolPath("split-bill-calculator")} className="underline underline-offset-4">
            calculator
          </Link>{" "}
          first if you want {leftOut.length === 1 ? "it" : "them"} too.
        </p>
      )}

      {meId && (
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
                  {b.netMinor === 0 ? SETTLED_UP : b.netMinor > 0 ? `is owed ${fmt(b.netMinor)}` : `owes ${fmt(-b.netMinor)}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button type="button" variant="ghost" className="text-muted-foreground" onClick={discard}>
          Discard this group
        </Button>
        <Button type="submit">Create group and invite</Button>
      </div>
    </form>
  );
}

/** "Group created — 4 people invited". Counts people invited, by email or in the app. */
function resultLine(invited: number): string {
  if (invited === 0) return "Group created";
  return `Group created — ${invited} ${invited === 1 ? "person" : "people"} invited`;
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

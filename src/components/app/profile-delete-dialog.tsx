"use client";

import * as React from "react";
import { useTransition } from "react";
import { ArrowRight, Check, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { deleteProfile, getProfileDeletionImpact } from "@/actions/profiles";
import {
  profileDisposalRequest,
  type ProfileDeletionCounts,
  type ProfileDisposalChoice,
} from "@/lib/profile-deletion";
import type { Profile } from "@/db/schema";

type Disposal = ProfileDisposalChoice;
type Impact = ProfileDeletionCounts;

/**
 * "We don't know" is a third state, kept apart from "we know it's zero".
 * Collapsing the two is how a failed count reads as an empty profile — see the
 * note on `handleDelete`.
 */
type ImpactState = { status: "loading" } | { status: "ready"; value: Impact } | { status: "error" };

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Confirms a profile delete and asks what to do with its transactions:
 * delete them with it (the default — deleting a profile usually means the
 * whole thread was a mistake or is over) or move them to another profile.
 *
 * The counts are fetched when the dialog opens rather than passed in, because
 * the sidebar list that renders this doesn't carry them and a destructive
 * default shouldn't be confirmed blind. Until they land the buttons stay
 * disabled — "Delete" with an unknown number behind it is the one click worth
 * making the user wait a beat for — and if they never land the dialog says so
 * and offers a retry rather than guessing.
 */
export function ProfileDeleteDialog({
  profile,
  others,
  open,
  onOpenChange,
}: {
  profile: Pick<Profile, "id" | "name" | "icon">;
  others: Pick<Profile, "id" | "name" | "icon">[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [disposal, setDisposal] = React.useState<Disposal>("delete");
  const [target, setTarget] = React.useState(others[0]?.id ?? "");
  const [impact, setImpact] = React.useState<ImpactState>({ status: "loading" });
  const [changedUnderfoot, setChangedUnderfoot] = React.useState(false);
  const [pending, startTransition] = useTransition();

  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDisposal("delete");
      setTarget(others[0]?.id ?? "");
      setImpact({ status: "loading" });
      setChangedUnderfoot(false);
    }
  }

  const readImpact = React.useCallback(async (): Promise<Impact | null> => {
    try {
      const res = await getProfileDeletionImpact(profile.id);
      if (!res.ok) return null;
      return { transactions: res.transactions, files: res.files, attachments: res.attachments };
    } catch {
      return null;
    }
  }, [profile.id]);

  const load = React.useCallback(() => {
    setImpact({ status: "loading" });
    setChangedUnderfoot(false);
    void readImpact().then((value) =>
      setImpact(value ? { status: "ready", value } : { status: "error" }),
    );
  }, [readImpact]);

  // The open transition above resets to `loading`, so this only resolves it.
  React.useEffect(() => {
    if (!open) return;
    let live = true;
    void readImpact().then((value) => {
      if (live) setImpact(value ? { status: "ready", value } : { status: "error" });
    });
    return () => {
      live = false;
    };
  }, [open, readImpact]);

  // A workspace always keeps one profile, so the last one can't be deleted —
  // and with nowhere else to file them, moving isn't on the table either.
  const canMove = others.length > 0;
  const isOnlyProfile = others.length === 0;
  const counts = impact.status === "ready" ? impact.value : null;
  const hasTransactions = (counts?.transactions ?? 0) > 0;

  /**
   * `profileDisposalRequest` decides what may be asked for — anything the
   * dialog isn't sure of becomes `reject`, the server's refuse-while-not-empty
   * guard. The counts are re-read immediately before that for the other half of
   * the same problem: the dialog can sit open while a co-worker files
   * transactions into this profile, and `delete` would take those too, having
   * never counted or shown them. A changed count re-renders the numbers and
   * costs one more confirm instead.
   */
  function handleDelete() {
    startTransition(async () => {
      if (impact.status !== "ready") return;
      const shown = impact.value;
      let confirmed: Impact | null = null;

      if (shown.transactions > 0) {
        const fresh = await readImpact();
        if (!fresh) {
          setImpact({ status: "error" });
          return;
        }
        if (
          fresh.transactions !== shown.transactions ||
          fresh.files !== shown.files ||
          fresh.attachments !== shown.attachments
        ) {
          setImpact({ status: "ready", value: fresh });
          setChangedUnderfoot(true);
          return;
        }
        confirmed = fresh;
      }

      const res = await deleteProfile(
        profile.id,
        profileDisposalRequest(confirmed, disposal, target),
      );
      if (res.ok) {
        toast.success("Profile deleted");
        onOpenChange(false);
      } else {
        toast.error(res.error);
        // Most refusals here mean the profile isn't what the dialog says it is
        // (something landed in it) — re-read so the numbers stop lying.
        load();
      }
    });
  }

  function chooseDisposal(next: Disposal) {
    setDisposal(next);
    setChangedUnderfoot(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete “{profile.name}”?</DialogTitle>
          <DialogDescription>
            {isOnlyProfile
              ? "This is your only profile, so it can’t be deleted."
              : impact.status === "loading"
                ? "Checking what’s in this profile…"
                : impact.status === "error"
                  ? "Couldn’t check what’s in this profile."
                  : hasTransactions
                    ? `This profile holds ${plural(counts!.transactions, "transaction")}. Choose what happens to them.`
                    : "This profile has no transactions."}
          </DialogDescription>
        </DialogHeader>

        {/* A count we couldn't read is not a count of zero. Saying "no
            transactions" here and deleting on that basis is how a profile of
            1,800 gets destroyed by one click, so the dialog stops instead. */}
        {!isOnlyProfile && impact.status === "error" && (
          <div className="flex items-start justify-between gap-3 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-400">
            <p>
              Nothing has been deleted. Until the profile’s contents can be read, deleting it
              could destroy transactions you were never shown.
            </p>
            <Button variant="outline" size="sm" onClick={load} className="shrink-0">
              <RotateCcw className="size-3" />
              Try again
            </Button>
          </div>
        )}

        {!isOnlyProfile && changedUnderfoot && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            This profile changed while this dialog was open. The numbers below are up to date —
            check them and confirm again.
          </p>
        )}

        {!isOnlyProfile && hasTransactions && (
          <div
            role="radiogroup"
            aria-label="What to do with this profile’s transactions"
            className="grid gap-2"
          >
            <OptionCard
              icon={<Trash2 className="size-4" />}
              label="Delete the transactions"
              description={`All ${plural(counts!.transactions, "transaction")}${
                counts!.attachments > 0
                  ? ` and their ${plural(counts!.attachments, "attachment")}`
                  : ""
              } are permanently removed.`}
              active={disposal === "delete"}
              onSelect={() => chooseDisposal("delete")}
            />
            <OptionCard
              icon={<ArrowRight className="size-4" />}
              label="Move them to another profile"
              description={
                canMove
                  ? `The transactions are re-filed${
                      counts!.attachments > 0
                        ? `, with their ${plural(counts!.attachments, "attachment")},`
                        : ","
                    } and nothing is lost.`
                  : "No other profile to move them to."
              }
              active={disposal === "move"}
              disabled={!canMove}
              onSelect={() => chooseDisposal("move")}
            />
          </div>
        )}

        {hasTransactions && disposal === "move" && canMove && (
          <div className="space-y-1.5">
            <Label htmlFor="move-target">Move transactions to</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger id="move-target" className="w-full">
                <SelectValue placeholder="Choose a profile" />
              </SelectTrigger>
              <SelectContent>
                {others.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.icon ? `${p.icon} ` : ""}
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* The vault isn't part of the choice — it goes with the profile either
            way — so it's stated plainly instead of hidden behind an option. */}
        {!isOnlyProfile && (counts?.files ?? 0) > 0 && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            {plural(counts!.files, "file")} in this profile’s vault will also be deleted.
            {disposal === "move" && " Moving transactions doesn’t move the vault."}
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={
              pending ||
              isOnlyProfile ||
              impact.status !== "ready" ||
              (hasTransactions && disposal === "move" && (!canMove || !target))
            }
          >
            Delete profile
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One choice in the disposal radio group (mirrors the settings radio cards). */
function OptionCard({
  icon,
  label,
  description,
  active,
  disabled,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  active: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
        disabled
          ? "cursor-not-allowed border-dashed opacity-60"
          : active
            ? "border-primary ring-1 ring-primary"
            : "hover:border-foreground/30 hover:bg-muted/40",
      )}
    >
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <span className="flex-1 space-y-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs leading-relaxed text-muted-foreground">
          {description}
        </span>
      </span>
      <span
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
          active ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
        )}
      >
        {active && <Check className="size-3" strokeWidth={3} />}
      </span>
    </button>
  );
}

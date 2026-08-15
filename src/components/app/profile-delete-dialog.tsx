"use client";

import * as React from "react";
import { useTransition } from "react";
import { ArrowRight, Check, Trash2 } from "lucide-react";
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
import type { Profile } from "@/db/schema";

type Disposal = "delete" | "move";
type Impact = { transactions: number; files: number };

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
 * making the user wait a beat for.
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
  const [impact, setImpact] = React.useState<Impact | null>(null);
  const [pending, startTransition] = useTransition();

  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDisposal("delete");
      setTarget(others[0]?.id ?? "");
      setImpact(null);
    }
  }

  React.useEffect(() => {
    if (!open) return;
    let live = true;
    getProfileDeletionImpact(profile.id)
      .then((res) => {
        if (!live) return;
        if (res.ok) setImpact({ transactions: res.transactions, files: res.files });
        // A failed count shouldn't strand the dialog — fall back to zero and
        // let the delete itself surface the real error.
        else setImpact({ transactions: 0, files: 0 });
      })
      .catch(() => {
        if (live) setImpact({ transactions: 0, files: 0 });
      });
    return () => {
      live = false;
    };
  }, [open, profile.id]);

  // A workspace always keeps one profile, so the last one can't be deleted —
  // and with nowhere else to file them, moving isn't on the table either.
  const canMove = others.length > 0;
  const isOnlyProfile = others.length === 0;
  const hasTransactions = (impact?.transactions ?? 0) > 0;

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteProfile(
        profile.id,
        disposal === "move"
          ? { transactions: "move", toProfileId: target }
          : { transactions: "delete" },
      );
      if (res.ok) {
        toast.success("Profile deleted");
        onOpenChange(false);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete “{profile.name}”?</DialogTitle>
          <DialogDescription>
            {isOnlyProfile
              ? "This is your only profile, so it can’t be deleted."
              : impact === null
                ? "Checking what’s in this profile…"
                : hasTransactions
                  ? `This profile holds ${plural(impact.transactions, "transaction")}. Choose what happens to them.`
                  : "This profile has no transactions."}
          </DialogDescription>
        </DialogHeader>

        {!isOnlyProfile && hasTransactions && (
          <div
            role="radiogroup"
            aria-label="What to do with this profile’s transactions"
            className="grid gap-2"
          >
            <OptionCard
              icon={<Trash2 className="size-4" />}
              label="Delete the transactions"
              description={`All ${plural(impact!.transactions, "transaction")} and their attachments are permanently removed.`}
              active={disposal === "delete"}
              onSelect={() => setDisposal("delete")}
            />
            <OptionCard
              icon={<ArrowRight className="size-4" />}
              label="Move them to another profile"
              description={
                canMove
                  ? "The transactions are re-filed, with their attachments, and nothing is lost."
                  : "No other profile to move them to."
              }
              active={disposal === "move"}
              disabled={!canMove}
              onSelect={() => setDisposal("move")}
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
        {!isOnlyProfile && (impact?.files ?? 0) > 0 && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            {plural(impact!.files, "file")} in this profile’s vault will also be deleted.
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
              impact === null ||
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

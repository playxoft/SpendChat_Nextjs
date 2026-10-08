"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateSplitWorkspaceEntry } from "@/actions/split";
import { parseAmountInput } from "@/lib/parse-amount";

export type UpdateEntryTarget = { expenseId: string; title: string; message: string };

/**
 * The second step of "Update my entry", shown only when the entry lives in a
 * workspace with another currency: the server asked (422 `amount_required`)
 * for what the new share cost in that workspace's currency.
 */
export function UpdateEntryDialog({
  target,
  onOpenChange,
  groupId,
  locale,
}: {
  target: UpdateEntryTarget | null;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  locale: string;
}) {
  const router = useRouter();
  const [amount, setAmount] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [shown, setShown] = React.useState<UpdateEntryTarget | null>(null);
  if (target !== shown) {
    setShown(target);
    setAmount("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    const value = amount.trim() ? parseAmountInput(amount, locale) : null;
    if (value === null || value <= 0) {
      toast.error("Enter the amount");
      return;
    }
    setPending(true);
    const res = await updateSplitWorkspaceEntry(groupId, target.expenseId, { amount: value }).finally(() =>
      setPending(false),
    );
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Your entry is up to date");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Update my entry</DialogTitle>
          <DialogDescription>{target?.message}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="split-update-amount">What “{target?.title}” cost you now</Label>
            <Input
              id="split-update-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Update"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

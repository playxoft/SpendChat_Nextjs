"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
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
import { recordSplitSettlement } from "@/actions/split";
import { minorToInputString } from "@/lib/money";
import { parseAmountInput } from "@/lib/parse-amount";

export type SettleTarget = {
  fromMemberId: string;
  fromName: string;
  toMemberId: string;
  toName: string;
  amountMinor: number;
};

/**
 * "Mark as paid": record that one person paid another back outside the app.
 * Starts at the suggested amount; a partial payment is fine.
 */
export function SettleDialog({
  target,
  onOpenChange,
  groupId,
  currency,
  locale,
  today,
}: {
  target: SettleTarget | null;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  currency: string;
  locale: string;
  today: string;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [amount, setAmount] = React.useState("");
  const [date, setDate] = React.useState(today);

  const [shown, setShown] = React.useState<SettleTarget | null>(null);
  if (target !== shown) {
    setShown(target);
    if (target) {
      setAmount(minorToInputString(target.amountMinor, currency, locale));
      setDate(today);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    const value = amount.trim() ? parseAmountInput(amount, locale) : null;
    if (value === null || value <= 0) {
      toast.error("Enter the amount paid");
      return;
    }
    setPending(true);
    const res = await recordSplitSettlement(groupId, {
      fromMemberId: target.fromMemberId,
      toMemberId: target.toMemberId,
      amount: value,
      settledOn: date,
    });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Payment recorded");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Mark as paid</DialogTitle>
          <DialogDescription>
            {target ? `${target.fromName} paid ${target.toName}.` : null} This only records it — no
            money moves through SpendChat.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="split-settle-amount">Amount ({currency})</Label>
              <Input
                id="split-settle-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="split-settle-date">Date</Label>
              <DatePicker id="split-settle-date" value={date} onChange={setDate} locale={locale} className="w-full" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Mark as paid"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

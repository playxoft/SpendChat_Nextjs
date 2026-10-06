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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addSplitShareToWorkspace } from "@/actions/split";
import { formatMoney, toMinorUnits } from "@/lib/money";
import { parseAmountInput } from "@/lib/parse-amount";
import { TRANSACTION_TITLE_MAX } from "@/lib/validation";
import type { SplitExpenseView } from "@/services/split-ledger";

export type ShareWorkspace = {
  name: string;
  currency: string;
  locale: string;
  /** Profiles the viewer can write to in it. */
  profiles: { id: string; name: string; icon: string | null }[];
  /** Its expense categories. */
  categories: { id: string; name: string; icon: string | null }[];
};

const NO_CATEGORY = "none";

/**
 * "Add my share to my workspace": one expense in a profile of the current
 * workspace. In the same currency the share is the amount; in a different one
 * the person types what it cost them in the workspace's currency (we never
 * guess an exchange rate). The server refuses a second add of the same share.
 */
export function AddToWorkspaceDialog({
  expense,
  onOpenChange,
  groupId,
  groupCurrency,
  workspace,
}: {
  expense: SplitExpenseView | null;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  groupCurrency: string;
  workspace: ShareWorkspace;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [profileId, setProfileId] = React.useState(workspace.profiles[0]?.id ?? "");
  const [categoryId, setCategoryId] = React.useState(NO_CATEGORY);
  const [title, setTitle] = React.useState("");
  const [date, setDate] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const sameCurrency = groupCurrency === workspace.currency;

  const [shown, setShown] = React.useState<SplitExpenseView | null>(null);
  if (expense !== shown) {
    setShown(expense);
    if (expense) {
      setProfileId(workspace.profiles[0]?.id ?? "");
      setCategoryId(NO_CATEGORY);
      setTitle(expense.title);
      setDate(expense.occurredOn);
      setAmount("");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!expense) return;
    let converted: number | undefined;
    if (!sameCurrency) {
      const v = amount.trim() ? parseAmountInput(amount, workspace.locale) : null;
      if (v === null || v <= 0) {
        toast.error(`Enter what it cost you in ${workspace.currency}`);
        return;
      }
      if (toMinorUnits(v, workspace.currency) <= 0) {
        toast.error(`Amount is too small for ${workspace.currency}`);
        return;
      }
      converted = v;
    }
    setPending(true);
    const res = await addSplitShareToWorkspace(groupId, expense.id, {
      profileId,
      categoryId: categoryId === NO_CATEGORY ? null : categoryId,
      title: title.trim() || undefined,
      occurredOn: date,
      amount: converted,
    }).finally(() => setPending(false));
    if (!res.ok) {
      toast.error(res.error);
      if (res.code === "conflict") {
        onOpenChange(false);
        router.refresh();
      }
      return;
    }
    toast.success(`Added to ${workspace.name}`);
    onOpenChange(false);
    router.refresh();
  }

  const share = expense?.myShare?.amountMinor ?? 0;

  return (
    <Dialog open={expense !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add to my workspace</DialogTitle>
          <DialogDescription>
            Your share, {formatMoney(share, groupCurrency, workspace.locale)}, goes into{" "}
            {workspace.name} as one expense. Press G to switch workspace first.
          </DialogDescription>
        </DialogHeader>
        {workspace.profiles.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You can&apos;t add entries in {workspace.name}. Switch to a workspace where you can.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="split-add-profile">Profile</Label>
              <Select value={profileId} onValueChange={setProfileId}>
                <SelectTrigger id="split-add-profile" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {workspace.profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.icon ? `${p.icon} ` : ""}
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="split-add-category">Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger id="split-add-category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CATEGORY}>No category</SelectItem>
                  {workspace.categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.icon ? `${c.icon} ` : ""}
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="split-add-title">Title</Label>
                <Input
                  id="split-add-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={TRANSACTION_TITLE_MAX}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="split-add-date">Date</Label>
                <DatePicker id="split-add-date" value={date} onChange={setDate} locale={workspace.locale} className="w-full" />
              </div>
            </div>
            {!sameCurrency && (
              <div className="space-y-1.5">
                <Label htmlFor="split-add-amount">What it cost you ({workspace.currency})</Label>
                <Input
                  id="split-add-amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  The group uses {groupCurrency}; {workspace.name} keeps its books in{" "}
                  {workspace.currency}. Enter the amount you actually paid.
                </p>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !profileId}>
                {pending ? "Adding…" : "Add expense"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
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
import { amountToneClass } from "./transaction-bubble";
import { deleteTransaction } from "@/actions/transactions";
import { formatMoney, signedMinor } from "@/lib/money";
import { formatDateLabel } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { TransactionRow } from "@/lib/queries";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right break-words">{children}</span>
    </div>
  );
}

export function TransactionDetailDialog({
  row,
  currency,
  locale,
  open,
  onOpenChange,
  onEdit,
}: {
  row: TransactionRow;
  currency: string;
  locale: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onEdit: () => void;
}) {
  const [pending, startTransition] = useTransition();

  const amountLabel = formatMoney(
    signedMinor(row.type, row.amountMinor),
    currency,
    locale,
    { signed: true },
  );

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteTransaction(row.id);
      if (res.ok) {
        toast.success("Transaction deleted");
        onOpenChange(false);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeOnOutsideClick className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="sr-only">Transaction details</DialogTitle>
          <DialogDescription className="sr-only">
            Full details for this transaction.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-xl">
            {row.categoryIcon ?? "💸"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{row.title || row.categoryName || "Transaction"}</p>
            <p className="text-xs text-muted-foreground capitalize">{row.type}</p>
          </div>
          <p
            className={cn(
              "shrink-0 text-lg font-semibold tabular-nums",
              amountToneClass(row.type),
            )}
          >
            {amountLabel}
          </p>
        </div>

        {row.description ? (
          <p className="max-h-48 overflow-y-auto rounded-lg bg-muted/50 p-3 text-sm break-words whitespace-pre-wrap">
            {row.description}
          </p>
        ) : null}

        <div className="divide-y">
          <Field label="Category">
            {row.categoryIcon ? `${row.categoryIcon} ` : ""}
            {row.categoryName ?? "Uncategorized"}
          </Field>
          <Field label="Profile">
            {row.profileIcon ? `${row.profileIcon} ` : ""}
            {row.profileName ?? "—"}
          </Field>
          <Field label="Date">{formatDateLabel(row.occurredOn, locale)}</Field>
        </div>

        <DialogFooter className="flex-row justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Pencil className="size-4" /> Edit
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={pending}
          >
            <Trash2 className="size-4" /> Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

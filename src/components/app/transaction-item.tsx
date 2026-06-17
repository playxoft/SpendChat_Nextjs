"use client";

import { useState, useTransition } from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TransactionBubble } from "./transaction-bubble";
import { TransactionDialog } from "./transaction-dialog";
import { deleteTransaction } from "@/actions/transactions";
import { formatMoney, minorToInputString, signedMinor } from "@/lib/money";
import type { Category } from "@/db/schema";
import type { TransactionRow } from "@/lib/queries";

export function TransactionItem({
  row,
  currency,
  locale,
  categories,
  today,
  timeLabel,
}: {
  row: TransactionRow;
  currency: string;
  locale: string;
  categories: Pick<Category, "id" | "name" | "kind" | "icon">[];
  today: string;
  timeLabel: string;
}) {
  const [editing, setEditing] = useState(false);
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
      if (res.ok) toast.success("Transaction deleted");
      else toast.error(res.error);
    });
  }

  return (
    <>
      <TransactionBubble
        type={row.type}
        amountLabel={amountLabel}
        note={row.note}
        categoryName={row.categoryName}
        categoryIcon={row.categoryIcon}
        timeLabel={timeLabel}
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Transaction options"
                className="size-6 opacity-60 transition-opacity md:opacity-0 md:group-hover:opacity-100"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="cursor-pointer" onClick={() => setEditing(true)}>
                <Pencil className="size-4" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer text-destructive focus:text-destructive"
                onClick={handleDelete}
                disabled={pending}
              >
                <Trash2 className="size-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
      <TransactionDialog
        mode="edit"
        open={editing}
        onOpenChange={setEditing}
        categories={categories}
        currency={currency}
        today={today}
        defaultValues={{
          id: row.id,
          type: row.type,
          amount: minorToInputString(row.amountMinor, currency),
          categoryId: row.categoryId,
          note: row.note ?? "",
          occurredOn: row.occurredOn,
        }}
      />
    </>
  );
}

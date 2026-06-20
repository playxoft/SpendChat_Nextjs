"use client";

import { useState, useTransition } from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TransactionDialog } from "./transaction-dialog";
import { amountToneClass } from "./transaction-bubble";
import { deleteTransaction } from "@/actions/transactions";
import { formatMoney, minorToInputString, signedMinor } from "@/lib/money";
import { formatDateLabel } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { Category } from "@/db/schema";
import type { TransactionRow } from "@/lib/queries";

type SharedProps = {
  currency: string;
  locale: string;
  categories: Pick<Category, "id" | "name" | "kind" | "icon">[];
  today: string;
};

export function TransactionsTable({
  rows,
  ...shared
}: SharedProps & { rows: TransactionRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border py-16 text-center text-sm text-muted-foreground">
        No transactions match these filters.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border print-area">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-32">Date</TableHead>
            <TableHead>Category</TableHead>
            <TableHead className="hidden sm:table-cell">Note</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="w-10 print:hidden" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <Row key={r.id} row={r} {...shared} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function Row({
  row,
  currency,
  locale,
  categories,
  today,
}: SharedProps & { row: TransactionRow }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  const amountLabel = formatMoney(signedMinor(row.type, row.amountMinor), currency, locale, {
    signed: true,
  });

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteTransaction(row.id);
      if (res.ok) toast.success("Transaction deleted");
      else toast.error(res.error);
    });
  }

  return (
    <TableRow>
      <TableCell className="whitespace-nowrap text-muted-foreground">
        {formatDateLabel(row.occurredOn, locale)}
      </TableCell>
      <TableCell>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden>{row.categoryIcon ?? "💸"}</span>
          {row.categoryName ?? "Uncategorized"}
        </span>
      </TableCell>
      <TableCell className="hidden max-w-50 truncate text-muted-foreground sm:table-cell">
        {row.note ?? ""}
      </TableCell>
      <TableCell
        className={cn("text-right font-medium tabular-nums", amountToneClass(row.type))}
      >
        {amountLabel}
      </TableCell>
      <TableCell className="print:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7" aria-label="Row options">
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
            profileId: row.profileId,
            title: row.title ?? "",
            description: row.description ?? "",
            occurredOn: row.occurredOn,
          }}
        />
      </TableCell>
    </TableRow>
  );
}

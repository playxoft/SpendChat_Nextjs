"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TransactionDialog } from "./transaction-dialog";
import { TransactionDetailDialog } from "./transaction-detail-dialog";
import { amountToneClass } from "./transaction-bubble";
import { formatMoney, minorToInputString, signedMinor } from "@/lib/money";
import { formatDateLabel } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { Category, Profile } from "@/db/schema";
import type { TransactionRow } from "@/lib/queries";

type SharedProps = {
  currency: string;
  locale: string;
  categories: Pick<Category, "id" | "name" | "kind" | "icon">[];
  profiles: Pick<Profile, "id" | "name" | "icon">[];
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
            <TableHead>Title</TableHead>
            <TableHead className="hidden md:table-cell">Description</TableHead>
            <TableHead className="text-right">Amount</TableHead>
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
  profiles,
  today,
}: SharedProps & { row: TransactionRow }) {
  const [editing, setEditing] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  const amountLabel = formatMoney(signedMinor(row.type, row.amountMinor), currency, locale, {
    signed: true,
  });

  return (
    <>
      <TableRow
        onClick={() => setDetailOpen(true)}
        className="cursor-pointer"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter") setDetailOpen(true);
        }}
      >
        <TableCell className="whitespace-nowrap text-muted-foreground">
          {formatDateLabel(row.occurredOn, locale)}
        </TableCell>
        <TableCell>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden>{row.categoryIcon ?? "💸"}</span>
            {row.categoryName ?? "Uncategorized"}
          </span>
        </TableCell>
        <TableCell className="max-w-40 truncate">{row.title ?? ""}</TableCell>
        <TableCell className="hidden max-w-56 truncate text-muted-foreground md:table-cell">
          {row.description ?? ""}
        </TableCell>
        <TableCell
          className={cn("text-right font-medium tabular-nums", amountToneClass(row.type))}
        >
          {amountLabel}
        </TableCell>
      </TableRow>

      <TransactionDetailDialog
        row={row}
        currency={currency}
        locale={locale}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onEdit={() => {
          setDetailOpen(false);
          setEditing(true);
        }}
      />

      <TransactionDialog
        mode="edit"
        open={editing}
        onOpenChange={setEditing}
        categories={categories}
        profiles={profiles}
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
    </>
  );
}

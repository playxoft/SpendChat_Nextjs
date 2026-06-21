"use client";

import { useState } from "react";
import { TransactionBubble } from "./transaction-bubble";
import { TransactionDialog } from "./transaction-dialog";
import { TransactionDetailDialog } from "./transaction-detail-dialog";
import { formatMoney, minorToInputString, signedMinor } from "@/lib/money";
import type { Category, Profile } from "@/db/schema";
import type { TransactionRow } from "@/lib/queries";

export function TransactionItem({
  row,
  currency,
  locale,
  categories,
  profiles = [],
  today,
  timeLabel,
}: {
  row: TransactionRow;
  currency: string;
  locale: string;
  categories: Pick<Category, "id" | "name" | "kind" | "icon">[];
  profiles?: Pick<Profile, "id" | "name" | "icon">[];
  today: string;
  timeLabel: string;
}) {
  const [editing, setEditing] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  const amountLabel = formatMoney(
    signedMinor(row.type, row.amountMinor),
    currency,
    locale,
    { signed: true },
  );

  return (
    <>
      <TransactionBubble
        type={row.type}
        amountLabel={amountLabel}
        title={row.title}
        description={row.description}
        categoryName={row.categoryName}
        categoryIcon={row.categoryIcon}
        timeLabel={timeLabel}
        onActivate={() => setDetailOpen(true)}
      />

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

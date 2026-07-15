"use client";

import { useState } from "react";
import { TransactionBubble, bubbleAmountLabel } from "./transaction-bubble";
import { TransactionDialog } from "./transaction-dialog";
import { minorToInputString } from "@/lib/money";
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

  const amountLabel = bubbleAmountLabel(row.type, row.amountMinor, currency, locale);

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
        onActivate={() => setEditing(true)}
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

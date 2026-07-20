"use client";

import { useState } from "react";
import { TransactionBubble, bubbleAmountLabel } from "./transaction-bubble";
import { TransactionDialog } from "./transaction-dialog";
import { useOptimisticRow } from "@/hooks/use-optimistic-row";
import { authorColorClass, authorDisplayName } from "@/lib/author-color";
import { minorToInputString } from "@/lib/money";
import type { Category, Profile } from "@/db/schema";
import type { TransactionRow } from "@/lib/queries";

export function TransactionItem({
  row: serverRow,
  currency,
  locale,
  categories,
  profiles = [],
  today,
  timeLabel,
  showAuthor = false,
}: {
  row: TransactionRow;
  currency: string;
  locale: string;
  categories: Pick<Category, "id" | "name" | "kind" | "icon">[];
  profiles?: Pick<Profile, "id" | "name" | "icon">[];
  today: string;
  timeLabel: string;
  /** Shared workspaces only: label each bubble with its author. */
  showAuthor?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  // An edit patches the bubble / a delete hides it in the same commit as the
  // toast, then the server revalidation reconciles.
  const { row, removed, patch, remove } = useOptimisticRow(serverRow);

  if (removed) return null;

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
        authorName={showAuthor ? authorDisplayName(row.userName, row.userEmail) : undefined}
        authorColorClass={showAuthor ? authorColorClass(row.userId) : undefined}
        onActivate={() => setEditing(true)}
      />

      <TransactionDialog
        mode="edit"
        open={editing}
        onOpenChange={setEditing}
        onSaved={patch}
        onDeleted={remove}
        categories={categories}
        profiles={profiles}
        currency={currency}
        locale={locale}
        today={today}
        defaultValues={{
          id: row.id,
          type: row.type,
          amount: minorToInputString(row.amountMinor, currency, locale),
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

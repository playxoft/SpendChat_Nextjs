"use client";

import { memo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, CircleX, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { deleteTransaction } from "@/actions/transactions";
import { toastMovedToTrash } from "./trash/trash-toast";
import { TransactionBubble, bubbleAmountLabel } from "./transaction-bubble";
import { TransactionDialog } from "./transaction-dialog";
import { useAttachmentViewer } from "./attachments/attachment-viewer";
import { useOptimisticRow } from "@/hooks/use-optimistic-row";
import { authorColorClass, authorDisplayName } from "@/lib/author-color";
import { minorToInputString } from "@/lib/money";
import type { Category, Profile } from "@/db/schema";
import type { TransactionRow } from "@/lib/queries";
import type { TxnTagDTO } from "@/lib/tags";

/**
 * One message in the feed. Memoised: a multi-select click changes one bubble,
 * and the feed passes plain values plus a stable `onToggleSelect` so the rest
 * — each with its menu, dialogs and measured tags — skip the render.
 */
export const TransactionItem = memo(function TransactionItem({
  row: serverRow,
  currency,
  locale,
  categories,
  profiles = [],
  tags,
  today,
  timeLabel,
  showAuthor = false,
  selected = false,
  selecting = false,
  onToggleSelect,
}: {
  row: TransactionRow;
  currency: string;
  locale: string;
  categories: Pick<Category, "id" | "name" | "kind" | "icon">[];
  profiles?: Pick<Profile, "id" | "name" | "icon">[];
  /** The workspace's tags, for the edit dialog's picker. */
  tags: TxnTagDTO[];
  today: string;
  timeLabel: string;
  /** Shared workspaces only: label each bubble with its author. */
  showAuthor?: boolean;
  /** Multi-select: this bubble is picked. */
  selected?: boolean;
  /** Anything in the feed is picked. */
  selecting?: boolean;
  /** The feed's toggle, for editors; absent leaves the bubble as it was (no
   *  ring, no menu). */
  onToggleSelect?: (id: string, range: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // The card, so focus can go back to it when the delete dialog closes — the
  // menu item that opened it is gone by then.
  const cardRef = useRef<HTMLDivElement>(null);
  const toggle = onToggleSelect ? (range: boolean) => onToggleSelect(row.id, range) : undefined;
  const openViewer = useAttachmentViewer();
  const router = useRouter();
  // An edit patches the bubble / a delete hides it in the same commit as the
  // toast, then the server revalidation reconciles.
  const { row, removed, patch, remove } = useOptimisticRow(serverRow);

  if (removed) return null;

  async function handleDelete() {
    setDeleting(true);
    const res = await deleteTransaction(row.id);
    setDeleting(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setConfirmingDelete(false);
    // Gone in the same commit as the toast, as the edit dialog's delete does.
    remove();
    toastMovedToTrash("Moved to trash", { transactionIds: [row.id] }, {
      onRestored: () => router.refresh(),
    });
  }

  const amountLabel = bubbleAmountLabel(row.type, row.amountMinor, currency, locale);
  const files = row.attachments.map((a) => ({
    id: a.id,
    fileName: a.fileName,
    contentType: a.contentType,
    label: a.label,
    kind: a.kind,
    sizeBytes: a.sizeBytes,
    hasThumbnail: a.hasThumbnail,
  }));

  return (
    <>
      <TransactionBubble
        type={row.type}
        amountLabel={amountLabel}
        title={row.title}
        description={row.description}
        categoryName={row.categoryName}
        categoryIcon={row.categoryIcon}
        tags={row.tags}
        timeLabel={timeLabel}
        attachments={files}
        onOpenAttachment={(a) =>
          a.id && openViewer({ id: a.id, fileName: a.fileName, contentType: a.contentType, label: a.label })
        }
        authorName={showAuthor ? authorDisplayName(row.userName, row.userEmail) : undefined}
        authorColorClass={showAuthor ? authorColorClass(row.userId) : undefined}
        // While a selection is under way a click picks, like the ring does;
        // otherwise it opens the row for editing.
        onActivate={(e) => (selecting && toggle ? toggle(!!e?.shiftKey) : setEditing(true))}
        selected={selected}
        selecting={selecting}
        onToggleSelect={toggle}
        // Right-click (or a long press on a phone — Radix opens the same menu
        // for a held touch) offers the row's three actions. Editors only: a
        // viewer gets no `onToggleSelect`, and keeps the browser's own menu.
        renderCard={
          toggle
            ? (card) => (
                <ContextMenu>
                  <ContextMenuTrigger asChild ref={cardRef}>
                    {card}
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-44">
                    <ContextMenuItem onSelect={() => setEditing(true)}>
                      <Pencil /> Edit
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => toggle(false)}>
                      {selected ? <CircleX /> : <CircleCheck />}
                      {selected ? "Deselect" : "Select"}
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem variant="destructive" onSelect={() => setConfirmingDelete(true)}>
                      <Trash2 /> Delete
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              )
            : undefined
        }
      />

      <AlertDialog open={confirmingDelete} onOpenChange={(o) => !deleting && setConfirmingDelete(o)}>
        <AlertDialogContent
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            cardRef.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              It moves to the trash with any files attached to it, and your balance updates.
              You can restore it for 30 days.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              // Kept open until the delete lands, so a failure is reported
              // here rather than after the dialog has already said it worked.
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              className={buttonVariants({ variant: "destructive" })}
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TransactionDialog
        mode="edit"
        open={editing}
        onOpenChange={setEditing}
        onSaved={patch}
        onDeleted={remove}
        categories={categories}
        profiles={profiles}
        tags={tags}
        currency={currency}
        locale={locale}
        today={today}
        attachments={row.attachments}
        defaultValues={{
          id: row.id,
          type: row.type,
          amount: minorToInputString(row.amountMinor, currency, locale),
          categoryId: row.categoryId,
          profileId: row.profileId,
          title: row.title ?? "",
          description: row.description ?? "",
          occurredOn: row.occurredOn,
          tagIds: row.tags.map((t) => t.id),
        }}
      />
    </>
  );
});

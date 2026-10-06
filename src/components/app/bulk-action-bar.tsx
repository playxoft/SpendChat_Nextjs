"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, FolderInput, Hash, Loader2, Minus, Shapes, Trash2, X } from "lucide-react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteTransactions, updateTransactions } from "@/actions/transactions";
import { toastMovedToTrash } from "./trash/trash-toast";
import {
  BULK_TRANSACTIONS_MAX,
  TAGS_PER_TRANSACTION_MAX,
  type BulkUpdateTransactionsInput,
} from "@/lib/validation";
import { isTypingTarget } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import { TagChip } from "./tags/tag-chip";
import type { Category, Profile } from "@/db/schema";
import type { TransactionRow } from "@/lib/queries";
import type { TxnTagDTO } from "@/lib/tags";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Split into requests the server accepts — "Select all" over a long scroll
 *  can pick more rows than one bulk request takes. */
function batches<T>(items: T[], size = BULK_TRANSACTIONS_MAX): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * The bar that replaces the composer while transactions are selected — in the
 * tracker feed and the transactions table alike. Each action applies to every
 * selected row in one request (`deleteTransactions` / `updateTransactions`),
 * and the list owning the selection patches itself from what comes back.
 *
 * Fixed to the bottom of the main column, where the composer sits (the sidebar
 * is `w-60` from `md`, and the mobile tab bar is `h-16`), above it in the
 * stack: on the tracker it covers the composer — you aren't writing while
 * you're selecting — and on the table it floats over the list's foot, which
 * pads itself to clear it.
 *
 * Escape clears the selection, unless a menu or dialog was what it closed.
 */
export function BulkActionBar({
  selected,
  categories,
  profiles,
  tags,
  totalLoaded,
  onSelectAll,
  onClear,
  onDeleted,
  onUpdated,
}: {
  selected: TransactionRow[];
  categories: Pick<Category, "id" | "name" | "kind" | "icon">[];
  profiles: Pick<Profile, "id" | "name" | "icon">[];
  tags: TxnTagDTO[];
  /** Rows on screen, for the "Select all" offer. */
  totalLoaded: number;
  onSelectAll: () => void;
  onClear: () => void;
  onDeleted: (ids: string[]) => void;
  onUpdated: (rows: TransactionRow[]) => void;
}) {
  // Busy for the request only — not a transition, which would also wait out
  // the page refresh the action's revalidation triggers. The rows are already
  // patched from the result by then, so there's nothing left to wait for.
  const [pending, setPending] = useState(false);
  const router = useRouter();
  async function run(task: () => Promise<void>) {
    setPending(true);
    try {
      await task();
    } finally {
      setPending(false);
    }
  }
  const count = selected.length;

  useEffect(() => {
    if (count === 0) return;
    const onKey = (e: KeyboardEvent) => {
      // A Radix layer that Escape just closed has already called
      // `preventDefault` (it listens in the capture phase), so this only
      // fires for an Escape that had nothing else to close. In a text field
      // Escape belongs to the field (the search box clears itself on it).
      if (e.key === "Escape" && !e.defaultPrevented && !isTypingTarget(e.target)) onClear();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count, onClear]);

  // Announced from a region that's always mounted: one that appears with its
  // text already in it (the bar, on the first pick) often isn't read at all.
  const announcement = (
    <span role="status" className="sr-only">
      {count > 0 ? `${count} selected` : ""}
    </span>
  );
  if (count === 0) return announcement;
  const ids = selected.map((r) => r.id);

  function apply(change: Omit<BulkUpdateTransactionsInput, "ids">, done: (n: number) => string) {
    void run(async () => {
      // In batches the server accepts, one after another. A failing batch stops
      // the rest, and the ones already through are still applied to the list.
      const changed: TransactionRow[] = [];
      let wrongKind = 0;
      let tagLimit = 0;
      let noAccess = 0;
      for (const part of batches(ids)) {
        const res = await updateTransactions({ ids: part, ...change });
        if (!res.ok) {
          if (changed.length > 0) onUpdated(changed);
          toast.error(res.error);
          return;
        }
        changed.push(...res.rows);
        wrongKind += res.wrongKind;
        tagLimit += res.tagLimit;
        noAccess += res.noAccess;
      }
      onUpdated(changed);
      // What didn't take the change, and why — a quiet second line rather than
      // a warning, because the rest of the selection did go through.
      const notes = [
        wrongKind > 0 &&
          `${plural(wrongKind, "transaction")} of the other type kept ${wrongKind === 1 ? "its" : "their"} category`,
        tagLimit > 0 && `${plural(tagLimit, "transaction")} already ${tagLimit === 1 ? "has" : "have"} ${TAGS_PER_TRANSACTION_MAX} tags`,
        noAccess > 0 && `${plural(noAccess, "transaction")} you can't edit ${noAccess === 1 ? "was" : "were"} skipped`,
      ].filter(Boolean);
      toast.success(done(changed.length), notes.length ? { description: notes.join(" · ") } : undefined);
    });
  }

  function remove() {
    void run(async () => {
      const deletedIds: string[] = [];
      let skipped = 0;
      for (const part of batches(ids)) {
        const res = await deleteTransactions(part);
        if (!res.ok) {
          if (deletedIds.length > 0) onDeleted(deletedIds);
          toast.error(res.error);
          return;
        }
        deletedIds.push(...res.deletedIds);
        skipped += res.skipped;
      }
      onDeleted(deletedIds);
      toastMovedToTrash(
        `Moved ${plural(deletedIds.length, "transaction")} to trash`,
        { transactionIds: deletedIds },
        {
          description:
            skipped > 0
              ? `${plural(skipped, "transaction")} you can't delete ${skipped === 1 ? "was" : "were"} kept. You can restore the rest from the trash for 30 days.`
              : `You can restore ${deletedIds.length === 1 ? "it" : "them"} from the trash for 30 days.`,
          onRestored: () => router.refresh(),
        },
      );
    });
  }

  // Which kinds are in the selection decides which categories are offered: a
  // category only lands on rows of its own kind, so an all-expense selection
  // has no use for the income list.
  const kinds = new Set(selected.map((r) => r.type));
  const sameCategory = (id: string | null) => selected.every((r) => (r.categoryId ?? null) === id);
  const inProfile = (id: string) => selected.every((r) => r.profileId === id);
  const tagState = (id: string): "all" | "some" | "none" => {
    const n = selected.filter((r) => r.tags.some((t) => t.id === id)).length;
    return n === 0 ? "none" : n === count ? "all" : "some";
  };

  return (
    <>
      {announcement}
      <div
        role="region"
        aria-label="Selected transactions"
        className="fixed inset-x-0 bottom-16 z-30 bg-background px-3 pt-2 pb-2 md:bottom-0 md:left-60 print:hidden"
      >
        <div className="mx-auto flex max-w-3xl animate-rise flex-wrap items-center gap-1.5 rounded-2xl border bg-background p-2 shadow-lg">
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Clear selection" onClick={onClear}>
            <X className="size-4" />
          </Button>
          <span className="text-sm font-medium tabular-nums">{count} selected</span>
          {count < totalLoaded ? (
            <Button type="button" variant="link" size="sm" className="px-1" onClick={onSelectAll}>
              Select all {totalLoaded}
            </Button>
          ) : null}
          {pending ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Working" /> : null}

          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {profiles.length > 1 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm" disabled={pending}>
                    <FolderInput className="size-4" />
                    <span className="hidden sm:inline">Move</span>
                    <ChevronDown className="size-3.5 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Move to profile</DropdownMenuLabel>
                  {profiles.map((p) => (
                    <DropdownMenuItem
                      key={p.id}
                      onSelect={() => apply({ profileId: p.id }, (n) => `Moved ${plural(n, "transaction")} to ${p.name}`)}
                    >
                      <span aria-hidden>{p.icon ?? "👤"}</span>
                      <span className="truncate">{p.name}</span>
                      {inProfile(p.id) ? <Check className="ml-auto size-4 opacity-60" /> : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm" disabled={pending}>
                  <Shapes className="size-4" />
                  <span className="hidden sm:inline">Category</span>
                  <ChevronDown className="size-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-80 w-60 overflow-y-auto">
                <DropdownMenuItem
                  onSelect={() => apply({ categoryId: null }, (n) => `Cleared the category on ${plural(n, "transaction")}`)}
                >
                  <span aria-hidden>🏷️</span> No category
                  {sameCategory(null) ? <Check className="ml-auto size-4 opacity-60" /> : null}
                </DropdownMenuItem>
                {(["expense", "income"] as const)
                  .filter((k) => kinds.has(k))
                  .map((kind) => (
                    <div key={kind}>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-xs text-muted-foreground">
                        {kind === "expense" ? "Expense" : "Income"}
                        {kinds.size > 1 ? " — applies to those only" : ""}
                      </DropdownMenuLabel>
                      {categories
                        .filter((c) => c.kind === kind)
                        .map((c) => (
                          <DropdownMenuItem
                            key={c.id}
                            onSelect={() =>
                              apply({ categoryId: c.id }, (n) => `Set ${c.name} on ${plural(n, "transaction")}`)
                            }
                          >
                            <span aria-hidden>{c.icon ?? "🏷️"}</span>
                            <span className="truncate">{c.name}</span>
                            {sameCategory(c.id) ? <Check className="ml-auto size-4 opacity-60" /> : null}
                          </DropdownMenuItem>
                        ))}
                    </div>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm" disabled={pending || tags.length === 0}>
                  <Hash className="size-4" />
                  <span className="hidden sm:inline">Tags</span>
                  <ChevronDown className="size-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  Tick to add to all, untick to remove from all
                </DropdownMenuLabel>
                <div className="max-h-64 overflow-y-auto">
                  {tags.map((tag) => {
                    const state = tagState(tag.id);
                    return (
                      <DropdownMenuItem
                        key={tag.id}
                        role="menuitemcheckbox"
                        aria-checked={state === "all" ? true : state === "some" ? "mixed" : false}
                        aria-disabled={pending || undefined}
                        // Stays open: tagging is usually more than one tick.
                        onSelect={(e) => {
                          e.preventDefault();
                          if (pending) return;
                          if (state === "all") {
                            apply({ removeTagIds: [tag.id] }, (n) => `Removed ${tag.name} from ${plural(n, "transaction")}`);
                          } else {
                            apply({ addTagIds: [tag.id] }, (n) => `Added ${tag.name} to ${plural(n, "transaction")}`);
                          }
                        }}
                        className={cn("gap-2 py-1.5", pending && "opacity-60")}
                      >
                        <span
                          className={cn(
                            "flex size-4 shrink-0 items-center justify-center rounded border",
                            state !== "none" && "border-transparent",
                          )}
                          style={state !== "none" ? { backgroundColor: tag.color } : undefined}
                        >
                          {state === "all" ? <Check className="size-3 text-white" aria-hidden /> : null}
                          {state === "some" ? <Minus className="size-3 text-white" aria-hidden /> : null}
                        </span>
                        <TagChip tag={tag} className="text-xs" />
                      </DropdownMenuItem>
                    );
                  })}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="destructive" size="sm" disabled={pending}>
                  <Trash2 className="size-4" />
                  <span className="hidden sm:inline">Delete</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {plural(count, "transaction")}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    They move to the trash with any files attached to them, and your balance
                    updates. You can restore them for 30 days.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={remove} className={buttonVariants({ variant: "destructive" })}>
                    Delete {count}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>
    </>
  );
}

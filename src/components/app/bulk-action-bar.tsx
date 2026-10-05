"use client";

import { useEffect, useState } from "react";
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
import { TAGS_PER_TRANSACTION_MAX, type BulkUpdateTransactionsInput } from "@/lib/validation";
import { cn } from "@/lib/utils";
import { TagChip } from "./tags/tag-chip";
import type { Category, Profile } from "@/db/schema";
import type { TransactionRow } from "@/lib/queries";
import type { TxnTagDTO } from "@/lib/tags";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

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
      // fires for an Escape that had nothing else to close.
      if (e.key === "Escape" && !e.defaultPrevented) onClear();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count, onClear]);

  if (count === 0) return null;
  const ids = selected.map((r) => r.id);

  function apply(change: Omit<BulkUpdateTransactionsInput, "ids">, done: (n: number) => string) {
    void run(async () => {
      const res = await updateTransactions({ ids, ...change });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      onUpdated(res.rows);
      // What didn't take the change, and why — a quiet second line rather than
      // a warning, because the rest of the selection did go through.
      const notes = [
        res.wrongKind > 0 &&
          `${plural(res.wrongKind, "transaction")} of the other type kept ${res.wrongKind === 1 ? "its" : "their"} category`,
        res.tagLimit > 0 && `${plural(res.tagLimit, "transaction")} already ${res.tagLimit === 1 ? "has" : "have"} ${TAGS_PER_TRANSACTION_MAX} tags`,
        res.noAccess > 0 && `${plural(res.noAccess, "transaction")} you can't edit ${res.noAccess === 1 ? "was" : "were"} skipped`,
      ].filter(Boolean);
      toast.success(done(res.rows.length), notes.length ? { description: notes.join(" · ") } : undefined);
    });
  }

  function remove() {
    void run(async () => {
      const res = await deleteTransactions(ids);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      onDeleted(res.deletedIds);
      toast.success(
        `Deleted ${plural(res.deletedIds.length, "transaction")}`,
        res.skipped > 0
          ? { description: `${plural(res.skipped, "transaction")} you can't delete ${res.skipped === 1 ? "was" : "were"} kept` }
          : undefined,
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
    <div
      role="region"
      aria-label="Selected transactions"
      className="fixed inset-x-0 bottom-16 z-30 bg-background px-3 pt-2 pb-2 md:bottom-0 md:left-60 print:hidden"
    >
      <div className="mx-auto flex max-w-3xl animate-rise flex-wrap items-center gap-1.5 rounded-2xl border bg-background p-2 shadow-lg">
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Clear selection" onClick={onClear}>
          <X className="size-4" />
        </Button>
        <span className="text-sm font-medium tabular-nums" aria-live="polite">
          {count} selected
        </span>
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
                  They’re removed for good, along with any files attached to them, and your balance
                  updates. This can’t be undone.
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
  );
}

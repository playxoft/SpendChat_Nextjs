"use client";

import { useState } from "react";
import { Check, ChevronDown, Plus, Tag as TagIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { TAGS_PER_TRANSACTION_MAX } from "@/lib/validation";
import type { TxnTagDTO } from "@/lib/tags";
import { cn } from "@/lib/utils";
import { TagChip } from "./tag-chip";
import { TagFormDialog } from "./tag-form-dialog";

/**
 * Pick several tags from the workspace's list — the transactions page's filter
 * and the edit dialog's tag field are the same control with different labels.
 *
 * A `DropdownMenu` rather than a `Popover`, for the reason the vault's picker
 * already documents: it dismisses on any outside click, including while nested
 * inside a modal dialog, which is exactly where the edit-dialog copy lives.
 *
 * No search box inside the list, deliberately. The fast way to reach a tag by
 * name is the composer's "#" picker, which is type-ahead by construction; this
 * one is a browse-and-tick list capped at `TAGS_PER_WORKSPACE_MAX`, and it
 * matches the vault picker beside it. A filter box here is a small addition if
 * workspaces turn out to live near the ceiling.
 */
export function TagSelect({
  tags,
  value,
  onChange,
  onCreated,
  canCreate = false,
  placeholder = "Add tags…",
  triggerLabel,
  className,
  align = "start",
  disabled = false,
  max = TAGS_PER_TRANSACTION_MAX,
}: {
  /** Every tag in the workspace, already name-ordered by the server. */
  tags: TxnTagDTO[];
  /** Selected ids, in pick order. */
  value: string[];
  onChange: (ids: string[]) => void;
  /** Fired when a tag is created from the "Create new tag" row, so a caller
   *  that renders its own chips can resolve the new id before the server list
   *  catches up (the composer keeps the same kind of local list). */
  onCreated?: (tag: TxnTagDTO) => void;
  /** Offer a "Create new tag" row (the edit dialog; not the filter). */
  canCreate?: boolean;
  placeholder?: string;
  /** Overrides the chips in the trigger — the filter shows a count instead. */
  triggerLabel?: string;
  className?: string;
  align?: "start" | "end";
  disabled?: boolean;
  max?: number;
}) {
  const [creating, setCreating] = useState(false);
  // Tags created from this control, held until the server list catches up —
  // the same reason the composer keeps `createdTags`: `tags` is a server prop
  // and the chip for a just-created tag can't be resolved without it.
  const [created, setCreated] = useState<TxnTagDTO[]>([]);

  // The server list is authoritative and name-ordered; a locally created tag is
  // appended only until `tags` arrives carrying it (the action revalidates), so
  // a rename made elsewhere is never masked by a stale local copy.
  const serverIds = new Set(tags.map((t) => t.id));
  const extra = created.filter((t) => !serverIds.has(t.id));
  const all = extra.length ? [...tags, ...extra] : tags;
  const known = new Map(all.map((t) => [t.id, t]));
  // Pick order, not list order — the chips should read in the order they were
  // chosen, and an id that no longer resolves (a tag deleted in another tab)
  // simply drops out rather than rendering a blank chip.
  const selected = value.map((id) => known.get(id)).filter((t): t is TxnTagDTO => !!t);
  const atMax = value.length >= max;

  function toggle(id: string) {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else if (!atMax) onChange([...value, id]);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn("justify-start font-normal", className)}
          >
            <TagIcon className="size-4 shrink-0 text-muted-foreground" />
            {triggerLabel ? (
              <span className="truncate">{triggerLabel}</span>
            ) : selected.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              // One line, never wraps: the first two chips and a "+N" for the
              // rest, so the trigger's height can't change with the selection.
              <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
                {selected.slice(0, 2).map((t) => (
                  <TagChip key={t.id} tag={t} className="text-xs" />
                ))}
                {selected.length > 2 ? (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    +{selected.length - 2}
                  </span>
                ) : null}
              </span>
            )}
            <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="w-64">
          {all.length === 0 ? (
            <p className="px-2 py-2 text-sm text-muted-foreground">
              {canCreate ? "No tags yet — create the first one." : "No tags in this workspace yet."}
            </p>
          ) : (
            <div className="max-h-56 overflow-y-auto">
              {all.map((tag) => {
                const active = value.includes(tag.id);
                return (
                  <DropdownMenuItem
                    key={tag.id}
                    // Keep the menu open while multi-selecting.
                    onSelect={(e) => {
                      e.preventDefault();
                      toggle(tag.id);
                    }}
                    // An unticked row is dead while the cap is reached — say so
                    // by graying it, rather than letting the click do nothing.
                    className={cn("gap-2 py-1.5", !active && atMax && "opacity-50")}
                  >
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded border",
                        active && "border-transparent",
                      )}
                      style={active ? { backgroundColor: tag.color } : undefined}
                    >
                      {active ? <Check className="size-3 text-white" aria-hidden /> : null}
                    </span>
                    <TagChip tag={tag} className="text-xs" />
                  </DropdownMenuItem>
                );
              })}
            </div>
          )}

          {atMax ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              {max} tags is the limit — untick one to pick another.
            </p>
          ) : null}

          {value.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onChange([])} className="py-1.5">
                Clear selection
              </DropdownMenuItem>
            </>
          ) : null}

          {canCreate ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setCreating(true)} className="py-1.5">
                <Plus className="size-4" /> Create new tag
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {canCreate ? (
        <TagFormDialog
          open={creating}
          onOpenChange={setCreating}
          onSaved={(tag) => {
            setCreated((prev) => [...prev, tag]);
            onCreated?.(tag);
            // Apply it straight away — creating a tag from inside a picker is
            // only ever a step towards putting it on this transaction.
            if (!atMax) onChange([...value, tag.id]);
          }}
        />
      ) : null}
    </>
  );
}

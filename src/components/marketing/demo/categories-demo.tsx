"use client";

import { useMemo, useState } from "react";
import { Plus, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CategoryRow } from "@/components/app/category-row";
import { DemoFrame } from "./demo-frame";
import { DemoControlGroup, DemoDateChip, DemoTypeToggle } from "./demo-controls";
import { demoCategories, type DemoTxnType } from "./demo-data";
import { cn } from "@/lib/utils";

type DemoCat = { id: string; name: string; kind: DemoTxnType; icon: string };

/**
 * The category list, editable, wired to the app's real picker.
 *
 * The story this page has to tell is that the list in Settings and the chips in
 * the composer are the *same* list — so the footer here isn't a mock-up of the
 * picker, it's `CategoryRow` itself, the component the tracker renders, fed
 * from this demo's state. Rename "Groceries" above and the chip below is
 * renamed, because there is only one list.
 *
 * Ids are `kind:name` at seed time and then never change, which is how a rename
 * behaves in the app: the transaction points at the category's id, so editing
 * the name doesn't detach any history. The default set has an "Other" in both
 * kinds, so the kind has to be part of the key.
 *
 * Deliberately not the app's `EmojiPicker`: that one loads `frimousse` plus a
 * self-hosted Emojibase dataset, which is a lot of bundle for a marketing page
 * whose point is "you can change the icon". A fixed palette makes the same
 * point for the cost of an array.
 *
 * Local state only — nothing here calls a server action, so the page stays
 * static. It's a client component but still server-renders, so a crawler reads
 * the real default list rather than an empty box.
 */

/** The real seeded set, both kinds, as the picker wants it. */
const SEED: DemoCat[] = (["expense", "income"] as const).flatMap((kind) =>
  demoCategories(kind).map((c) => ({
    id: `${kind}:${c.name}`,
    name: c.name,
    kind: c.kind,
    icon: c.icon,
  })),
);

/** A small palette instead of the full picker — see the note above. */
const ICON_CHOICES = [
  "🍽️", "🛒", "🚆", "🏠", "💡", "🛍️", "⚕️", "🎬",
  "📚", "📦", "☕", "🚕", "✈️", "🐶", "🎧", "🏋️",
  "💼", "🧾", "📈", "🎁", "➕", "🎓", "🧴", "🏷️",
];

/** Name cap matches `categoryInputSchema` — 20 characters, same as the app. */
const NAME_MAX = 20;

export function CategoriesDemo() {
  const [cats, setCats] = useState<DemoCat[]>(SEED);
  const [kind, setKind] = useState<DemoTxnType>("expense");
  const [selectedId, setSelectedId] = useState<string | null>(SEED[0]?.id ?? null);
  const [draftName, setDraftName] = useState("");
  const [draftIcon, setDraftIcon] = useState("🏷️");
  const [nextId, setNextId] = useState(1);

  const visible = useMemo(() => cats.filter((c) => c.kind === kind), [cats, kind]);

  // What the picker gets. A half-typed rename shouldn't render an unreadable
  // blank chip, and the app wouldn't accept an empty name anyway.
  const pickerCats = useMemo(
    () =>
      visible.map((c) => ({
        id: c.id,
        name: c.name.trim() || "Untitled",
        kind: c.kind,
        icon: c.icon,
      })),
    [visible],
  );

  // Derived rather than synced in an effect: deleting the selected category
  // clears the selection on the next render, with nothing to keep in step.
  const value = visible.some((c) => c.id === selectedId) ? selectedId : null;

  const trimmed = draftName.trim();
  // The app enforces one name per kind per workspace with a unique index and
  // surfaces the clash as "A category with that name already exists".
  const duplicate =
    trimmed.length > 0 &&
    visible.some((c) => c.name.trim().toLowerCase() === trimmed.toLowerCase());

  const dirty = useMemo(() => JSON.stringify(cats) !== JSON.stringify(SEED), [cats]);

  function switchKind(next: DemoTxnType) {
    setKind(next);
    setSelectedId(cats.find((c) => c.kind === next)?.id ?? null);
    setDraftName("");
  }

  function patch(id: string, changes: Partial<DemoCat>) {
    setCats((prev) => prev.map((c) => (c.id === id ? { ...c, ...changes } : c)));
  }

  function remove(id: string) {
    setCats((prev) => prev.filter((c) => c.id !== id));
  }

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!trimmed || duplicate) return;
    const id = `new:${nextId}`;
    setCats((prev) => [...prev, { id, name: trimmed, kind, icon: draftIcon }]);
    setNextId((n) => n + 1);
    setDraftName("");
    setDraftIcon("🏷️");
    // Select it, so the new chip is the one highlighted in the row below.
    setSelectedId(id);
  }

  function reset() {
    setCats(SEED);
    setKind("expense");
    setSelectedId(SEED[0]?.id ?? null);
    setDraftName("");
    setDraftIcon("🏷️");
  }

  return (
    <DemoFrame
      label="Interactive categories demo"
      active="/app/settings"
      // Pinned: the list grows and shrinks as you add and delete, and the page
      // around it shouldn't move while you do that.
      className="h-[36rem]"
      bodyClassName="overflow-hidden"
      header={
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Categories</p>
            <p className="truncate text-xs text-muted-foreground">
              {cats.length} categor{cats.length === 1 ? "y" : "ies"} · shared with
              everyone in this workspace
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <DemoTypeToggle dense type={kind} onChange={switchKind} />
            {dirty && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={reset}
                className="h-8 gap-1.5 text-xs text-muted-foreground"
              >
                <RotateCcw className="size-3.5" /> Reset
              </Button>
            )}
          </div>
        </div>
      }
      footer={
        <div className="shrink-0 space-y-1.5 border-t bg-muted/20 px-4 py-3">
          <p className="text-xs text-muted-foreground">
            The composer, live — the same list, as the picker shows it
          </p>
          {/* The app's compact control group, holding the app's own
              `CategoryRow`. Whatever you do above lands here immediately. */}
          <DemoControlGroup className="ml-0">
            <DemoDateChip />
            <div className="min-w-0 flex-1">
              <CategoryRow
                dense
                categories={pickerCats}
                value={value}
                onChange={setSelectedId}
              />
            </div>
          </DemoControlGroup>
        </div>
      }
    >
      <div className="h-full overflow-y-auto px-4 py-3">
        <ul className="space-y-1.5">
          {visible.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-1.5 rounded-lg border px-2 py-1.5"
            >
              <IconPicker
                value={c.icon}
                label={c.name || "this category"}
                onSelect={(icon) => patch(c.id, { icon })}
              />
              <Input
                value={c.name}
                onChange={(e) => patch(c.id, { name: e.target.value })}
                maxLength={NAME_MAX}
                aria-label={`Rename ${c.name}`}
                className="h-8 min-w-0 flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${c.name}`}
                onClick={() => remove(c.id)}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="size-4" />
              </Button>
            </li>
          ))}
          {visible.length === 0 && (
            <li className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
              No {kind} categories yet.
            </li>
          )}
        </ul>

        <form onSubmit={add} className="mt-3 flex items-center gap-1.5">
          <IconPicker
            value={draftIcon}
            label="the new category"
            onSelect={setDraftIcon}
          />
          <Input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder={`New ${kind} category`}
            maxLength={NAME_MAX}
            aria-label="New category name"
            aria-invalid={duplicate || undefined}
            className="h-8 min-w-0 flex-1"
          />
          <Button
            type="submit"
            size="sm"
            disabled={!trimmed || duplicate}
            className="h-8 gap-1.5"
          >
            <Plus className="size-4" /> Add
          </Button>
        </form>

        <p className="mt-2 text-xs text-muted-foreground">
          {duplicate
            ? "A category with that name already exists."
            : "Names are capped at 20 characters — they have to fit a chip. Deleting a category in the app leaves its transactions uncategorised; nothing is removed."}
        </p>
      </div>
    </DemoFrame>
  );
}

/** Emoji palette, as a popover on the icon button. */
function IconPicker({
  value,
  label,
  onSelect,
}: {
  value: string;
  label: string;
  onSelect: (icon: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Change icon for ${label}`}
        >
          <span className="text-base">{value}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" closeOnOutsideClick className="w-auto">
        <div className="grid grid-cols-8 gap-0.5">
          {ICON_CHOICES.map((icon) => (
            <button
              key={icon}
              type="button"
              onClick={() => {
                onSelect(icon);
                setOpen(false);
              }}
              aria-label={`Use ${icon}`}
              aria-pressed={icon === value}
              className={cn(
                "flex size-8 items-center justify-center rounded-md text-base hover:bg-muted",
                icon === value && "bg-muted",
              )}
            >
              {icon}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

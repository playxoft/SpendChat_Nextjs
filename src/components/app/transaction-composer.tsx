"use client";

import { useMemo, useRef, useState } from "react";
import { AlignLeft, ArrowDownCircle, ArrowUp, ArrowUpCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Kbd } from "@/components/ui/kbd";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CategoryRow } from "./category-row";
import { CategoryEditorDialog } from "./category-editor-dialog";
import { cn } from "@/lib/utils";
import { usePendingMessages } from "./pending-messages";
import { getCurrency } from "@/lib/currencies";
import { toMinorUnits } from "@/lib/money";
import { parseQuickEntry } from "@/lib/quick-entry";
import { useIsMac, useShortcut } from "@/hooks/use-shortcut";
import { comboFor, formatShortcut } from "@/lib/shortcuts";
import type { InputMode, TransactionInput } from "@/lib/validation";
import type { Category, Profile } from "@/db/schema";

const TITLE_MAX = 100;
const DESCRIPTION_MAX = 250;
// Matches a trailing "/query" token typed into the title field.
const SLASH_RE = /(?:^|\s)\/([^\s/]*)$/;

export function TransactionComposer({
  categories,
  currency,
  today,
  profiles,
  activeProfileId,
  allProfiles = false,
  inputMode = "amount_title",
}: {
  categories: Pick<Category, "id" | "name" | "kind" | "icon">[];
  currency: string;
  today: string;
  profiles: Pick<Profile, "id" | "name" | "icon">[];
  activeProfileId?: string;
  /** When viewing "All profiles", let the user pick the target; otherwise the
   * active profile is locked in and the picker is hidden. */
  allProfiles?: boolean;
  /** How to lay out the amount/title inputs (from user settings). */
  inputMode?: InputMode;
}) {
  const [type, setType] = useState<"expense" | "income">("expense");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  // Single-field ("combined") mode types amount + title together, e.g. "100 fruits".
  const [combined, setCombined] = useState("");
  const [description, setDescription] = useState("");
  const [occurredOn, setOccurredOn] = useState(today);
  const [profileId, setProfileId] = useState(activeProfileId ?? profiles[0]?.id ?? "");
  const [editorOpen, setEditorOpen] = useState(false);
  // Description is off by default; a toggle on the amount/title row reveals it.
  const [showDescription, setShowDescription] = useState(false);
  const [slashDismissed, setSlashDismissed] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const { send } = usePendingMessages();

  const titleRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLInputElement>(null);
  const cats = useMemo(() => categories.filter((c) => c.kind === type), [categories, type]);
  const symbol = getCurrency(currency).symbol;
  const isMac = useIsMac();

  const isCombined = inputMode === "combined";
  // The "/" category picker reads/writes whichever field holds the title text.
  const titleSource = isCombined ? combined : title;
  const setTitleSource = isCombined ? setCombined : setTitle;
  // Live parse of the combined field for the inline preview + submit.
  const quick = isCombined ? parseQuickEntry(combined) : null;

  const toggleCombo = comboFor("tracker.toggle-type");
  const submitCombo = comboFor("tracker.submit");
  const submitLabel = formatShortcut(submitCombo, isMac);

  // When a specific profile is active it's locked in; only "All profiles" lets
  // the user choose where a new transaction lands.
  const targetProfileId = allProfiles
    ? profileId
    : (activeProfileId ?? profiles[0]?.id ?? "");

  // "/" in the title opens an inline category picker.
  const slashMatch = titleSource.match(SLASH_RE);
  const slashQuery = slashMatch?.[1] ?? "";
  const slashActive = !!slashMatch && !slashDismissed;
  const slashResults = slashActive
    ? cats.filter((c) => c.name.toLowerCase().includes(slashQuery.toLowerCase())).slice(0, 8)
    : [];
  const slashIdx = slashResults.length ? Math.min(slashIndex, slashResults.length - 1) : 0;

  function switchType(t?: "expense" | "income") {
    setType((prev) => t ?? (prev === "expense" ? "income" : "expense"));
    setCategoryId(null);
  }

  // ⌘/Ctrl+E toggles expense/income even while typing.
  useShortcut(toggleCombo, () => switchType(), { allowInInput: true });

  function selectSlashCategory(cat: Pick<Category, "id">) {
    setCategoryId(cat.id);
    setTitleSource((t) => t.replace(SLASH_RE, "").replace(/\s+$/, ""));
    setSlashDismissed(true);
    setSlashIndex(0);
  }

  function submit() {
    // In combined mode the amount + title come from one parsed field.
    // Standalone amount may carry comma thousands separators — drop them to parse.
    const value = isCombined ? quick!.amount ?? 0 : Number(amount.replace(/,/g, ""));
    const finalTitle = (isCombined ? quick!.title : title).trim();

    if (!value || value <= 0) {
      toast.error(
        isCombined ? "Start with an amount, e.g. 100 fruits" : "Enter an amount greater than 0",
      );
      titleRef.current?.focus();
      return;
    }
    // A transaction needs an amount, a title, a date and a profile.
    if (!finalTitle) {
      toast.error(isCombined ? "Add a title after the amount" : "Add a title");
      titleRef.current?.focus();
      return;
    }
    if (!occurredOn) {
      toast.error("Pick a date");
      return;
    }
    if (!targetProfileId) {
      toast.error("Pick a profile");
      return;
    }

    const input: TransactionInput = {
      type,
      amount: value,
      categoryId,
      profileId: targetProfileId,
      title: finalTitle,
      description: description.trim() || undefined,
      occurredOn,
    };
    // categoryId is always from the current type's list (switching type clears it).
    const cat = categoryId ? cats.find((c) => c.id === categoryId) ?? null : null;

    // Optimistic: paint the bubble now, save in the background. On failure the
    // ghost bubble surfaces a "Try again" — the composer doesn't wait or block.
    send({
      input,
      type,
      amountMinor: toMinorUnits(value, currency),
      title: finalTitle,
      description: input.description ?? null,
      categoryName: cat?.name ?? null,
      categoryIcon: cat?.icon ?? null,
      profileId: targetProfileId,
    });

    // Clear the composer immediately so the next entry can start (WhatsApp-style),
    // and keep focus in the first field for rapid successive sends.
    setAmount("");
    setTitle("");
    setCombined("");
    setDescription("");
    setShowDescription(false);
    setCategoryId(null);
    setOccurredOn(today);
    setSlashDismissed(false);
    (isCombined || inputMode === "title_amount" ? titleRef : amountRef).current?.focus();
  }

  function onAmountKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      // Amount-first: move to the title rather than submitting an untitled row.
      // Title-first: the amount is the last field, so Enter sends.
      if (inputMode === "title_amount") submit();
      else titleRef.current?.focus();
    }
  }

  function onTitleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (slashActive && slashResults.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashIndex((i) => (i + 1) % slashResults.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashIndex((i) => (i - 1 + slashResults.length) % slashResults.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        selectSlashCategory(slashResults[slashIdx]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSlashDismissed(true);
        return;
      }
    }

    if (e.key === "Enter") {
      // Shift+Enter jumps to the description (revealing it first). Otherwise Enter
      // sends, except in title-first mode where the amount still needs filling in.
      e.preventDefault();
      if (e.shiftKey) {
        setShowDescription(true);
        requestAnimationFrame(() => descRef.current?.focus());
      } else if (inputMode === "title_amount") amountRef.current?.focus();
      else submit();
    }
  }

  function onDescriptionKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  }

  const sendButton = (
    <Button
      type="submit"
      aria-label={`Send transaction (${submitLabel})`}
      className="h-9 gap-1.5 px-3"
    >
      <ArrowUp className="size-4" />
      <span className="text-xs font-semibold tracking-wide opacity-80">{submitLabel}</span>
    </Button>
  );

  const amountField = (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">
        {symbol}
      </span>
      <Input
        ref={amountRef}
        inputMode="decimal"
        placeholder="0.00"
        value={amount}
        // Numbers only — allow digits plus comma/period separators, drop the rest.
        onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
        onKeyDown={onAmountKeyDown}
        aria-label="Amount"
        className="h-8 w-28 pl-7 tabular-nums"
      />
    </div>
  );

  const titleField = (
    <div className="min-w-32 flex-1">
      <Input
        ref={titleRef}
        placeholder="Add a title — type / to tag a category"
        value={title}
        maxLength={TITLE_MAX}
        onChange={(e) => {
          setTitle(e.target.value);
          setSlashDismissed(false);
          setSlashIndex(0);
        }}
        onKeyDown={onTitleKeyDown}
        aria-label="Title"
        className="h-8 w-full"
      />
    </div>
  );

  // Single-field mode: "100 fruits" → amount 100, title "fruits". Uses titleRef
  // so shortcuts that focus the title still land here, and onTitleKeyDown so the
  // "/" category picker keeps working on the parsed title.
  const combinedField = (
    <div className="min-w-32 flex-1">
      <Input
        ref={titleRef}
        placeholder="e.g. 100 fruits"
        value={combined}
        maxLength={TITLE_MAX + 12}
        onChange={(e) => {
          setCombined(e.target.value);
          setSlashDismissed(false);
          setSlashIndex(0);
        }}
        onKeyDown={onTitleKeyDown}
        aria-label="Amount and title"
        className="h-8 w-full"
      />
    </div>
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="sticky bottom-16 z-20 border-t bg-background px-3 py-2 md:bottom-0 md:bg-background/95 md:backdrop-blur-sm"
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-2">
        {/* Mobile: type + date + categories share one row; desktop stacks them. */}
        <div className="flex items-center gap-2 md:block md:space-y-2">
          <div className="flex shrink-0 items-center gap-2 md:w-full md:justify-between">
            <div className="inline-flex shrink-0 items-center rounded-full border bg-muted/50 p-0.5 text-sm">
              {(["expense", "income"] as const).map((t) => {
                const active = type === t;
                const Icon = t === "income" ? ArrowUpCircle : ArrowDownCircle;
                const color =
                  t === "income"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400";
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => switchType(t)}
                    aria-pressed={active}
                    aria-label={t}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 capitalize transition-colors sm:px-3",
                      active
                        ? "bg-background font-medium shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className={cn("size-4", color)} />
                    <span className="hidden sm:inline">{t}</span>
                    {/* The ⌘E hint rides inside the active capsule (desktop only). */}
                    {active && (
                      <Kbd combo={toggleCombo} className="hidden opacity-70 sm:inline-flex" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <DatePicker
                value={occurredOn}
                max={today}
                onChange={setOccurredOn}
                compact
                className="h-8 w-auto"
              />
              {allProfiles && profiles.length > 0 && (
                <Select value={profileId} onValueChange={setProfileId}>
                  <SelectTrigger className="h-8 w-auto gap-1" aria-label="Profile for new transaction">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="end">
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.icon ? `${p.icon} ` : ""}
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <CategoryRow
              categories={cats}
              value={categoryId}
              onChange={setCategoryId}
              onEdit={() => setEditorOpen(true)}
            />
          </div>
        </div>

        {/* Live parse feedback for the single-field mode, shown above the input. */}
        {isCombined && combined.trim() && (
          <p className="px-0.5 text-xs text-muted-foreground">
            {quick!.amount != null && quick!.title ? (
              <>
                Adds{" "}
                <span className="font-medium text-foreground tabular-nums">
                  {symbol}
                  {quick!.amount}
                </span>{" "}
                · {quick!.title}
              </>
            ) : quick!.amount != null ? (
              <>
                Amount{" "}
                <span className="font-medium text-foreground tabular-nums">
                  {symbol}
                  {quick!.amount}
                </span>{" "}
                — now add a title
              </>
            ) : (
              <>
                Start with a number, e.g.{" "}
                <span className="font-medium text-foreground">100 fruits</span>
              </>
            )}
          </p>
        )}

        <div className="relative flex flex-wrap items-end gap-2">
          {/* Field order follows the user's chosen input mode. */}
          {isCombined ? (
            combinedField
          ) : inputMode === "title_amount" ? (
            <>
              {titleField}
              {amountField}
            </>
          ) : (
            <>
              {amountField}
              {titleField}
            </>
          )}

          {/* Mobile only: toggle the description field. Desktop always shows it. */}
          <Button
            type="button"
            variant={showDescription ? "secondary" : "outline"}
            size="icon"
            aria-label={showDescription ? "Hide description" : "Add a description"}
            aria-pressed={showDescription}
            onClick={() => setShowDescription((v) => !v)}
            className="h-8 shrink-0 md:hidden"
          >
            <AlignLeft className="size-4" />
          </Button>

          {/* Send sits inline on desktop; on mobile it moves to a full-width
              button at the bottom (see below) for an easier thumb reach. */}
          <div className="hidden md:block">{sendButton}</div>

          {/* Anchored to the input row (not the narrow title) and clamped to the
              viewport, so it never runs off-screen on a phone. */}
          {slashActive && (
            <div className="absolute bottom-full left-0 z-30 mb-1 w-72 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-lg border bg-popover p-1 shadow-md">
              {slashResults.length > 0 ? (
                <ul className="max-h-56 overflow-y-auto">
                  {slashResults.map((c, i) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectSlashCategory(c);
                        }}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                          i === slashIdx ? "bg-accent" : "hover:bg-muted",
                        )}
                      >
                        <span aria-hidden>{c.icon ?? "🏷️"}</span>
                        <span className="truncate">{c.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-2 py-1.5 text-sm text-muted-foreground">
                  No category matches “{slashQuery}”
                </p>
              )}
            </div>
          )}
        </div>

        {/* Desktop: always visible. Mobile: only when the toggle is on. */}
        <Input
          ref={descRef}
          placeholder="Add a description (optional)"
          value={description}
          maxLength={DESCRIPTION_MAX}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={onDescriptionKeyDown}
          aria-label="Description"
          className={cn("h-8", !showDescription && "hidden md:block")}
        />

        {/* Full-width send on mobile — easy thumb reach at the bottom. */}
        <Button
          type="submit"
          aria-label={`Send transaction (${submitLabel})`}
          className="h-9 w-full gap-1.5 text-sm md:hidden"
        >
          <ArrowUp className="size-4" /> Send
        </Button>
      </div>

      <CategoryEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        categories={categories}
        defaultKind={type}
      />
    </form>
  );
}

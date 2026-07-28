"use client";

import { useMemo, useRef, useState } from "react";
import { AlignLeft, ArrowUp, Minus, Plus } from "lucide-react";
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
} from "@/components/ui/select";
import { CategoryRow } from "./category-row";
import { CategoryEditorDialog } from "./category-editor-dialog";
import { AiTransactionInput } from "./ai-transaction-input";
import { EntryModeToggle } from "./entry-mode-toggle";
import { useEntryMode } from "./entry-mode-store";
import { cn } from "@/lib/utils";
import { usePendingMessages } from "./pending-messages";
import { useLoadingOverlay } from "./loading-overlay";
import { AttachmentDropzone } from "./attachments/attachment-dropzone";
import { StagedAttachmentList, useStagedAttachments } from "./attachments/staged-attachments";
import { PageAttachmentDrop } from "./attachments/page-attachment-drop";
import { pickAcceptedFiles } from "./attachments/upload-client";
import { getCurrency } from "@/lib/currencies";
import { toMinorUnits } from "@/lib/money";
import {
  amountPlaceholder,
  formatAmountInput,
  integerDigitCount,
  parseAmountInput,
} from "@/lib/parse-amount";
import { parseQuickEntry } from "@/lib/quick-entry";
import { useIsMac, useShortcut } from "@/hooks/use-shortcut";
import { comboFor, formatShortcut } from "@/lib/shortcuts";
import {
  AMOUNT_INTEGER_DIGITS_MAX,
  ATTACHMENT_MAX_PER_TRANSACTION,
  TRANSACTION_AMOUNT_MAX as AMOUNT_MAX,
  TRANSACTION_DESCRIPTION_MAX as DESCRIPTION_MAX,
  TRANSACTION_TITLE_MAX as TITLE_MAX,
} from "@/lib/validation";
import type { InputMode, TransactionInput } from "@/lib/validation";
import type { Category, Profile } from "@/db/schema";

// Matches a trailing "#query" token typed into the title field — "#" is the
// app-wide category trigger (in the AI note too).
const TAG_RE = /(?:^|\s)#([^\s#]*)$/;

export function TransactionComposer({
  categories,
  currency,
  locale = "en-US",
  today,
  profiles,
  activeProfileId,
  allProfiles = false,
  inputMode = "amount_title",
}: {
  categories: Pick<Category, "id" | "name" | "kind" | "icon">[];
  currency: string;
  /** Drives how a typed amount is read ("1,50" is 1.50 for a de-DE user). */
  locale?: string;
  today: string;
  profiles: Pick<Profile, "id" | "name" | "icon">[];
  activeProfileId?: string;
  /** When viewing "All profiles", let the user pick the target; otherwise the
   * active profile is locked in and the picker is hidden. */
  allProfiles?: boolean;
  /** How to lay out the amount/title inputs (from user settings). */
  inputMode?: InputMode;
}) {
  // Manual (fields) vs AI (free-text note → reviewed drafts) entry. Persisted in
  // localStorage so a refresh / re-login reopens the same mode (see the store).
  const [mode, changeMode] = useEntryMode();
  // Whether the AI pane is showing its (tall) review list — see the grid below.
  const [aiReviewing, setAiReviewing] = useState(false);
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
  const [tagDismissed, setTagDismissed] = useState(false);
  const [tagIndex, setTagIndex] = useState(0);
  const { send } = usePendingMessages();
  // Files staged for the next send; uploaded to the row once it's created.
  const staged = useStagedAttachments();
  // True while a profile/workspace switch is in flight — the fields belong to
  // the outgoing profile, so lock the composer until the new one has loaded.
  const { pending: switching } = useLoadingOverlay();

  const titleRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLInputElement>(null);
  const cats = useMemo(() => categories.filter((c) => c.kind === type), [categories, type]);
  const symbol = getCurrency(currency).symbol;
  const isMac = useIsMac();
  // "0.00" / "0,00" — the placeholder has to show the separator this user types.
  const placeholder = useMemo(() => amountPlaceholder(locale), [locale]);

  const isCombined = inputMode === "combined";
  // The "/" category picker reads/writes whichever field holds the title text.
  const titleSource = isCombined ? combined : title;
  const setTitleSource = isCombined ? setCombined : setTitle;
  // Live parse of the combined field for the inline preview + submit.
  const quick = isCombined ? parseQuickEntry(combined, locale) : null;
  // The combined field mixes amount + title, so blocking a keystroke would drop
  // the title too. Instead flag the field red when the parsed amount is over the
  // 9-digit cap; submit is blocked by the same check below.
  const combinedAmountOverLimit = quick?.amount != null && quick.amount > AMOUNT_MAX;

  // Always-on preview for the two-field modes: the parsed amount (0 when the
  // field is blank or unparseable) drives an ever-present "add a title" nudge.
  const previewAmount = parseAmountInput(amount, locale) ?? 0;

  const toggleCombo = comboFor("tracker.toggle-type");
  const submitCombo = comboFor("tracker.submit");
  const submitLabel = formatShortcut(submitCombo, isMac);

  // When a specific profile is active it's locked in; only "All profiles" lets
  // the user choose where a new transaction lands.
  const targetProfileId = allProfiles
    ? profileId
    : (activeProfileId ?? profiles[0]?.id ?? "");
  // The profile a new transaction lands in — shown as an emoji-only picker on
  // mobile (name appears on desktop).
  const currentProfile = profiles.find((p) => p.id === profileId) ?? profiles[0] ?? null;

  // "#" in the title opens an inline category picker. Every category of the
  // current type is offered — a bare "#" is "show me the list", so truncating it
  // hid categories the user had no other way to reach from the keyboard. The
  // popover scrolls instead of capping.
  const tagMatch = titleSource.match(TAG_RE);
  const tagQuery = tagMatch?.[1] ?? "";
  const tagActive = !!tagMatch && !tagDismissed;
  const tagResults = tagActive
    ? cats.filter((c) => c.name.toLowerCase().includes(tagQuery.toLowerCase()))
    : [];
  const tagIdx = tagResults.length ? Math.min(tagIndex, tagResults.length - 1) : 0;

  function switchType(t?: "expense" | "income") {
    setType((prev) => t ?? (prev === "expense" ? "income" : "expense"));
    setCategoryId(null);
  }

  // ⌘/Ctrl+E toggles expense/income even while typing — but not while a dialog
  // is open (e.g. bulk add), where ⌘E belongs to the focused row there, and not
  // in AI mode, where the manual fields are hidden: it would silently flip a
  // type the user can't see.
  useShortcut(toggleCombo, () => switchType(), {
    enabled: mode === "manual",
    allowInInput: true,
    requireNoOverlay: true,
  });

  // "a" flips Manual ⇄ AI entry. Lives here (not global-shortcuts) because it
  // owns `mode`; single-key, so it stays quiet while a field is focused.
  useShortcut(
    comboFor("tracker.toggle-mode"),
    () => changeMode(mode === "manual" ? "ai" : "manual"),
    { requireNoOverlay: true },
  );

  function selectTagCategory(cat: Pick<Category, "id">) {
    setCategoryId(cat.id);
    setTitleSource((t) => t.replace(TAG_RE, "").replace(/\s+$/, ""));
    setTagDismissed(true);
    setTagIndex(0);
  }

  function submit() {
    // Ignore sends while switching profile — the target profile is changing.
    if (switching) return;
    // In combined mode the amount + title come from one parsed field. Both
    // paths read the amount against the user's locale, and both yield null for
    // anything ambiguous — never a silently mis-scaled number.
    const value = isCombined ? quick!.amount : parseAmountInput(amount, locale);
    const finalTitle = (isCombined ? quick!.title : title).trim();

    if (value === null || value <= 0) {
      const example = formatAmountInput(12.5, locale);
      toast.error(
        isCombined
          ? `Start with an amount, e.g. ${formatAmountInput(100, locale)} fruits`
          : value === null && amount.trim()
            ? `That amount isn't clear — try ${example}`
            : "Enter an amount greater than 0",
      );
      titleRef.current?.focus();
      return;
    }
    // Whole-number part capped at 9 digits; catches combined mode too, where the
    // amount doesn't pass through the per-keystroke guard.
    if (value > AMOUNT_MAX) {
      toast.error("Amount is too large (max 9 digits)");
      (isCombined ? titleRef : amountRef).current?.focus();
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
    // Staged files (if any) ride along and upload once the row's id is known.
    send({
      input,
      type,
      amountMinor: toMinorUnits(value, currency, locale),
      title: finalTitle,
      description: input.description ?? null,
      categoryName: cat?.name ?? null,
      categoryIcon: cat?.icon ?? null,
      profileId: targetProfileId,
      attachments: staged.items.length > 0 ? staged.toInputs() : undefined,
    });

    // Clear the composer immediately so the next entry can start (WhatsApp-style),
    // and keep focus in the first field for rapid successive sends. `staged.clear`
    // drops the local previews — the File refs live on in the pending draft.
    staged.clear();
    setAmount("");
    setTitle("");
    setCombined("");
    setDescription("");
    setShowDescription(false);
    setCategoryId(null);
    setOccurredOn(today);
    setTagDismissed(false);
    (isCombined || inputMode === "title_amount" ? titleRef : amountRef).current?.focus();
  }

  // Files dropped anywhere on the tracker page: filter to the free slots and
  // stage them in the composer (the inline paperclip pre-filters its own).
  function stageDropped(files: File[]) {
    const remaining = ATTACHMENT_MAX_PER_TRANSACTION - staged.items.length;
    const { accepted, errors } = pickAcceptedFiles(files, remaining);
    errors.forEach((e) => toast.error(e));
    if (accepted.length) staged.add(accepted);
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
    if (tagActive && tagResults.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setTagIndex((i) => (i + 1) % tagResults.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setTagIndex((i) => (i - 1 + tagResults.length) % tagResults.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        selectTagCategory(tagResults[tagIdx]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setTagDismissed(true);
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
        placeholder={placeholder}
        value={amount}
        // Numbers only — allow digits plus the separators any locale groups or
        // points with (comma, period, space); the parser rejects the rest.
        // Reject the keystroke once the whole-number part hits 9 digits.
        onChange={(e) => {
          const next = e.target.value.replace(/[^\d.,\s]/g, "");
          setAmount((prev) =>
            integerDigitCount(next, locale) > AMOUNT_INTEGER_DIGITS_MAX ? prev : next,
          );
        }}
        onKeyDown={onAmountKeyDown}
        aria-label="Amount"
        className="h-8 w-28 pl-7 tabular-nums md:text-base"
      />
    </div>
  );

  // The paperclip rides *inside* the title field, as a leading affordance —
  // attaching a receipt belongs to what you're describing, not to the
  // date/profile/category cluster it used to sit in. The input reserves `pl-9`
  // so text never runs under it.
  const attachButton = (
    <AttachmentDropzone
      variant="inline"
      onFiles={staged.add}
      remaining={ATTACHMENT_MAX_PER_TRANSACTION - staged.items.length}
      disabled={switching}
      className="absolute top-1/2 left-0.5 size-7 -translate-y-1/2"
    />
  );

  // Amount-first mode instead puts the paperclip as a standalone leading button
  // at the very left of the row (left of the amount box), not inside a field.
  const standaloneAttach = (
    <AttachmentDropzone
      variant="inline"
      onFiles={staged.add}
      remaining={ATTACHMENT_MAX_PER_TRANSACTION - staged.items.length}
      disabled={switching}
      className="size-8 shrink-0 border"
    />
  );

  // The clip leads the title only when the title is the row's first field
  // (title-first). In amount-first mode it moves to `standaloneAttach` above, so
  // the title drops its leading clip and gets normal padding.
  const titleLeadsRow = inputMode === "title_amount";
  const titleField = (
    <div className="relative min-w-32 flex-1">
      {titleLeadsRow && attachButton}
      <Input
        ref={titleRef}
        placeholder="Add a title — type # to tag a category"
        value={title}
        maxLength={TITLE_MAX}
        onChange={(e) => {
          setTitle(e.target.value);
          setTagDismissed(false);
          setTagIndex(0);
        }}
        onKeyDown={onTitleKeyDown}
        aria-label="Title"
        className={cn("h-8 w-full md:text-base", titleLeadsRow && "pl-9")}
      />
    </div>
  );

  // Single-field mode: "100 fruits" → amount 100, title "fruits". Uses titleRef
  // so shortcuts that focus the title still land here, and onTitleKeyDown so the
  // "/" category picker keeps working on the parsed title.
  const combinedField = (
    <div className="relative min-w-32 flex-1">
      {attachButton}
      <Input
        ref={titleRef}
        placeholder="e.g. 100 fruits"
        value={combined}
        // Room for the title plus a leading "999,999,999.99 " amount + space.
        maxLength={TITLE_MAX + 18}
        onChange={(e) => {
          setCombined(e.target.value);
          setTagDismissed(false);
          setTagIndex(0);
        }}
        onKeyDown={onTitleKeyDown}
        aria-label="Amount and title"
        // Red bar when the amount is over the 9-digit cap (submit is blocked too).
        aria-invalid={combinedAmountOverLimit || undefined}
        className="h-8 w-full pl-9 md:text-base"
      />
    </div>
  );

  return (
    <div className="sticky bottom-16 z-20 px-3 pt-2 pb-2 md:bottom-0">
      {/* Every widget lives inside one rounded, floating card — the tracker list
          scrolls behind it, not under a full-width divider. */}
      <div className="mx-auto flex max-w-3xl flex-col gap-2 rounded-2xl border bg-background p-3 shadow-lg md:bg-background/95 md:backdrop-blur-sm">
        {/* Both modes share a single grid cell, so the card is sized to the taller
            one and doesn't resize when you switch — which is what keeps the
            Manual/AI toggle (top-left of each mode's first row) from shifting
            between modes. The inactive mode stays mounted so a typed draft or an
            in-flight parse is never discarded.

            Two ways to hide it, and the difference matters: `invisible` keeps the
            box (equal heights, no shift), while `hidden` removes it from layout.
            React preserves state either way. The AI review list is several times
            taller than the manual row, so reserving *its* height would leave
            Manual staring at ~400px of empty card — for that one state we drop to
            `hidden` and accept the small toggle shift. */}
        <div className="grid">
          <div
            className={cn(
              "col-start-1 row-start-1 min-w-0",
              mode === "ai"
                ? undefined
                : aiReviewing
                  ? "hidden"
                  : "invisible pointer-events-none",
            )}
          >
            <AiTransactionInput
              mode={mode}
              onModeChange={changeMode}
              onReviewingChange={setAiReviewing}
              categories={categories}
              currency={currency}
              locale={locale}
              today={today}
              profiles={profiles}
              activeProfileId={activeProfileId}
              allProfiles={allProfiles}
            />
          </div>

          <div
            className={cn(
              "col-start-1 row-start-1 min-w-0",
              mode === "manual" ? undefined : "invisible pointer-events-none",
            )}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              {/* Drop files anywhere on the tracker to stage them for the next send. */}
              <PageAttachmentDrop
                onFiles={stageDropped}
                disabled={switching || mode !== "manual"}
                label="Drop files to attach to your transaction"
              />
              {/* Disable every field/button while a profile switch is in flight — the
                  native `disabled` on a fieldset cascades to all controls inside. */}
              <fieldset
                disabled={switching}
                className="m-0 min-w-0 border-0 p-0 transition-opacity disabled:opacity-60"
              >
                <div className="flex flex-col gap-2">
                  {/* Controls: type on the left; date / profile / category pushed to the
                      right. On mobile the full category list drops to its own row (in
                      all-profiles it collapses to a tag icon inside the right cluster). */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <EntryModeToggle mode={mode} onChange={changeMode} />
                      <div className="inline-flex shrink-0 items-center rounded-full border bg-muted/50 p-0.5 text-sm">
                        {(["expense", "income"] as const).map((t) => {
                          const active = type === t;
                          // "+" reads as money in, "−" as money out (clearer than arrows).
                          const Icon = t === "income" ? Plus : Minus;
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

                      <div className="ml-auto flex min-w-0 items-center gap-2">
                        {/* The paperclip used to live here; it's now a prefix
                            inside the title field (see `attachButton`). */}
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
                              <span aria-hidden className="text-base leading-none">
                                {currentProfile?.icon ?? "👤"}
                              </span>
                              <span className="hidden max-w-24 truncate md:inline">
                                {currentProfile?.name}
                              </span>
                            </SelectTrigger>
                            {/* popper positioning is reliable for a small trigger pinned at
                                the bottom of the screen; item-aligned mispositions there. */}
                            <SelectContent align="end" position="popper">
                              {profiles.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.icon ? `${p.icon} ` : ""}
                                  {p.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        {/* Mobile: categories always collapse to a tag icon in the right
                            cluster (every profile view — the slider is desktop-only). */}
                        <div className="shrink-0 md:hidden">
                          <CategoryRow
                            compact
                            categories={cats}
                            value={categoryId}
                            onChange={setCategoryId}
                            onEdit={() => setEditorOpen(true)}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Desktop: the full inline category slider. On mobile it's the tag
                        icon in the cluster above instead. */}
                    <div className="hidden min-w-0 md:block">
                      <CategoryRow
                        categories={cats}
                        value={categoryId}
                        onChange={setCategoryId}
                        onEdit={() => setEditorOpen(true)}
                      />
                    </div>
                  </div>

                  {/* Live parse feedback for the single-field mode — always on, so
                      the "Amount ₹0 — add a title" nudge shows before you type too. */}
                  {isCombined &&
                    (combinedAmountOverLimit ? (
                      <p className="px-0.5 text-xs text-destructive">Amount is too large (max 9 digits)</p>
                    ) : (
                      <p className="px-0.5 text-xs text-muted-foreground">
                        {quick!.amount != null && quick!.title ? (
                          <>
                            Adds{" "}
                            <span className="font-medium text-foreground tabular-nums">
                              {symbol}
                              {quick!.amount}
                            </span>{" "}
                            · <span className="font-medium text-foreground">{quick!.title}</span>
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
                        ) : combined.trim() ? (
                          <>
                            Start with a number, e.g.{" "}
                            <span className="font-medium text-foreground">100 fruits</span>
                          </>
                        ) : (
                          <>
                            Amount{" "}
                            <span className="font-medium text-foreground tabular-nums">
                              {symbol}0
                            </span>{" "}
                            — add a title
                          </>
                        )}
                      </p>
                    ))}

                  {/* Two-field modes: an always-on preview so the amount and the
                      "add a title" nudge are there even before you type a thing. */}
                  {!isCombined && (
                    <p className="px-0.5 text-xs text-muted-foreground">
                      Amount{" "}
                      <span className="font-medium text-foreground tabular-nums">
                        {symbol}
                        {previewAmount}
                      </span>
                      {title.trim() ? (
                        <>
                          {" · "}
                          <span className="font-medium text-foreground">{title.trim()}</span>
                        </>
                      ) : previewAmount > 0 ? (
                        " — now add a title"
                      ) : (
                        " — add a title"
                      )}
                    </p>
                  )}

                  {/* Staged files sit just above the input row, like drafted photos in a
                      chat composer. Scrolls if several are queued. */}
                  {staged.items.length > 0 ? (
                    <div className="max-h-40 space-y-2 overflow-y-auto">
                      <StagedAttachmentList
                        items={staged.items}
                        onRemove={staged.remove}
                        onUpdate={staged.update}
                        disabled={switching}
                      />
                    </div>
                  ) : null}

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
                        {standaloneAttach}
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
                    {tagActive && (
                      <div className="absolute bottom-full left-0 z-30 mb-1 w-72 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-lg border bg-popover p-1 shadow-md">
                        {tagResults.length > 0 ? (
                          <ul className="max-h-56 overflow-y-auto">
                            {tagResults.map((c, i) => (
                              <li key={c.id}>
                                <button
                                  type="button"
                                  // The list is no longer capped, so arrowing
                                  // down can walk past the scroll window.
                                  // "nearest" is a no-op when already visible.
                                  ref={(el) => {
                                    if (i === tagIdx) el?.scrollIntoView({ block: "nearest" });
                                  }}
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    selectTagCategory(c);
                                  }}
                                  className={cn(
                                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                                    i === tagIdx ? "bg-accent" : "hover:bg-muted",
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
                            No category matches “{tagQuery}”
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
                    className={cn("h-8 md:text-base", !showDescription && "hidden md:block")}
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
              </fieldset>
            </form>
          </div>
        </div>
      </div>

      <CategoryEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        categories={categories}
        defaultKind={type}
      />
    </div>
  );
}

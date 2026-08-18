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
import { ControlHint } from "./control-hint";
import { AiTransactionInput } from "./ai-transaction-input";
import { EntryModeToggle, MODE_ROW_DENSE } from "./entry-mode-toggle";
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
import { splitChipPaste } from "@/lib/quick-entry";
import { useIsMac, useShortcut } from "@/hooks/use-shortcut";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { comboFor, formatShortcut } from "@/lib/shortcuts";
import {
  AMOUNT_INTEGER_DIGITS_MAX,
  ATTACHMENT_MAX_PER_TRANSACTION,
  TRANSACTION_AMOUNT_MAX as AMOUNT_MAX,
  TRANSACTION_DESCRIPTION_MAX as DESCRIPTION_MAX,
  TRANSACTION_TITLE_MAX as TITLE_MAX,
} from "@/lib/validation";
import type { ComposerDensity, InputMode, TransactionInput } from "@/lib/validation";
import type { Category, Profile } from "@/db/schema";

// Matches a trailing "#query" token typed into the title field — "#" is the
// app-wide category trigger (in the AI note too).
const TAG_RE = /(?:^|\s)#([^\s#]*)$/;

// How much text the amount chip holds. Nine whole digits is the real cap
// (`AMOUNT_INTEGER_DIGITS_MAX`, enforced per keystroke below); this only stops a
// pasted wall of digits from stretching the chip across the whole field.
const CHIP_AMOUNT_MAX = 20;

export function TransactionComposer({
  categories,
  currency,
  locale = "en-US",
  today,
  profiles,
  activeProfileId,
  allProfiles = false,
  inputMode = "amount_title",
  density = "normal",
  isMobileHint = false,
  voiceLanguages,
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
  /** How much chrome surrounds those inputs (from user settings). */
  density?: ComposerDensity;
  /** Server's UA-based phone guess (`isMobileUA()`), so a phone's SSR HTML is
   * compact from the first paint instead of snapping after hydration. */
  isMobileHint?: boolean;
  /** Languages AI mode's mic expects (from user settings). */
  voiceLanguages: string[];
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
  // Single-field ("combined") mode is one box holding two zones: a currency chip
  // for the amount and the title beside it. `combined` is the title half;
  // `combinedAmount` is what's typed in the chip.
  const [combined, setCombined] = useState("");
  const [combinedAmount, setCombinedAmount] = useState("");
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
  // The amount inside the single field's chip — a different input from
  // `amountRef`, which belongs to the two-field layouts.
  const chipRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLInputElement>(null);
  const cats = useMemo(() => categories.filter((c) => c.kind === type), [categories, type]);
  const symbol = getCurrency(currency).symbol;
  const isMac = useIsMac();
  // "0.00" / "0,00" — the placeholder has to show the separator this user types.
  const placeholder = useMemo(() => amountPlaceholder(locale), [locale]);

  // Compact folds the whole control strip onto one line: every control drops to
  // its icon, the date loses the year, and the category slider moves up beside
  // them instead of claiming a row. What the labels and the inline ⌘ chips used
  // to say moves into hover tooltips (`ControlHint`), so nothing is lost — it
  // just costs a hover.
  //
  // **Mobile is compact-only.** Normal density spends a second row on the
  // category slider, which is desktop-only anyway (`categorySlider` is
  // `hidden md:block`), so on a phone that row renders empty — normal density
  // buys nothing there and costs vertical space the keyboard already wants.
  // The stored preference is overridden rather than offered; Settings says so
  // instead of silently disagreeing with what the user sees.
  const isMobile = useIsMobile(isMobileHint);
  const effectiveDensity: ComposerDensity = isMobile ? "compact" : density;
  const dense = effectiveDensity === "compact";

  const isCombined = inputMode === "combined";
  // The "/" category picker reads/writes whichever field holds the title text.
  const titleSource = isCombined ? combined : title;
  const setTitleSource = isCombined ? setCombined : setTitle;
  // The single field's two zones read exactly like the two-field layouts — the
  // chip is an amount input and the rest is a title input — so submit doesn't
  // care which layout produced them.
  const quick = isCombined
    ? { amount: parseAmountInput(combinedAmount, locale), title: combined.trim() }
    : null;
  // Typing into the chip is capped at 9 whole digits like any amount field, but
  // a *pasted* "100 fruits" can still land over the cap. Flag the field red then;
  // submit is blocked by the same check below.
  const combinedAmountOverLimit = quick?.amount != null && quick.amount > AMOUNT_MAX;

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

  /** Move the caret to the end of one of the single field's two zones. */
  function focusEnd(ref: React.RefObject<HTMLInputElement | null>) {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }

  function selectTagCategory(cat: Pick<Category, "id">) {
    setCategoryId(cat.id);
    setTitleSource((t) => t.replace(TAG_RE, "").replace(/\s+$/, ""));
    setTagDismissed(true);
    setTagIndex(0);
  }

  function submit() {
    // Ignore sends while switching profile — the target profile is changing.
    if (switching) return;
    // Every layout reads its amount against the user's locale, and all of them
    // yield null for anything ambiguous — never a silently mis-scaled number.
    const value = isCombined ? quick!.amount : parseAmountInput(amount, locale);
    const finalTitle = (isCombined ? quick!.title : title).trim();
    // Where the amount is typed in the layout that's on screen.
    const amountInputRef = isCombined ? chipRef : amountRef;

    if (value === null || value <= 0) {
      const example = formatAmountInput(12.5, locale);
      const typed = isCombined ? combinedAmount : amount;
      toast.error(
        value === null && typed.trim()
          ? `That amount isn't clear — try ${example}`
          : "Enter an amount greater than 0",
      );
      amountInputRef.current?.focus();
      return;
    }
    // Whole-number part capped at 9 digits; catches a pasted amount, which
    // doesn't pass through the per-keystroke guard.
    if (value > AMOUNT_MAX) {
      toast.error("Amount is too large (max 9 digits)");
      amountInputRef.current?.focus();
      return;
    }
    // A transaction needs an amount, a title, a date and a profile.
    if (!finalTitle) {
      toast.error("Add a title");
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
    setCombinedAmount("");
    setDescription("");
    setShowDescription(false);
    setCategoryId(null);
    setOccurredOn(today);
    setTagDismissed(false);
    // Back to whichever field the next entry starts in: the chip in single-field
    // mode, the title in title-first, the amount otherwise.
    (isCombined ? chipRef : inputMode === "title_amount" ? titleRef : amountRef).current?.focus();
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

  // The chip's amount: space (and Enter) hands over to the title, so "100 fruits"
  // is still one uninterrupted burst of typing — the space just moves the caret
  // instead of being typed. That costs a space as a grouping separator, which a
  // few locales use ("1 000"); typing the digits alone reads the same.
  function onChipKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // ⌘/Ctrl+Enter is the send shortcut printed on the Send button, and every
    // other field lets it through to `submit()`. The hand-over must not eat it.
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
      return;
    }
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      // Nothing in the chip yet: Enter still sends, so an empty composer says
      // what's missing instead of ignoring the key. A space just waits.
      if (combinedAmount.trim()) focusEnd(titleRef);
      else if (e.key === "Enter") submit();
      return;
    }
  }

  /**
   * Merge text into the single field's title half. Goes through here rather
   * than `setCombined` directly so a programmatic write keeps the two things a
   * keystroke in that field guarantees: the stored 40-char cap (`maxLength`
   * only ever constrains typing) and a re-armed "#" picker.
   */
  function addToTitle(text: string) {
    setCombined((t) => (t ? `${text} ${t}` : text).slice(0, TITLE_MAX));
    setTagDismissed(false);
    setTagIndex(0);
  }

  /**
   * Pasting into the chip, handled here rather than in `onChange` because a
   * paste and a keystroke want opposite things. `onChange` strips whatever
   * isn't part of an amount — right for a stray keypress, wrong for pasted
   * text, whose words would vanish without a trace — and the chip's `maxLength`
   * would clip "1200 rent for the flat" before there was anything left to split.
   */
  function onChipPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text");
    if (!text) return;
    e.preventDefault();
    const el = e.currentTarget;
    const merged =
      combinedAmount.slice(0, el.selectionStart ?? combinedAmount.length) +
      text +
      combinedAmount.slice(el.selectionEnd ?? combinedAmount.length);
    // Digits and separators only: nothing to split, so it lands as pasted.
    // Letting the browser do it instead would hand it to `onChange`'s
    // per-keystroke digit guard, which reverts the whole change — so pasting a
    // 12-digit number left the chip empty with nothing said, while the same
    // number with a title after it landed and was flagged red.
    if (!/[^\d.,\s]/.test(text)) {
      setCombinedAmount(merged.slice(0, CHIP_AMOUNT_MAX));
      return;
    }
    // "100 fruits" splits across the two zones; a paste that can't be read as
    // an amount plus a title lands in the title whole, chip empty, rather than
    // having a number guessed out of it (see `splitChipPaste`).
    const { amount, title } = splitChipPaste(merged, locale, getCurrency(currency).decimals);
    setCombinedAmount(amount.slice(0, CHIP_AMOUNT_MAX));
    if (!title) return;
    addToTitle(title);
    requestAnimationFrame(() => focusEnd(titleRef));
  }

  // The title half: Backspace at its start steps back into the chip, the way it
  // would if the two were one field.
  function onCombinedTitleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (
      e.key === "Backspace" &&
      e.currentTarget.selectionStart === 0 &&
      e.currentTarget.selectionEnd === 0
    ) {
      e.preventDefault();
      focusEnd(chipRef);
      return;
    }
    onTitleKeyDown(e);
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
        className="h-9 w-28 pl-7 tabular-nums md:text-base"
      />
    </div>
  );

  // The paperclip rides *inside* the title field, as a leading affordance —
  // attaching a receipt belongs to what you're describing, not to the
  // date/profile/category cluster it used to sit in.
  function attachTrigger(className: string) {
    return (
      <AttachmentDropzone
        variant="inline"
        onFiles={staged.add}
        remaining={ATTACHMENT_MAX_PER_TRANSACTION - staged.items.length}
        disabled={switching}
        className={className}
      />
    );
  }

  // Overlaid on the title field, which reserves `pl-9` so text never runs under it.
  const attachButton = attachTrigger("absolute top-1/2 left-0.5 size-7 -translate-y-1/2");

  // Amount-first mode instead puts the paperclip as a standalone leading button
  // at the very left of the row (left of the amount box), not inside a field.
  const standaloneAttach = attachTrigger("size-8 shrink-0 border");

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
        className={cn("h-9 w-full md:text-base", titleLeadsRow && "pl-9")}
      />
    </div>
  );

  // Single-field mode: one box, two zones — a currency chip holding the amount
  // and the title beside it. The chip is there from the first click, so the
  // field shows what it wants rather than explaining it in a line of prose
  // underneath; space (or Enter) hands over from the chip to the title, so
  // "100 fruits" is still typed in one go.
  //
  // Not an `<Input>`: the chip, the paperclip and the title are siblings inside
  // a shell that looks like an input (same border/ring tokens, with focus moved
  // to `focus-within`). `titleRef` stays on the title half, so the shortcuts and
  // the "#" picker that target it keep working.
  const combinedField = (
    <div
      className={cn(
        "flex h-9 min-w-32 flex-1 items-center gap-1.5 rounded-lg border border-input bg-transparent pr-2.5 pl-1 transition-colors dark:bg-input/30",
        // Red bar when the amount is over the 9-digit cap (submit is blocked
        // too). It *replaces* the focus ring rather than layering under it:
        // `focus-within:` carries a pseudo-class, so it outranks a plain
        // `border-destructive` and the field would stay blue for as long as the
        // caret is in the chip — which is exactly when the warning has to show.
        combinedAmountOverLimit
          ? "border-destructive ring-3 ring-destructive/20 dark:border-destructive/50 dark:ring-destructive/40"
          : "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
      )}
      // The shell's own padding is dead space in a real input; a click there
      // lands in whichever zone is still waiting to be filled.
      onMouseDown={(e) => {
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        focusEnd(combinedAmount.trim() ? titleRef : chipRef);
      }}
    >
      {attachTrigger("size-7 shrink-0")}
      {/* The amount chip. Its width follows what's typed (`ch` against tabular
          figures), so a long amount doesn't get its own scrollbar and a short
          one doesn't hold empty space in front of the title. */}
      <div
        className={cn(
          // 16px under `md`: iOS Safari zooms the viewport in on a focused
          // input below that, and this is the field the composer opens in.
          // Every other input in the composer forces 16px there for the same
          // reason; the chip reads as its own size on a desktop.
          "flex h-6 shrink-0 items-center gap-0.5 rounded-md pr-0.5 pl-1.5 text-base font-medium transition-colors md:text-sm",
          type === "income"
            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            : "bg-muted text-foreground",
        )}
      >
        <span aria-hidden className="opacity-70">
          {symbol}
        </span>
        <input
          ref={chipRef}
          inputMode="decimal"
          placeholder={placeholder}
          value={combinedAmount}
          maxLength={CHIP_AMOUNT_MAX}
          // Numbers only, same rules as the two-field amount box: digits plus
          // whatever a locale groups or points with, rejected once the
          // whole-number part hits 9 digits. Typed spaces never reach this —
          // the keydown handler turns them into the hand-over to the title —
          // and pasted text goes to `onChipPaste`, which splits it in two.
          onChange={(e) => {
            const next = e.target.value.replace(/[^\d.,\s]/g, "");
            setCombinedAmount((prev) => {
              const digits = integerDigitCount(next, locale);
              if (digits <= AMOUNT_INTEGER_DIGITS_MAX) return next;
              // Already over the cap — only a paste gets there, and it's shown
              // in red. Let an edit that shortens it through anyway, or
              // Backspace would be a no-op and the field a dead end.
              return digits < integerDigitCount(prev, locale) ? next : prev;
            });
          }}
          onPaste={onChipPaste}
          onKeyDown={onChipKeyDown}
          aria-label="Amount"
          aria-invalid={combinedAmountOverLimit || undefined}
          // Just enough slack past the digits for the caret — any more reads as
          // a gap between the number and the chip's right edge.
          style={{ width: `${Math.max(placeholder.length, combinedAmount.length) + 0.25}ch` }}
          className="bg-transparent tabular-nums outline-none placeholder:font-normal placeholder:text-muted-foreground"
        />
      </div>
      <input
        ref={titleRef}
        placeholder="Add a title — type # to tag a category"
        value={combined}
        maxLength={TITLE_MAX}
        onChange={(e) => {
          setCombined(e.target.value);
          setTagDismissed(false);
          setTagIndex(0);
        }}
        onKeyDown={onCombinedTitleKeyDown}
        // Clicking an untouched field starts in the chip, wherever the click
        // landed — the amount comes first in this layout, and a second click
        // gets to the title if that's really what was wanted.
        onMouseDown={(e) => {
          if (combinedAmount.trim() || combined) return;
          e.preventDefault();
          chipRef.current?.focus();
        }}
        aria-label="Title"
        className="h-full w-full min-w-0 bg-transparent text-base outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
      />
    </div>
  );

  // ---- Control-strip pieces -------------------------------------------------
  // Built as fragments because the two densities arrange them differently
  // enough that sharing one conditional tree stopped being readable: normal
  // spreads them over two rows, compact gathers them into a single grouped
  // widget (see the strip below).

  const typeToggle = (
    <div
      className={cn(
        // Keeps its own outline inside the compact group: the group says "these
        // belong together", each outline says "this one is a control". Dropping
        // them made the row read as undifferentiated chips.
        // `h-8` at every density: one control height across the whole strip, so
        // this measures exactly the same as the date, profile and category
        // controls it sits beside. Left intrinsic these drift a few pixels
        // apart, which reads as a mistake rather than a hierarchy.
        "inline-flex h-8 shrink-0 items-center rounded-full border bg-muted/50 p-0.5 text-sm",
      )}
    >
      {(["expense", "income"] as const).map((t) => {
        const active = type === t;
        // "+" reads as money in, "−" as money out (clearer than arrows).
        const Icon = t === "income" ? Plus : Minus;
        const color =
          t === "income"
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-rose-600 dark:text-rose-400";
        return (
          <ControlHint
            key={t}
            label={t === "income" ? "Income · money in" : "Expense · money out"}
            combo={toggleCombo}
            enabled={dense}
          >
            <button
              type="button"
              onClick={() => switchType(t)}
              aria-pressed={active}
              aria-label={t}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full py-1 capitalize transition-colors",
                dense ? "px-2" : "px-2.5 sm:px-3",
                active
                  ? "bg-background font-medium shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className={cn("size-4", color)} />
              {!dense && <span className="hidden sm:inline">{t}</span>}
              {/* The ⌘E hint rides inside the active capsule (desktop only) —
                  dense moves it into the tooltip. */}
              {active && !dense && (
                <Kbd combo={toggleCombo} className="hidden opacity-70 sm:inline-flex" />
              )}
            </button>
          </ControlHint>
        );
      })}
    </div>
  );

  const datePicker = (
    // No `ControlHint`: the button already reads "Aug 3", and it has no shortcut
    // to surface.
    <DatePicker
      value={occurredOn}
      max={today}
      onChange={setOccurredOn}
      compact
      dense={dense}
      // Outlined at both densities, so it reads as its own control inside the
      // compact group. Shorter there only so the group clears `MODE_ROW_DENSE`.
      className={cn("h-8 w-auto")}
    />
  );

  const profileSelect =
    allProfiles && profiles.length > 0 ? (
      <Select value={profileId} onValueChange={setProfileId}>
        <SelectTrigger
          // Keeps its outline inside the group too — same reasoning as the
          // type toggle and the date button.
          className={cn("h-8 w-auto gap-1")}
          aria-label="Profile for new transaction"
        >
          <span aria-hidden className="text-base leading-none">
            {currentProfile?.icon ?? "👤"}
          </span>
          <span
            className={cn(
              "max-w-24 truncate",
              // Dense never spends the width on the name — the emoji is the
              // profile's identity in the switcher too.
              dense ? "hidden" : "hidden md:inline",
            )}
          >
            {currentProfile?.name}
          </span>
        </SelectTrigger>
        {/* popper positioning is reliable for a small trigger pinned at the
            bottom of the screen; item-aligned mispositions there. */}
        <SelectContent align="end" position="popper">
          {profiles.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.icon ? `${p.icon} ` : ""}
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : null;

  /* Mobile: categories always collapse to a tag icon (every profile view — the
     slider is desktop-only). */
  const categoryTagButton = (
    // `flex`, not the default `block`: the button inside is `inline-flex`, which
    // shrink-to-fits its own content and overflows a narrower *block* parent
    // rather than shrinking with it. Making this a flex container turns the
    // button into a flex item, so the row's shrink pressure actually reaches it
    // and the name truncates. `min-w-0` + shrinkable (not `shrink-0`) because
    // the type and date controls beside it are fixed — this is the only one
    // that can give.
    <div className="flex min-w-0 shrink md:hidden">
      <CategoryRow
        compact
        categories={cats}
        value={categoryId}
        onChange={setCategoryId}
        onEdit={() => setEditorOpen(true)}
      />
    </div>
  );

  const categorySlider = (
    // `flex-1` only in compact, where this shares a *row* and should absorb the
    // slack. Normal stacks it in a column, where flex-1 would size it against
    // the column's height instead of the line's width.
    <div className={cn("hidden min-w-0 md:block", dense && "flex-1")}>
      <CategoryRow
        dense={dense}
        categories={cats}
        value={categoryId}
        onChange={setCategoryId}
        onEdit={() => setEditorOpen(true)}
      />
    </div>
  );

  return (
    // The strip carries the page background (not a tinted bar) so chat rows can't
    // show through the padding around/below the card as they scroll past — same
    // colour as the page, so it reads as the page, not a separate widget.
    <div className="sticky bottom-16 z-20 bg-background px-3 pt-2 pb-2 md:bottom-0">
      {/* Every widget lives inside one rounded, floating card, sitting on the
          page background — the tracker list scrolls up behind the strip's top
          edge, never peeking out beneath the card. */}
      <div
        className={cn(
          "mx-auto flex max-w-3xl flex-col gap-2 rounded-2xl border bg-background shadow-lg md:bg-background/95 md:backdrop-blur-sm",
          dense ? "p-2" : "p-2.5",
        )}
      >
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
            `hidden` and accept the small toggle shift.

            The AI note box also grows with what's typed in it, which would stretch
            Manual the same way. That one is handled inside `AiTransactionInput`:
            it only content-sizes while it's the visible pane, so what it reserves
            under Manual is always its empty height. */}
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
              // Effective, not stored: both panes must agree on density or the
              // Manual/AI toggle jumps between them on switch (see the grid note).
              density={effectiveDensity}
              voiceLanguages={voiceLanguages}
            />
          </div>

          <div
            className={cn(
              "col-start-1 row-start-1 flex min-w-0 flex-col",
              // The pane stretches to the shared cell so the control strip is
              // pinned to the top (matching AI's, which `h-full` already pins)
              // while the fields hang from the bottom — see `mt-auto` below.
              // Whatever the two panes differ by lands in the middle, where
              // nothing moves; the card never shows it as dead space under the
              // last field.
              mode === "manual" ? undefined : "invisible pointer-events-none",
            )}
          >
            <form
              className="flex flex-1 flex-col"
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
                className="m-0 flex min-w-0 flex-1 flex-col border-0 p-0 transition-opacity disabled:opacity-60"
              >
                <div className="flex flex-1 flex-col gap-1.5">
                  {/* Compact gathers the whole strip into one grouped widget so the
                      controls read as a set, with the Manual/AI switch left outside
                      it as its own raised button — it changes what the composer *is*,
                      the rest only fill in a field. Normal keeps the original two
                      rows: controls, then the category slider under them. */}
                  {dense ? (
                    // `MODE_ROW_DENSE` — the AI pane's header uses the identical
                    // class, which is what keeps the toggle from moving between
                    // the two panes.
                    <div className={MODE_ROW_DENSE}>
                      <EntryModeToggle mode={mode} onChange={changeMode} dense />
                      {/* Recessed (muted fill), like the Manual/AI toggle beside
                          it — the two read as one row of controls, separated by
                          the gap and their own outlines rather than by fill.

                          Width differs by breakpoint because the contents do.
                          From `md` up the category slider lives in here and wants
                          every spare pixel, so the group takes `flex-1`. Below
                          `md` the slider is a single tag button, so `flex-1`
                          would stretch the outline across a half-empty row —
                          instead it shrinks to its controls and `ml-auto` parks
                          the set on the right, under the user's thumb.

                          `h-9` is shared with the Manual/AI toggle so the two
                          containers read as one row; every control inside is
                          `h-8`, which clears this group's border + `py-0.5`. */}
                      {/* Padding is symmetric (`px-0.5`): the old `pr-1.5` left
                          a visible gap between the last control and the group's
                          right edge, which read as the group being wider than
                          its contents. */}
                      <div className="ml-auto flex h-9 min-w-0 items-center gap-1.5 rounded-full border bg-muted/40 px-0.5 py-0.5 md:ml-0 md:flex-1">
                        {typeToggle}
                        {datePicker}
                        {profileSelect}
                        {categoryTagButton}
                        {categorySlider}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-2">
                        <EntryModeToggle mode={mode} onChange={changeMode} />
                        {typeToggle}
                        {/* The paperclip used to live here; it's now a prefix inside
                            the title field (see `attachButton`). */}
                        <div className="ml-auto flex min-w-0 items-center gap-2">
                          {datePicker}
                          {profileSelect}
                          {categoryTagButton}
                        </div>
                      </div>
                      {/* Desktop: the full inline category slider on its own row. On
                          mobile it's the tag icon in the cluster above instead. */}
                      {categorySlider}
                    </div>
                  )}

                  {/* Everything below the strip hangs from the card's bottom edge
                      (`mt-auto`), leaving the strip pinned to the top. That split
                      is what lets the fields sit a few pixels off the bottom
                      without the Manual/AI toggle ever moving. */}
                  <div className="mt-auto flex flex-col gap-1.5">
                  {/* The single field used to carry a line of parse feedback under it
                      ("Amount ₹0 — add a title"). The amount chip says the same thing
                      in the field itself, so the line was a row of prose restating what
                      was already on screen — it's gone, and the card is that much
                      shorter. The over-limit warning stays at every density: it's the
                      only signal that submit is blocked. */}
                  {isCombined && combinedAmountOverLimit && (
                    <p className="px-0.5 text-xs text-destructive">Amount is too large (max 9 digits)</p>
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
                      className="h-9 shrink-0 md:hidden"
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
                    className={cn("h-9 md:text-base", !showDescription && "hidden md:block")}
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

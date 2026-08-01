"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ArrowUp,
  CornerDownRight,
  Loader2,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Kbd } from "@/components/ui/kbd";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getCurrency } from "@/lib/currencies";
import {
  amountPlaceholder,
  formatAmountInput,
  integerDigitCount,
  parseAmountInput,
} from "@/lib/parse-amount";
import {
  addBulkTransactions,
  parseTransactionsWithAI,
  transcribeVoiceNoteAction,
} from "@/actions/transactions";
import { MAX_INPUT_CHARS } from "@/lib/ai-limits";
import { primaryBcp47 } from "@/lib/voice-languages";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { useHoldShortcut, useIsMac } from "@/hooks/use-shortcut";
import { comboFor, formatShortcut } from "@/lib/shortcuts";
import { VoiceListeningStrip, VoiceMicButton } from "./voice-mic";
import {
  AMOUNT_INTEGER_DIGITS_MAX,
  TRANSACTION_DESCRIPTION_MAX as DESCRIPTION_MAX,
  TRANSACTION_TITLE_MAX as TITLE_MAX,
} from "@/lib/validation";
import type { BulkDraft } from "@/lib/bulk-parser";
import { cn } from "@/lib/utils";
import { EntryModeToggle, type EntryMode } from "./entry-mode-toggle";
import { AiHelpDialog } from "./ai-help-dialog";
import type { Category, Profile } from "@/db/schema";

const NONE = "none";

// Blue→violet AI accent — the same deliberate, gradient-free-app exception the
// mode toggle uses (see AGENTS.md). Applied to AI mode's primary actions.
const AI_BTN =
  "border-0 bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-sm hover:from-blue-600 hover:to-violet-700";

// A trailing "#query" immediately before the caret opens the category picker.
const TAG_RE = /(?:^|\s)#([^\s#]*)$/;

/** One reviewable draft, edited as strings (amount parsed on save). */
type Row = {
  key: number;
  type: "income" | "expense";
  amount: string;
  title: string;
  description: string;
  /** "" = no category. */
  categoryName: string;
  occurredOn: string;
};

/** Compact expense/income switch — the tracker's pill toggle stripped to icons. */
function RowTypeToggle({
  value,
  onChange,
}: {
  value: "income" | "expense";
  onChange: (t: "income" | "expense") => void;
}) {
  return (
    <div className="inline-flex shrink-0 items-center rounded-full border bg-muted/60 p-0.5">
      {(["expense", "income"] as const).map((t) => {
        const active = value === t;
        const Icon = t === "income" ? Plus : Minus;
        const color =
          t === "income"
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-rose-600 dark:text-rose-400";
        return (
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            aria-label={t}
            aria-pressed={active}
            className={cn(
              "inline-flex items-center justify-center rounded-full px-2.5 py-1 transition-all",
              active ? "bg-background shadow-sm" : "opacity-45 hover:opacity-90",
            )}
          >
            <Icon className={cn("size-4", color)} />
          </button>
        );
      })}
    </div>
  );
}

/**
 * The review row's description, on its own 2nd line under the title column. Reads
 * as plain muted text (or a faint prompt when empty) and turns into an input on
 * click — so a description is editable without adding a permanent field that
 * would crowd the fixed columns. Enter/Escape or blur commits.
 */
function DescriptionCell({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  // The ↵-style corner arrow marks this line as the title's description (it
  // points down-and-into the text on its right).
  const marker = (
    <CornerDownRight
      className="size-3.5 shrink-0 text-muted-foreground"
      aria-hidden
    />
  );

  if (editing) {
    return (
      <div className="col-span-3 col-start-3 flex min-w-0 items-center gap-1.5">
        {marker}
        <Input
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") {
              e.preventDefault();
              setEditing(false);
            }
          }}
          placeholder="Add a description"
          aria-label="Description"
          maxLength={DESCRIPTION_MAX}
          className="h-7 flex-1 text-sm"
        />
      </div>
    );
  }
  return (
    <div className="col-span-3 col-start-3 flex min-w-0 items-center gap-1.5">
      {marker}
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Click to edit the description"
        // No flex-1: the text sizes to its content (truncating only when it runs
        // out of room), so the pencil sits right after the last letter rather
        // than pinned to the cell's far edge.
        className="min-w-0 truncate text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        {value.trim() || (
          <span className="italic opacity-70">Add a description</span>
        )}
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Edit description"
        title="Edit description"
        onClick={() => setEditing(true)}
        className="size-6 shrink-0"
      >
        <Pencil className="size-3.5" />
      </Button>
    </div>
  );
}

/**
 * The composer's "AI" mode: the user types a free-text note, the model turns it
 * into one or more transaction drafts, and those are shown as an editable
 * preview to review before saving. Confirming reuses the existing bulk-save path
 * (`addBulkTransactions` → `createBulkFromDrafts`, which resolves categories by
 * name), so nothing new touches the DB — the AI only produces drafts.
 *
 * The note supports light markers, mirrored by the composer: `#Category` tags a
 * category (matched to an existing one, never invented) and shows a live picker
 * as you type; `(text)` is a description. The Manual/AI toggle rides at the
 * top-left of the first row (mirroring Manual, where it sits left of the type
 * switch), and `reset()` (↺) is the only thing that clears a note or preview, so
 * toggling to Manual and back never loses work.
 */
export function AiTransactionInput({
  mode,
  onModeChange,
  onReviewingChange,
  categories,
  currency,
  locale = "en-US",
  today,
  profiles,
  activeProfileId,
  allProfiles = false,
  voiceLanguages,
}: {
  mode: EntryMode;
  onModeChange: (m: EntryMode) => void;
  /** Tells the composer when the review list is up, so it can stop reserving
   * this pane's (much taller) height while Manual is the visible mode. */
  onReviewingChange?: (reviewing: boolean) => void;
  categories: Pick<Category, "id" | "name" | "kind" | "icon">[];
  currency: string;
  locale?: string;
  today: string;
  profiles: Pick<Profile, "id" | "name" | "icon">[];
  activeProfileId?: string;
  /** In "All profiles" the user picks a single target for the batch. */
  allProfiles?: boolean;
  /** Languages voice entry expects, from user settings (see settings/voice). */
  voiceLanguages: string[];
}) {
  const [text, setText] = useState("");
  // null = compose (textarea); an array = review the parsed drafts.
  const [rows, setRows] = useState<Row[] | null>(null);
  const [parsing, startParse] = useTransition();
  const [saving, startSave] = useTransition();
  const [profileId, setProfileId] = useState(activeProfileId ?? profiles[0]?.id ?? "");
  const idRef = useRef(0);
  const nextKey = () => ++idRef.current;

  const reviewing = rows !== null;
  useEffect(() => {
    onReviewingChange?.(reviewing);
  }, [reviewing, onReviewingChange]);

  // "#" category autocomplete over the note textarea.
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const [tagDismissed, setTagDismissed] = useState(false);
  const [tagIndex, setTagIndex] = useState(0);

  const symbol = getCurrency(currency).symbol;
  const isMac = useIsMac();
  const placeholder = useMemo(() => amountPlaceholder(locale), [locale]);
  const targetProfileId = allProfiles
    ? profileId
    : (activeProfileId ?? profiles[0]?.id ?? "");
  const currentProfile = profiles.find((p) => p.id === profileId) ?? profiles[0] ?? null;

  const tagMatch = text.slice(0, caret).match(TAG_RE);
  const tagQuery = tagMatch?.[1] ?? "";
  const tagActive = !!tagMatch && !tagDismissed && !parsing;
  // Both kinds are offered (the item's type isn't known yet at typing time) and
  // colored — emerald income / red expense — like the transactions dropdown. The
  // model resolves the tag to the category of the matching kind on parse.
  const tagResults = tagActive
    ? categories
        .filter((c) => c.name.toLowerCase().includes(tagQuery.toLowerCase()))
        .slice(0, 10)
    : [];
  const tagIdx = tagResults.length ? Math.min(tagIndex, tagResults.length - 1) : 0;

  const parseAmount = (s: string) => parseAmountInput(s, locale);
  const isPositive = (s: string) => {
    const n = parseAmount(s);
    return n !== null && n > 0;
  };

  const validRows = rows?.filter((r) => isPositive(r.amount) && r.title.trim()) ?? [];

  function patch(key: number, change: Partial<Row>) {
    setRows((rs) => (rs ? rs.map((r) => (r.key === key ? { ...r, ...change } : r)) : rs));
  }
  function removeRow(key: number) {
    setRows((rs) => (rs ? rs.filter((r) => r.key !== key) : rs));
  }
  // Add a blank draft to the review list — for a transaction the note missed.
  // It starts invalid (no amount/title), so it isn't counted or saved until
  // filled in.
  function addRow() {
    setRows((rs) =>
      rs
        ? [
            ...rs,
            {
              key: nextKey(),
              type: "expense",
              amount: "",
              title: "",
              description: "",
              categoryName: "",
              occurredOn: today,
            },
          ]
        : rs,
    );
  }
  function reset() {
    setText("");
    setRows(null);
    setCaret(0);
    setTagDismissed(false);
  }

  // Replace the "#query" before the caret with the picked category name.
  function insertTag(name: string) {
    const el = taRef.current;
    const c = el ? (el.selectionStart ?? caret) : caret;
    const before = text.slice(0, c);
    const after = text.slice(c);
    const m = before.match(TAG_RE);
    if (!m) return;
    const hashStart = before.length - m[0].length + (m[0].length - m[0].trimStart().length);
    const insert = `#${name} `;
    const next = before.slice(0, hashStart) + insert + after;
    const pos = hashStart + insert.length;
    setText(next);
    setTagDismissed(true);
    requestAnimationFrame(() => {
      const node = taRef.current;
      if (node) {
        node.focus();
        node.setSelectionRange(pos, pos);
      }
      setCaret(pos);
    });
  }

  // Drop the drafts but keep the note, so a bad split can be corrected by
  // editing what you typed instead of retyping it from scratch.
  function backToNote() {
    setRows(null);
    requestAnimationFrame(() => {
      const node = taRef.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(node.value.length, node.value.length);
    });
  }

  // The ↺ reset clears everything — the deliberate "start over". Editing the
  // note again goes through `backToNote`, which keeps the text.
  const canReset = text.trim().length > 0 || rows !== null;
  const resetButton = (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label="Start over"
      title="Start over"
      onClick={reset}
      disabled={parsing || saving}
    >
      <RotateCcw className="size-4" />
    </Button>
  );

  function handleParse() {
    const note = text.trim();
    if (!note) {
      toast.error("Type a note first");
      return;
    }
    startParse(async () => {
      const res = await parseTransactionsWithAI(note);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setRows(
        res.drafts.map((d) => ({
          key: nextKey(),
          type: d.type,
          amount: formatAmountInput(d.amount, locale),
          title: d.title,
          description: d.description ?? "",
          categoryName: d.categoryName ?? "",
          occurredOn: d.occurredOn,
        })),
      );
    });
  }

  // ── Voice entry ───────────────────────────────────────────────────────────
  // Hold the mic (or M) to record; on release the audio goes to the server and
  // the transcript is *appended to the note* rather than parsed. That's the
  // deliberate stopping point: you read what it heard, fix a misheard merchant,
  // and press send yourself. Appending (not replacing) also lets a note be
  // dictated in pieces, or typed and then added to by voice.
  const voice = useVoiceRecorder({
    lang: primaryBcp47(voiceLanguages),
    onError: (message) => toast.error(message),
    onTranscribe: async (audio) => {
      // Multipart, not a base64 argument: Next dumps server-action arguments
      // into the dev terminal verbatim, so an encoded recording would be logged
      // in full on every use. A FormData logs as `{}`.
      const body = new FormData();
      body.append("audio", audio.blob, "voice-note");
      body.append("mimeType", audio.mimeType);
      const res = await transcribeVoiceNoteAction(body);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      // Read the note off the textarea rather than through a `setText` updater:
      // the toast below is a side effect, and StrictMode invokes updaters twice
      // (which would double it). The textarea is controlled, so its DOM value is
      // the committed state, and it's mounted for the whole of this callback —
      // voice is only enabled while the compose view is showing.
      const prev = (taRef.current?.value ?? "").trim();
      const joined = prev ? `${prev} ${res.text}` : res.text;
      // Dictating onto an already-long note can overflow the cap. Say so —
      // silently dropping the tail means the user watches the mic finish and
      // never learns that part of what they just said didn't make it.
      if (joined.length > MAX_INPUT_CHARS) {
        toast.warning("Your note is full — the end of that recording was cut off.");
      }
      setText(joined.slice(0, MAX_INPUT_CHARS));
      setTagDismissed(true);
      requestAnimationFrame(() => {
        const node = taRef.current;
        if (!node) return;
        node.focus();
        node.setSelectionRange(node.value.length, node.value.length);
        setCaret(node.value.length);
      });
    },
  });

  const voiceCombo = comboFor("tracker.voice");
  const voiceHint = formatShortcut(voiceCombo, isMac);
  // Only while AI mode is the visible pane and the note is being composed —
  // the review list has no textarea to dictate into. `allowInInput` stays false
  // so typing "m" in the note types an m, exactly like the other bare-key
  // shortcuts.
  const voiceEnabled = mode === "ai" && !rows && !parsing;
  useHoldShortcut(voiceCombo, voice.start, voice.stop, {
    enabled: voiceEnabled,
    requireNoOverlay: true,
  });

  function handleConfirm() {
    if (!rows) return;
    if (validRows.length === 0) {
      toast.error("Add an amount and a title to at least one row");
      return;
    }
    if (!targetProfileId) {
      toast.error("Pick a profile");
      return;
    }
    const drafts: BulkDraft[] = validRows.map((r) => ({
      type: r.type,
      amount: parseAmount(r.amount)!,
      title: r.title.trim(),
      description: r.description.trim() || undefined,
      note: "",
      categoryName: r.categoryName || null,
      profileId: targetProfileId || undefined,
      occurredOn: r.occurredOn || today,
    }));
    startSave(async () => {
      const res = await addBulkTransactions(drafts);
      if (res.ok) {
        toast.success(`Added ${res.count} transaction${res.count === 1 ? "" : "s"}`);
        reset();
      } else {
        toast.error(res.error);
      }
    });
  }

  function onTextareaKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
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
        insertTag(tagResults[tagIdx].name);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setTagDismissed(true);
        return;
      }
    }
    // ⌘/Ctrl+Enter parses; plain Enter stays a newline (it's a note).
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleParse();
    }
  }

  const tagMenu = tagActive ? (
    <div className="absolute bottom-full left-0 z-30 mb-1 w-72 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-lg border bg-popover p-1 shadow-md">
      {tagResults.length > 0 ? (
        <ul className="max-h-56 overflow-y-auto">
          {tagResults.map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertTag(c.name);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                  i === tagIdx ? "bg-accent" : "hover:bg-muted",
                )}
              >
                <span aria-hidden>{c.icon ?? "🏷️"}</span>
                <span
                  className={cn(
                    "truncate",
                    c.kind === "income"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400",
                  )}
                >
                  {c.name}
                </span>
                <span
                  aria-hidden
                  className="ml-auto text-sm uppercase tracking-wide text-muted-foreground"
                >
                  {c.kind === "income" ? "in" : "out"}
                </span>
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
  ) : null;

  // Compose state: the free-text note + a parse button.
  if (!rows) {
    return (
      // h-full so the note box can flex-fill the card down to a little gap above
      // the bottom (the card is sized to the taller Manual column).
      <div className="flex h-full flex-col gap-2">
        <div className="flex items-center gap-2">
          <EntryModeToggle mode={mode} onChange={onModeChange} />
          <div className="ml-auto flex items-center gap-1">
            <AiHelpDialog symbol={symbol} />
            {canReset && resetButton}
          </div>
        </div>
        {/* ChatGPT-style: one rounded box with the send button pinned inside its
            bottom-right corner. The textarea reserves room (pr/pb) so the note
            never runs under the button. */}
        {/* While the mic is held: interim words (or the level meter where the
            browser has no Web Speech API). Sits above the note so it never
            covers what's already typed. */}
        <VoiceListeningStrip
          state={voice.state}
          interim={voice.interim}
          level={voice.level}
          liveSupported={voice.liveSupported}
        />
        {/* Fills the leftover card height, capped at ~6 lines then it scrolls. */}
        <div className="relative flex max-h-52 min-h-0 flex-1 flex-col">
          {tagMenu}
          <Textarea
            ref={taRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setCaret(e.target.selectionStart ?? e.target.value.length);
              setTagDismissed(false);
              setTagIndex(0);
            }}
            onKeyDown={onTextareaKeyDown}
            onKeyUp={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
            onClick={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
            rows={2}
            // The server rejects anything longer; stop it here so a big paste
            // doesn't cost a round-trip (and a quota slot) just to be refused.
            maxLength={MAX_INPUT_CHARS}
            placeholder="Describe your spending — e.g. 200 fruits, 1000 electricity (June bill) #Bills, got 5000 salary"
            aria-label="Describe your transactions"
            // pr-24 (not pr-14) reserves the corner for both buttons — mic and
            // send — so a long note never runs underneath them.
            className="field-sizing-fixed min-h-0 flex-1 resize-none pr-24 pb-12 md:text-base"
            disabled={parsing}
          />
          {/* Mic left of send: dictate, then send — left to right, in order. */}
          <div className="absolute right-2 bottom-2 flex items-center gap-1">
            <VoiceMicButton
              state={voice.state}
              level={voice.level}
              disabled={parsing}
              onStart={voice.start}
              onStop={voice.stop}
              hint={voiceHint ? `hold ${voiceHint}` : undefined}
            />
            <Button
              type="button"
              onClick={handleParse}
              disabled={parsing || !text.trim()}
              aria-label="Turn your note into transactions"
              title="Turn your note into transactions"
              className={cn("size-10 shrink-0 rounded-full p-0", AI_BTN)}
            >
              {parsing ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <ArrowUp className="size-5" />
              )}
            </Button>
          </div>
        </div>
        <p className="px-0.5 text-sm text-muted-foreground">
          Type or hold <Kbd combo={voiceCombo} className="align-middle" /> to speak — use{" "}
          <span className="font-mono text-foreground">#</span> for a category and{" "}
          <span className="font-mono text-foreground">( )</span> for a note.
        </p>
      </div>
    );
  }

  // Review state: an editable row per parsed draft, then confirm.
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <EntryModeToggle mode={mode} onChange={onModeChange} />
        <p className="min-w-0 flex-1 truncate text-sm font-medium">
          Review {rows.length} transaction{rows.length === 1 ? "" : "s"}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          {allProfiles && profiles.length > 0 && (
            <Select value={profileId} onValueChange={setProfileId}>
              <SelectTrigger
                className="h-8 w-auto gap-1"
                aria-label="Profile for these transactions"
              >
                <span aria-hidden className="text-base leading-none">
                  {currentProfile?.icon ?? "👤"}
                </span>
                <span className="hidden max-w-24 truncate md:inline">
                  {currentProfile?.name}
                </span>
              </SelectTrigger>
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
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Edit the note and parse again"
            title="Edit the note and parse again"
            onClick={backToNote}
            disabled={saving}
          >
            <Pencil className="size-4" />
          </Button>
          <AiHelpDialog symbol={symbol} />
          {resetButton}
        </div>
      </div>

      {/* The note that produced these drafts, so the user can check the parse
          against what they typed — and click it to go back and fix a bad split
          without retyping. Caps at ~4 lines, then scrolls. It sits outside the
          row scroller below, so it stays put as rows scroll. */}
      {text.trim() && (
        <button
          type="button"
          onClick={backToNote}
          disabled={saving}
          title="Edit the note and parse again"
          className="max-h-24 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border bg-muted/40 px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/70"
        >
          {text.trim()}
        </button>
      )}

      {/* Fixed, uniform columns across every row (a shared grid template). If the
          viewport is narrower than the row, the whole list scrolls sideways as
          one — columns never shift row-to-row, and nothing wraps to a 2nd line
          except the optional description. */}
      <div className="max-h-72 overflow-auto">
        <div className="min-w-[38rem] space-y-2 pr-1">
          {rows.map((r) => {
            const cats = categories.filter((c) => c.kind === r.type);
            return (
              <div
                key={r.key}
                className="grid grid-cols-[auto_5.5rem_minmax(6rem,1fr)_8.5rem_8.5rem_auto] items-center gap-x-2 gap-y-1 rounded-lg border bg-muted/30 p-2"
              >
                <RowTypeToggle
                  value={r.type}
                  onChange={(t) => patch(r.key, { type: t, categoryName: "" })}
                />
                <div className="relative">
                  <span className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-xs text-muted-foreground">
                    {symbol}
                  </span>
                  <Input
                    inputMode="decimal"
                    value={r.amount}
                    // Same 9-digit guard the manual composer applies per
                    // keystroke. Without it an over-cap row looks valid here and
                    // is then silently dropped by `createBulkFromDrafts`, so the
                    // user is told "Added 4" after confirming 5.
                    onChange={(e) => {
                      const next = e.target.value.replace(/[^\d.,\s]/g, "");
                      if (integerDigitCount(next, locale) > AMOUNT_INTEGER_DIGITS_MAX) return;
                      patch(r.key, { amount: next });
                    }}
                    placeholder={placeholder}
                    aria-label="Amount"
                    aria-invalid={!isPositive(r.amount) || undefined}
                    className="h-8 w-full pl-6 tabular-nums"
                  />
                </div>
                <Input
                  value={r.title}
                  onChange={(e) => patch(r.key, { title: e.target.value })}
                  placeholder="Title"
                  aria-label="Title"
                  aria-invalid={!r.title.trim() || undefined}
                  maxLength={TITLE_MAX}
                  className="h-8 w-full"
                />
                <Select
                  value={r.categoryName || NONE}
                  onValueChange={(v) => patch(r.key, { categoryName: v === NONE ? "" : v })}
                >
                  <SelectTrigger className="h-8 w-full" aria-label="Category">
                    <SelectValue placeholder="No category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No category</SelectItem>
                    {cats.map((c) => (
                      <SelectItem key={c.id} value={c.name}>
                        {c.icon ? `${c.icon} ` : ""}
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <DatePicker
                  value={r.occurredOn}
                  max={today}
                  onChange={(iso) => patch(r.key, { occurredOn: iso })}
                  compact
                  className="h-8 w-full"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove transaction"
                  onClick={() => removeRow(r.key)}
                  className="shrink-0"
                >
                  <Trash2 className="size-3.5" />
                </Button>
                {/* Description on its own line, aligned under the title column —
                    click-to-edit so it can be added or fixed after the parse. */}
                <DescriptionCell
                  value={r.description}
                  onChange={(v) => patch(r.key, { description: v })}
                />
              </div>
            );
          })}
          {/* Add a row the note missed — a blank draft to fill in by hand. */}
          <button
            type="button"
            onClick={addRow}
            disabled={saving}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed py-2 text-sm text-muted-foreground transition-colors hover:border-solid hover:bg-muted/50 hover:text-foreground"
          >
            <Plus className="size-4" />
            Add transaction
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 text-xs text-muted-foreground">
          Edit anything that looks off, then save.
        </p>
        <Button
          type="button"
          onClick={handleConfirm}
          disabled={saving || validRows.length === 0}
          className={cn("h-9 shrink-0 gap-1.5", AI_BTN)}
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ArrowUp className="size-4" />
          )}
          {saving ? "Saving…" : `Add ${validRows.length}`}
        </Button>
      </div>
    </div>
  );
}

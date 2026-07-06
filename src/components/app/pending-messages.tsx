"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { RotateCcw, X } from "lucide-react";
import { TransactionBubble, bubbleAmountLabel } from "./transaction-bubble";
import { addTransaction } from "@/actions/transactions";
import { cn } from "@/lib/utils";
import type { TransactionInput } from "@/lib/validation";

/**
 * A transaction the user just sent, rendered as a chat bubble beneath the real
 * feed (WhatsApp-style). Lifecycle:
 *   - "sending": bubble appears instantly with a "sending" coin.
 *   - "sent":    the coin is dropped but the bubble stays put — identical to a
 *                real one — until the revalidated server feed catches up, at
 *                which point it's swapped out by id in the same commit (no flash).
 *   - "failed":  the save failed; the bubble offers a retry instead of vanishing.
 */
export type PendingTx = {
  tempId: string;
  status: "sending" | "sent" | "failed";
  error?: string;
  /** Server id, known once "sent" — used to drop the ghost when the feed shows it. */
  realId?: string;
  /** The exact payload we sent, kept so "Try again" replays it verbatim. */
  input: TransactionInput;
  createdAt: Date;
  // Snapshot of the display fields so the bubble renders with no DB round-trip.
  type: "income" | "expense";
  amountMinor: number;
  title: string | null;
  description: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  /** Target profile — used to keep a ghost from leaking into another profile's view. */
  profileId: string | null;
};

/** What the composer hands to `send()` (identity/status/time are assigned internally). */
export type PendingDraft = Omit<
  PendingTx,
  "tempId" | "status" | "error" | "realId" | "createdAt"
>;

type PendingContextValue = {
  pending: PendingTx[];
  send: (draft: PendingDraft) => void;
  retry: (tempId: string) => void;
  dismiss: (tempId: string) => void;
};

const PendingContext = createContext<PendingContextValue | null>(null);

export function usePendingMessages(): PendingContextValue {
  const ctx = useContext(PendingContext);
  if (!ctx) {
    throw new Error("usePendingMessages must be used within <PendingMessagesProvider>");
  }
  return ctx;
}

/**
 * Owns the list of in-flight/sent/failed sends and the server round-trip. Wraps
 * both the composer (which calls `send`) and the feed (which renders the
 * bubbles), so a submit can paint a bubble instantly without those siblings
 * sharing state.
 */
export function PendingMessagesProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingTx[]>([]);
  // Keeps the RSC revalidation that `addTransaction` triggers off the main thread.
  const [, startTransition] = useTransition();

  const run = useCallback(
    (tempId: string, input: TransactionInput) => {
      startTransition(async () => {
        const res = await addTransaction(input);
        setPending((prev) =>
          prev.map((m) => {
            if (m.tempId !== tempId) return m;
            // Success: keep the bubble, just record the server id and drop the
            // coin. `FeedRegion` retires it once the revalidated feed shows the
            // real row — so the tile never disappears.
            return res.ok
              ? { ...m, status: "sent", realId: res.id, error: undefined }
              : { ...m, status: "failed", error: res.error };
          }),
        );
      });
    },
    [startTransition],
  );

  const send = useCallback(
    (draft: PendingDraft) => {
      const tempId = crypto.randomUUID();
      setPending((prev) => [
        ...prev,
        { ...draft, tempId, status: "sending", createdAt: new Date() },
      ]);
      run(tempId, draft.input);
    },
    [run],
  );

  const retry = useCallback(
    (tempId: string) => {
      const target = pending.find((m) => m.tempId === tempId);
      if (!target) return;
      setPending((prev) =>
        prev.map((m) =>
          m.tempId === tempId ? { ...m, status: "sending", error: undefined } : m,
        ),
      );
      run(tempId, target.input);
    },
    [pending, run],
  );

  const dismiss = useCallback((tempId: string) => {
    setPending((prev) => prev.filter((m) => m.tempId !== tempId));
  }, []);

  const value = useMemo(
    () => ({ pending, send, retry, dismiss }),
    [pending, send, retry, dismiss],
  );

  return <PendingContext.Provider value={value}>{children}</PendingContext.Provider>;
}

function formatTime(value: Date, locale: string, timeZone: string): string {
  return value.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit", timeZone });
}

/**
 * Renders the real feed (`children`, a server component) plus any pending
 * bubbles for the profile in view. A "sent" bubble is dropped the moment its
 * real row shows up in `rowIds` — filtered out in the same render the server
 * row appears, so the swap is seamless (no disappear-and-reappear). Also
 * suppresses the feed's empty state while a bubble is showing, and scrolls a
 * fresh bubble into view.
 */
export function FeedRegion({
  hasRows,
  rowIds,
  currency,
  locale,
  timeZone,
  profileId,
  children,
}: {
  hasRows: boolean;
  /** Transaction ids currently in the server feed; a "sent" ghost retires once its id lands here. */
  rowIds: string[];
  currency: string;
  locale: string;
  timeZone: string;
  /** Profile currently in view; null = "All profiles" (shows every bubble). */
  profileId: string | null;
  children: ReactNode;
}) {
  const { pending, retry, dismiss } = usePendingMessages();

  const serverIds = useMemo(() => new Set(rowIds), [rowIds]);
  const confirmed = useCallback(
    (m: PendingTx) => m.status === "sent" && m.realId !== undefined && serverIds.has(m.realId),
    [serverIds],
  );

  const mine = useMemo(
    () =>
      pending.filter(
        (m) => (profileId === null || m.profileId === profileId) && !confirmed(m),
      ),
    [pending, profileId, confirmed],
  );

  // Retire ghosts the server feed has caught up on. They're already filtered
  // out of `mine` above (so no visual overlap); this just keeps state tidy.
  useEffect(() => {
    const done = pending.filter(confirmed);
    if (done.length > 0) done.forEach((m) => dismiss(m.tempId));
  }, [pending, confirmed, dismiss]);

  // A new bubble should pin to the bottom the way a real message does.
  useEffect(() => {
    if (mine.length > 0) {
      window.scrollTo({ top: document.body.scrollHeight, behavior: "auto" });
    }
  }, [mine.length]);

  // Keep the empty state only when there's genuinely nothing to show.
  const showFeed = hasRows || mine.length === 0;

  return (
    <div className="space-y-2">
      {showFeed ? children : null}
      {mine.length > 0 ? (
        <div className="space-y-2">
          {mine.map((m) => (
            <PendingBubble
              key={m.tempId}
              tx={m}
              currency={currency}
              locale={locale}
              timeZone={timeZone}
              onRetry={() => retry(m.tempId)}
              onDismiss={() => dismiss(m.tempId)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PendingBubble({
  tx,
  currency,
  locale,
  timeZone,
  onRetry,
  onDismiss,
}: {
  tx: PendingTx;
  currency: string;
  locale: string;
  timeZone: string;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const amountLabel = bubbleAmountLabel(tx.type, tx.amountMinor, currency, locale);
  const sending = tx.status === "sending";
  const failed = tx.status === "failed";

  return (
    <TransactionBubble
      type={tx.type}
      amountLabel={amountLabel}
      title={tx.title}
      description={tx.description}
      categoryName={tx.categoryName}
      categoryIcon={tx.categoryIcon}
      // Once sent it reads exactly like a real bubble (time in the corner);
      // while sending it dims and shows the coin instead.
      timeLabel={tx.status === "sent" ? formatTime(tx.createdAt, locale, timeZone) : undefined}
      className={cn("transition-opacity", sending && "opacity-60")}
      actions={
        failed ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="font-medium text-rose-600 dark:text-rose-400">Not sent</span>
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-medium text-foreground hover:bg-muted"
            >
              <RotateCcw className="size-3" />
              Try again
            </button>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Discard unsent transaction"
              className="inline-flex items-center rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </span>
        ) : sending ? (
          <SendingIndicator />
        ) : undefined
      }
    />
  );
}

/**
 * The "sending" indicator: a tiny coin flipping on its edge next to "Sending…".
 * Reads as both money (a coin) and activity (the flip); currency-agnostic.
 */
function SendingIndicator() {
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <span
        aria-hidden
        className="inline-block size-3 rounded-full bg-amber-400 ring-1 ring-amber-600/40 animate-coin-flip"
      />
      <span>Sending…</span>
    </span>
  );
}

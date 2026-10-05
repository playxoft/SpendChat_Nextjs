import type { MouseEvent, ReactElement, ReactNode } from "react";
import { Check } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AttachmentList, type ListAttachment } from "./attachments/attachment-list";
import { FittedTagList } from "./tags/fitted-tag-list";
import type { ChipTag } from "./tags/tag-chip";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

export function amountToneClass(type: "income" | "expense"): string {
  return type === "income"
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-foreground";
}

/**
 * Amount label for a chat bubble. Expenses carry no sign — the neutral color
 * already reads as money out — while income keeps a leading "+" (with its
 * emerald tone). `amountMinor` is the stored positive value.
 */
export function bubbleAmountLabel(
  type: "income" | "expense",
  amountMinor: number,
  currency: string,
  locale: string,
): string {
  return type === "income"
    ? formatMoney(amountMinor, currency, locale, { signed: true })
    : formatMoney(amountMinor, currency, locale);
}

/**
 * A transaction rendered as a chat bubble. Income ("incoming") aligns left;
 * expense ("outgoing") aligns right, like sent vs. received messages.
 *
 * Layout: the title sits up top (with the amount), the description shows below
 * it as a subtitle, and the footer carries the category on the left, then the
 * tags, then the time on the right. The bubble grows to fit the description —
 * there is no expand/collapse toggle.
 */
export function TransactionBubble({
  type,
  amountLabel,
  title,
  description,
  categoryName,
  categoryIcon,
  tags,
  timeLabel,
  attachments,
  onOpenAttachment,
  authorName,
  authorColorClass,
  onActivate,
  actions,
  selected = false,
  selecting = false,
  onToggleSelect,
  renderCard,
  className,
}: {
  type: "income" | "expense";
  amountLabel: string;
  title?: string | null;
  description?: string | null;
  categoryName?: string | null;
  categoryIcon?: string | null;
  /** The transaction's tags, rendered as chips in the footer row. */
  tags?: ChipTag[];
  timeLabel?: string;
  /** Files attached to this transaction; rendered as a vertical list of rows. */
  attachments?: ListAttachment[];
  /** Opens a file in the in-page preview (omit for staged/pending). */
  onOpenAttachment?: (a: ListAttachment) => void;
  /** WhatsApp-group-style author label; when set, shown atop the bubble. Only
   * passed in shared workspaces — a solo workspace leaves it undefined. */
  authorName?: string | null;
  /** Tailwind text-color classes for the author name (stable per user). */
  authorColorClass?: string;
  /** Click / Enter on the bubble. Gets the click so a caller can read Shift. */
  onActivate?: (e?: MouseEvent) => void;
  actions?: ReactNode;
  /** Multi-select: this bubble is picked. */
  selected?: boolean;
  /** Multi-select is under way, so every bubble shows its select ring. */
  selecting?: boolean;
  /** Offers the select ring under the category icon; `range` is Shift held,
   *  to extend the selection. */
  onToggleSelect?: (range: boolean) => void;
  /** Wraps the message card — the feed's right-click menu goes around it, so
   *  it opens on the message and not on the empty row beside it. */
  renderCard?: (card: ReactElement) => ReactNode;
  className?: string;
}) {
  const side: "left" | "right" = type === "income" ? "left" : "right";
  const heading = title?.trim() || categoryName || "Transaction";

  function handleKeyDown(e: React.KeyboardEvent) {
    // Enter and Space, as a `role="button"` should — Space is how a toggle
    // button is usually pressed, and the card is one while selecting.
    if ((e.key === "Enter" || e.key === " ") && onActivate) {
      e.preventDefault();
      onActivate();
    }
  }

  const card = (
    <div
      role={onActivate ? "button" : undefined}
      tabIndex={onActivate ? 0 : undefined}
      aria-pressed={selecting ? selected : undefined}
      onClick={onActivate}
      onKeyDown={onActivate ? handleKeyDown : undefined}
      className={cn(
        "min-w-0 flex-1 rounded-2xl border bg-card px-3 py-2 shadow-sm outline-none sm:px-3.5 sm:py-2.5",
        side === "left" ? "rounded-tl-sm" : "rounded-tr-sm",
        onActivate &&
          "cursor-pointer transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50",
        // Picked: the primary ring reads as "in the selection" at a glance,
        // the way the checked ring beside it does up close.
        selected && "bg-primary/5 ring-2 ring-primary/60 hover:bg-primary/10",
        // A long press opens the feed's menu on a phone; it shouldn't start
        // selecting the text underneath. A mouse can still select it to copy.
        renderCard && "pointer-coarse:select-none pointer-coarse:[-webkit-touch-callout:none]",
      )}
    >
      {authorName ? (
        <div className={cn("mb-0.5 truncate text-xs font-semibold", authorColorClass)}>
          {authorName}
        </div>
      ) : null}

      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 text-sm font-medium break-words">{heading}</span>
        <span
          className={cn(
            "shrink-0 text-base font-semibold tabular-nums",
            amountToneClass(type),
          )}
        >
          {amountLabel}
        </span>
      </div>

      {description ? (
        <p className="mt-0.5 text-sm break-words whitespace-pre-wrap text-muted-foreground">
          {description}
        </p>
      ) : null}

      {attachments && attachments.length > 0 ? (
        <AttachmentList
          attachments={attachments}
          onOpen={onOpenAttachment}
          className="mt-1.5"
        />
      ) : null}

      <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex min-w-0 items-center gap-1">
          <span aria-hidden className="shrink-0">
            {categoryIcon ?? "🏷️"}
          </span>
          <span className="truncate">{categoryName ?? "Uncategorized"}</span>
        </span>
        {/* Tags share the category's row instead of taking one of their own:
            the category keeps its full name, the tags take whatever room is
            left (right-aligned, so they only occupy what they need), and the
            ones that don't fit fold into a "+N" whose tooltip lists them all.
            `flex-1` is what makes the measuring work — the box's width comes
            from the row, not from how many chips it is showing. `min-w-8`
            keeps room for the counter when a long category name would
            otherwise squeeze the tags to nothing. Chips drop to `text-xs` to
            sit on the footer's scale rather than outweigh the category. */}
        {tags && tags.length > 0 ? (
          <FittedTagList
            tags={tags}
            className="min-w-8 flex-1 justify-end"
            chipClassName="text-xs"
          />
        ) : null}
        <span className="ml-auto inline-flex shrink-0 items-center gap-1.5">
          {timeLabel ? <span>{timeLabel}</span> : null}
          {actions}
        </span>
      </div>
    </div>
  );

  return (
    <div
      className={cn(
        "group flex w-full max-w-[80%] items-start gap-2 animate-rise sm:max-w-sm sm:gap-2.5",
        side === "right" && "ml-auto flex-row-reverse",
        className,
      )}
    >
      {/* The category icon, with a small select ring tucked under it. The ring
          is absolutely placed below the icon — the same corner of the row,
          one step down — so it adds nothing to the layout and moves nothing.
          It shows when the message is hovered (or a selection is under way);
          the `before:` inset makes its target bigger than the 16px it draws. */}
      <div className="relative shrink-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex size-8 cursor-default items-center justify-center rounded-full bg-muted text-sm sm:size-9 sm:text-base">
              {categoryIcon ?? "💸"}
            </div>
          </TooltipTrigger>
          <TooltipContent side="top">{categoryName ?? "Uncategorized"}</TooltipContent>
        </Tooltip>
        {onToggleSelect ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect(e.shiftKey);
            }}
            // One label that names the row, with the state in `aria-pressed` —
            // not a label that flips text, which reads the state twice.
            aria-pressed={selected}
            aria-label={`Select ${heading}`}
            className={cn(
              "absolute top-full left-1/2 mt-1.5 flex size-4 -translate-x-1/2 cursor-pointer items-center justify-center rounded-full border-2 outline-none transition-[opacity,background-color,border-color] duration-150",
              "before:absolute before:-inset-2 before:rounded-full before:content-['']",
              "focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50",
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-muted-foreground/60 bg-background hover:border-foreground",
              selected || selecting
                ? "opacity-100"
                : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100",
            )}
          >
            {selected ? <Check className="size-2.5" strokeWidth={4} aria-hidden /> : null}
          </button>
        ) : null}
      </div>
      {renderCard ? renderCard(card) : card}
    </div>
  );
}

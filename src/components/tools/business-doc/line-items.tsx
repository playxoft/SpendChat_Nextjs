"use client";

import { useId, useRef, type KeyboardEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EMPTY } from "@/lib/tools/format";
import { LIMITS, MAX_ITEMS, emptyItem, type ItemResult, type LineItem } from "@/lib/tools/invoice";
import { cn } from "@/lib/utils";

const input =
  "h-11 w-full min-w-0 rounded-xl border border-input bg-background px-3 text-base outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30";

/**
 * The line-item editor. Each row is a small card — description on top,
 * quantity × price = amount underneath — because four inputs side by side
 * don't fit a phone. Enter in a row's price jumps to the next row, and on the
 * last row adds one, so a list can be typed without reaching for the mouse.
 */
export function LineItems({
  items,
  results,
  onChange,
  money,
  symbol,
}: {
  items: LineItem[];
  results: ItemResult[];
  onChange: (items: LineItem[]) => void;
  money: (minor: number) => string;
  symbol: string;
}) {
  const descriptions = useRef(new Map<string, HTMLInputElement>());

  // Focus after React has committed the new list (the row may not exist yet).
  const focusRow = (id: string | undefined) => {
    if (!id) return;
    requestAnimationFrame(() => descriptions.current.get(id)?.focus());
  };

  const update = (id: string, patch: Partial<LineItem>) =>
    onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  const add = () => {
    if (items.length >= MAX_ITEMS) return;
    const item = emptyItem();
    onChange([...items, item]);
    focusRow(item.id);
  };

  const remove = (index: number) => {
    if (items.length <= 1) return;
    const neighbour = items[index + 1] ?? items[index - 1];
    onChange(items.filter((_, i) => i !== index));
    focusRow(neighbour?.id);
  };

  const onPriceKeyDown = (e: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    const next = items[index + 1];
    if (next) focusRow(next.id);
    else add();
  };

  return (
    <div className="space-y-3">
      <ol className="space-y-3">
        {items.map((item, i) => (
          <ItemRow
            key={item.id}
            n={i + 1}
            item={item}
            result={results[i]}
            only={items.length === 1}
            money={money}
            symbol={symbol}
            descriptionRef={(el) => {
              if (el) descriptions.current.set(item.id, el);
              else descriptions.current.delete(item.id);
            }}
            onChange={(patch) => update(item.id, patch)}
            onRemove={() => remove(i)}
            onPriceKeyDown={(e) => onPriceKeyDown(e, i)}
          />
        ))}
      </ol>
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full rounded-xl"
        onClick={add}
        disabled={items.length >= MAX_ITEMS}
      >
        <Plus /> Add item
      </Button>
      {items.length >= MAX_ITEMS && (
        <p className="text-xs text-muted-foreground">That&apos;s the limit of {MAX_ITEMS} items on one document.</p>
      )}
    </div>
  );
}

function ItemRow({
  n,
  item,
  result,
  only,
  money,
  symbol,
  descriptionRef,
  onChange,
  onRemove,
  onPriceKeyDown,
}: {
  n: number;
  item: LineItem;
  result: ItemResult | undefined;
  only: boolean;
  money: (minor: number) => string;
  symbol: string;
  descriptionRef: (el: HTMLInputElement | null) => void;
  onChange: (patch: Partial<LineItem>) => void;
  onRemove: () => void;
  onPriceKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const id = useId();
  const qtyError = result?.qtyError ?? null;
  const priceError = result?.priceError ?? null;
  const amount = result?.amountMinor ?? null;

  return (
    <li className="rounded-xl border p-3">
      <div className="flex items-start gap-2">
        <input
          ref={descriptionRef}
          type="text"
          value={item.description}
          maxLength={LIMITS.description}
          placeholder="Description"
          aria-label={`Item ${n} description`}
          autoComplete="off"
          onChange={(e) => onChange({ description: e.target.value })}
          className={input}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11 shrink-0 rounded-xl text-muted-foreground"
          aria-label={`Remove item ${n}`}
          disabled={only}
          onClick={onRemove}
        >
          <Trash2 />
        </Button>
      </div>
      <div className="mt-2 grid grid-cols-[minmax(0,4.5rem)_minmax(0,1fr)_minmax(0,auto)] items-end gap-2">
        <div className="min-w-0">
          <span aria-hidden className="mb-1 block text-xs text-muted-foreground">
            Qty
          </span>
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            value={item.qty}
            maxLength={LIMITS.amount}
            aria-label={`Item ${n} quantity`}
            aria-invalid={qtyError ? true : undefined}
            aria-describedby={qtyError || priceError ? `${id}-err` : undefined}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => onChange({ qty: e.target.value })}
            className={cn(input, "tabular-nums")}
          />
        </div>
        <div className="min-w-0">
          <span aria-hidden className="mb-1 block text-xs text-muted-foreground">
            Unit price
          </span>
          <div
            className={cn(
              "flex h-11 items-center rounded-xl border border-input bg-background transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/40 dark:bg-input/30",
              priceError && "border-destructive ring-destructive/20",
            )}
          >
            <span aria-hidden className="pl-3 text-sm text-muted-foreground select-none">
              {symbol}
            </span>
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              enterKeyHint="next"
              spellCheck={false}
              value={item.price}
              maxLength={LIMITS.amount}
              placeholder="0"
              aria-label={`Item ${n} unit price`}
              aria-invalid={priceError ? true : undefined}
              aria-describedby={qtyError || priceError ? `${id}-err` : undefined}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => onChange({ price: e.target.value })}
              onKeyDown={onPriceKeyDown}
              className="h-full w-full min-w-0 bg-transparent px-3 text-base tabular-nums outline-none placeholder:text-muted-foreground/70"
            />
          </div>
        </div>
        <div className="min-w-0 text-right">
          <span className="mb-1 block text-xs text-muted-foreground">Amount</span>
          <p className="flex h-11 items-center justify-end font-medium tabular-nums whitespace-nowrap">
            {amount === null ? EMPTY : money(amount)}
          </p>
        </div>
      </div>
      {(qtyError || priceError) && (
        <p id={`${id}-err`} className="mt-2 text-xs text-destructive">
          {qtyError ? `Quantity: ${qtyError}` : `Unit price: ${priceError}`}
        </p>
      )}
    </li>
  );
}

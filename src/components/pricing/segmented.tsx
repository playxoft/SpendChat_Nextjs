"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SegmentOption<T extends string> = {
  value: T;
  label: ReactNode;
  /** Small pill after the label — e.g. "2 months free". */
  badge?: ReactNode;
  /** Muted, but still selectable: the cards explain what happens. */
  dim?: boolean;
};

/**
 * A radio group drawn as a segmented control, with a thumb that slides to the
 * selected option. Equal-width segments are what let the thumb be one
 * translated element instead of a measured one.
 */
export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
  size = "default",
  className,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: SegmentOption<T>[];
  /** `bar` is 44px tall overall — the height of the pricing controls row. */
  size?: "default" | "lg" | "bar";
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  function onKeyDown(e: KeyboardEvent) {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        "relative grid rounded-full border bg-muted/60 p-1 shadow-inner",
        className,
      )}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 rounded-full bg-background shadow-sm ring-1 ring-foreground/10 transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)]"
        style={{
          width: `calc((100% - 0.5rem) / ${options.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {options.map((o, i) => {
        const active = i === index;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative z-10 inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60",
              size === "lg" && "h-11 px-5 text-sm sm:px-7",
              size === "default" && "h-9 px-3 text-sm sm:px-4",
              // 34px + 8px padding + 2px border = 44px, matching a h-11 select.
              size === "bar" && "h-8.5 px-3 text-sm sm:px-4",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              o.dim && !active && "opacity-60",
            )}
          >
            {o.label}
            {o.badge ? (
              <span
                className="hidden rounded-full bg-emerald-500/12 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700 sm:inline dark:text-emerald-400"
              >
                {o.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

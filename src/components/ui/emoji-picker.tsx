"use client";

import * as React from "react";
import { EmojiPicker as Frimousse } from "frimousse";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** The emoji grid the user picks from. */
export function EmojiPickerPanel({
  onSelect,
  className,
}: {
  onSelect: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex w-66 flex-col", className)}>
      <Frimousse.Root
        className="isolate flex h-80 w-full flex-col"
        // Self-hosted Emojibase data (public/emojibase). Pins the v16 format
        // frimousse expects — the CDN default now serves v17, which fails to
        // parse and hangs on "Loading…" — and avoids a third-party request.
        emojibaseUrl="/emojibase"
        onEmojiSelect={({ emoji }) => onSelect(emoji)}
      >
        <Frimousse.Search
          className="z-10 mx-1.5 mt-1.5 appearance-none rounded-md border bg-muted/60 px-2.5 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          placeholder="Search emoji…"
        />
        <Frimousse.Viewport className="relative mt-1.5 min-h-0 flex-1 outline-none">
          <Frimousse.Loading className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            Loading…
          </Frimousse.Loading>
          <Frimousse.Empty className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            No emoji found.
          </Frimousse.Empty>
          <Frimousse.List
            className="select-none pb-1.5"
            components={{
              CategoryHeader: ({ category, ...props }) => (
                <div
                  className="bg-popover px-2 pt-2 pb-1 text-sm font-medium text-muted-foreground"
                  {...props}
                >
                  {category.label}
                </div>
              ),
              Row: ({ children, ...props }) => (
                <div className="scroll-my-1 px-1.5" {...props}>
                  {children}
                </div>
              ),
              Emoji: ({ emoji, ...props }) => (
                <button
                  className="flex size-8 items-center justify-center rounded-md text-lg data-[active]:bg-muted"
                  {...props}
                >
                  {emoji.emoji}
                </button>
              ),
            }}
          />
        </Frimousse.Viewport>
      </Frimousse.Root>
    </div>
  );
}

/** A trigger that opens the emoji picker in a popover. */
export function EmojiPicker({
  onSelect,
  trigger,
  align = "start",
}: {
  onSelect: (value: string) => void;
  trigger: React.ReactNode;
  align?: "start" | "center" | "end";
}) {
  const [open, setOpen] = React.useState(false);
  return (
    // `modal` is load-bearing: this picker is often opened from inside a Dialog
    // (category/profile editors), whose react-remove-scroll scroll-lock would
    // otherwise swallow wheel/touch events over the portaled popover, making the
    // emoji list impossible to scroll. Modal registers the popover's own content
    // as the active scroll surface so the frimousse viewport scrolls normally.
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align={align} closeOnOutsideClick className="w-auto p-0">
        <EmojiPickerPanel
          onSelect={(v) => {
            onSelect(v);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

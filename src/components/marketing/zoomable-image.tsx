"use client";

import { useCallback, useEffect, useRef, useState, type ComponentPropsWithoutRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Marks the history entry an open image pushed, so Back can close it. */
const ENTRY = "__spendchatImage";

/**
 * A blog image that opens full screen when tapped or clicked — on the page,
 * not in a new tab.
 *
 * Opening pushes a history entry (same URL), so a phone's back button closes
 * the image instead of leaving the post. Every other way of closing it — the X,
 * Escape, a tap anywhere — goes back through that entry too, so it's always
 * spent and the next Back leaves the page as usual. The pushed state keeps
 * Next's own (spread from the current entry), which is what lets its router
 * treat the trip back as staying put rather than as a navigation.
 */
export function ZoomableImage({
  alt = "",
  className,
  wrapperClassName,
  ...props
}: ComponentPropsWithoutRef<"img"> & { wrapperClassName?: string }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  function show() {
    window.history.pushState({ ...window.history.state, [ENTRY]: true }, "");
    setOpen(true);
  }

  const close = useCallback(() => {
    if (window.history.state?.[ENTRY]) window.history.back();
    else setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const onPop = () => setOpen(false);
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close();
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      trigger?.focus({ preventScroll: true });
    };
  }, [open, close]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={show}
        aria-label={alt ? `View full screen: ${alt}` : "View image full screen"}
        className={cn("block w-full cursor-zoom-in", wrapperClassName)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={alt} className={className} {...props} />
      </button>
      {open
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={alt || "Image"}
              onClick={close}
              className="fixed inset-0 z-[100] flex cursor-zoom-out items-center justify-center bg-black/90 p-3 sm:p-8"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={props.src}
                srcSet={props.srcSet}
                alt={alt}
                className="max-h-full max-w-full rounded-lg object-contain"
              />
              <button
                ref={closeRef}
                type="button"
                aria-label="Close"
                onClick={(event) => {
                  event.stopPropagation();
                  close();
                }}
                className="absolute top-3 right-3 rounded-full bg-black/60 p-2.5 text-white transition-colors hover:bg-black/80"
              >
                <X className="size-5" />
              </button>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

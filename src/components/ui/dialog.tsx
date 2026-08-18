"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

/**
 * Floating surfaces that a dialog can open on top of itself. Each renders in
 * its own portal, so a click that dismisses one reads to the dialog as a click
 * outside — see `wasLayerOpenOnPointerDown` below. Tooltips are deliberately
 * absent: one can be open under the pointer when you click away, and it isn't a
 * layer the click is dismissing.
 */
const OPEN_LAYER_SELECTOR = [
  "popover-content",
  "select-content",
  "dropdown-menu-content",
  "context-menu-content",
]
  // `[data-state='open']` matters: a layer that is already closing stays
  // mounted for its exit animation, and without this a genuine outside click
  // landing in that window would be handed to a dropdown the user has already
  // dismissed — so the dialog would need two clicks to close.
  .map((slot) => `[data-slot='${slot}'][data-state='open']`)
  .join(",")

/**
 * Was a dropdown on screen at the moment the pointer went down?
 *
 * It has to be sampled then, not when the dismiss fires: Radix gives
 * `DialogContent` `deferPointerDownOutside`, so its outside handler runs on the
 * *click*, by which point the dropdown has already closed. A popover survives
 * that gap only because it animates out; `Select` has no exit animation and is
 * gone, which is why checking at dismiss time missed exactly the selects this
 * is meant to protect.
 *
 * Capture phase, so it lands before Radix's own document listener.
 *
 * Only the dialogs that can dismiss on an outside click read this, so the
 * listener is only installed for them — every other dialog would sample the
 * document on each pointerdown and then throw the answer away.
 */
function useLayerOpenOnPointerDown(enabled: boolean) {
  const ref = React.useRef(false)
  React.useEffect(() => {
    if (!enabled) return
    const onPointerDown = () => {
      ref.current = !!document.querySelector(OPEN_LAYER_SELECTOR)
    }
    document.addEventListener("pointerdown", onPointerDown, true)
    return () => document.removeEventListener("pointerdown", onPointerDown, true)
  }, [enabled])
  return ref
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  closeOnOutsideClick = false,
  onPointerDownOutside,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
  /** Opt back into dismiss-on-outside-click (off by default app-wide). */
  closeOnOutsideClick?: boolean
}) {
  const wasLayerOpenOnPointerDown = useLayerOpenOnPointerDown(closeOnOutsideClick)
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        // By default an outside click doesn't dismiss — only the close button or
        // an explicit action closes a dialog, so accidental clicks never lose
        // work. Set closeOnOutsideClick to restore click-away. Escape always works.
        //
        // A dropdown opened *from inside* the dialog (a category or profile
        // select, a date picker, an emoji picker) renders in its own portal, so
        // Radix reports the click that dismisses it as a click outside the
        // dialog too — and the dialog goes with it, taking the half-filled form
        // along. One click dismisses one layer: if a dropdown was up when the
        // pointer went down, that click belongs to it, not to us.
        onPointerDownOutside={(event) => {
          if (!closeOnOutsideClick || wasLayerOpenOnPointerDown.current)
            event.preventDefault()
          onPointerDownOutside?.(event)
        }}
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button
              variant="ghost"
              className="absolute top-2 right-2"
              size="icon-sm"
            >
              <XIcon
              />
              <span className="sr-only">Close</span>
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}

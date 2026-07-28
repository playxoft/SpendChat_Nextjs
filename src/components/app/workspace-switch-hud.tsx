"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMac } from "@/hooks/use-shortcut";
import { useLoadingOverlay } from "./loading-overlay";
import { switchWorkspace } from "@/actions/workspaces";
import type { WorkspaceOption } from "./workspace-switcher";

/**
 * A "peek" workspace switcher, in the spirit of the ⌘-Tab app switcher: hold the
 * modifiers and a centered HUD lists every workspace; navigate the highlight
 * while holding, then release to jump to it (releasing on the current one is a
 * no-op). The trigger is ⌘+⇧ on macOS and Alt+⇧ elsewhere — Ctrl+⇧ is avoided
 * off-Mac because it collides with word-wise text selection.
 *
 * Interaction while held:
 * - ↑/↓ (or ←/→ / Tab) move the highlight.
 * - 1–9 (0 for the 10th) jump the highlight to that workspace.
 * - Enter / Space switch to the highlight immediately.
 * - Release the modifiers → switch to the highlight and hide.
 * - Esc → hide without switching.
 *
 * It's mounted app-wide from the layout, so the peek works from any page.
 */

/**
 * Delay before the HUD appears. Chorded shortcuts that momentarily hold the same
 * modifiers (⌘⇧3 to screenshot, ⌘⇧T to reopen a tab, …) fire their final key
 * well within this window, so we cancel the peek instead of flashing it.
 */
const SHOW_DELAY_MS = 200;

/** Grant-only access (no workspace-wide role) reads as "shared". */
function roleLabel(role: WorkspaceOption["role"]): string {
  return role ?? "shared";
}

/** 0-based index → the 1-key that jumps to it (1…9, then 0 for the 10th). */
function hotkeyDigit(i: number): string | null {
  if (i < 9) return String(i + 1);
  if (i === 9) return "0";
  return null;
}

/** Focus is in a text field where ⌘⇧+arrow means "select", not "switch". */
function isTypingContext(): boolean {
  const el = typeof document !== "undefined" ? document.activeElement : null;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    (el as HTMLElement).isContentEditable === true
  );
}

/** A modal layer (dialog / menu / listbox) is already open. */
function hasOpenOverlay(): boolean {
  if (typeof document === "undefined") return false;
  return !!document.querySelector(
    '[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"]',
  );
}

export function WorkspaceSwitchHud({
  workspaces,
  currentWorkspaceId,
}: {
  workspaces: WorkspaceOption[];
  currentWorkspaceId: string;
}) {
  const isMac = useIsMac();
  const router = useRouter();
  const { run } = useLoadingOverlay();

  const currentIndex = Math.max(
    0,
    workspaces.findIndex((w) => w.id === currentWorkspaceId),
  );

  const [open, setOpen] = React.useState(false);
  const [index, setIndex] = React.useState(currentIndex);

  // The key handlers run off a window listener that we register once, so they
  // read live props/state through refs rather than re-subscribing every render.
  const openRef = React.useRef(false);
  const indexRef = React.useRef(currentIndex);
  const timerRef = React.useRef<number | null>(null);
  const workspacesRef = React.useRef(workspaces);
  const currentIndexRef = React.useRef(currentIndex);
  const currentIdRef = React.useRef(currentWorkspaceId);

  React.useEffect(() => {
    workspacesRef.current = workspaces;
    currentIndexRef.current = currentIndex;
    currentIdRef.current = currentWorkspaceId;
  });

  React.useEffect(() => {
    // Nothing to switch between.
    if (workspaces.length < 2) return;

    const clearTimer = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const setHighlight = (i: number) => {
      indexRef.current = i;
      setIndex(i);
    };

    const hide = () => {
      clearTimer();
      openRef.current = false;
      setOpen(false);
    };

    const commit = (i: number) => {
      const target = workspacesRef.current[i];
      hide();
      if (!target || target.id === currentIdRef.current) return;
      // Owned by the overlay provider so the full-screen loader survives this
      // component re-rendering as the workspace swaps under it.
      run(
        async () => {
          const res = await switchWorkspace(target.id);
          if (res.ok) {
            router.push("/app");
            router.refresh();
          } else {
            toast.error(res.error);
          }
        },
        "Switching workspace…",
        { variant: "spinner" },
      );
    };

    // True while the trigger modifiers are both held.
    const held = (e: KeyboardEvent) =>
      isMac ? e.metaKey && e.shiftKey : e.altKey && e.shiftKey;
    // The keydown that completes/holds the combo is itself one of these.
    const triggerKeys = isMac ? ["Meta", "Shift"] : ["Alt", "Shift"];

    const onKeyDown = (e: KeyboardEvent) => {
      if (!held(e)) return;

      if (triggerKeys.includes(e.key)) {
        // Combo just became fully held — arm the peek, unless we're mid-peek or
        // somewhere the gesture shouldn't hijack (a text field, an open dialog).
        if (
          !openRef.current &&
          timerRef.current === null &&
          !isTypingContext() &&
          !hasOpenOverlay()
        ) {
          timerRef.current = window.setTimeout(() => {
            timerRef.current = null;
            openRef.current = true;
            // Each peek starts fresh on the current workspace.
            setHighlight(currentIndexRef.current);
            setOpen(true);
          }, SHOW_DELAY_MS);
        }
        return;
      }

      if (!openRef.current) {
        // A non-modifier key arrived before the HUD showed → this is a real
        // chord (⌘⇧T, …); drop the pending peek and let the shortcut through.
        clearTimer();
        return;
      }

      // Shift is part of the combo, so number-row keys report their shifted
      // symbol ("!" not "1") — match the physical code instead.
      const digit = /^(?:Digit|Numpad)([0-9])$/.exec(e.code);
      if (digit) {
        const n = Number(digit[1]);
        const target = n === 0 ? 9 : n - 1;
        if (target < workspacesRef.current.length) {
          e.preventDefault();
          setHighlight(target);
        }
        return;
      }

      const len = workspacesRef.current.length;
      switch (e.key) {
        case "ArrowDown":
        case "ArrowRight":
        case "Tab":
          e.preventDefault();
          setHighlight((indexRef.current + 1) % len);
          return;
        case "ArrowUp":
        case "ArrowLeft":
          e.preventDefault();
          setHighlight((indexRef.current - 1 + len) % len);
          return;
        case "Enter":
        case " ":
          e.preventDefault();
          commit(indexRef.current);
          return;
        case "Escape":
          e.preventDefault();
          hide();
          return;
        default:
          // Any other key is a real shortcut — step out of its way.
          hide();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (held(e)) return; // still holding both — keep peeking
      if (openRef.current) commit(indexRef.current);
      else clearTimer(); // armed but released before it showed
    };

    // A missed keyup (⌘-Tab away mid-hold) would otherwise strand the HUD.
    const onBlur = () => hide();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      clearTimer();
    };
  }, [isMac, run, router, workspaces.length]);

  if (!open) return null;

  const modifierHint = isMac ? "⌘⇧" : "Alt+Shift";
  const highestDigit = Math.min(workspaces.length, 9);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Switch workspace"
      className="fixed inset-0 z-[90] flex items-center justify-center bg-background/60 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-xs overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg">
        <div className="border-b px-4 py-2.5">
          <p className="text-sm font-medium">Switch workspace</p>
          <p className="text-xs text-muted-foreground">
            Hold {modifierHint} · ↑↓ or 1–{highestDigit} · release to switch
          </p>
        </div>
        <ul className="max-h-[60vh] space-y-0.5 overflow-y-auto p-1.5">
          {workspaces.map((w, i) => {
            const active = i === index;
            const isCurrent = w.id === currentWorkspaceId;
            const digit = hotkeyDigit(i);
            return (
              <li key={w.id}>
                <div
                  aria-selected={active}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm",
                    active && "bg-accent text-accent-foreground",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded text-[11px] tabular-nums",
                      active
                        ? "bg-background/70 text-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {digit ?? ""}
                  </span>
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-accent">
                    {w.icon ? (
                      <span className="text-sm leading-none">{w.icon}</span>
                    ) : (
                      <Building2 className="size-3.5" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{w.name}</span>
                  {isCurrent ? (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      current
                    </span>
                  ) : (
                    <span className="shrink-0 text-[10px] text-muted-foreground capitalize">
                      {roleLabel(w.role)}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

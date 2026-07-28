"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { useShortcut } from "@/hooks/use-shortcut";
import { comboFor } from "@/lib/shortcuts";
import { useLoadingOverlay } from "./loading-overlay";
import { switchWorkspace } from "@/actions/workspaces";
import type { WorkspaceOption } from "./workspace-switcher";

/**
 * The quick workspace picker: press `g` anywhere to open it, then a digit to
 * jump straight to that workspace (1–9, 0 for the 10th). ↑↓ move the highlight,
 * Enter takes it, Escape closes.
 *
 * Deliberately a plain single key rather than a held modifier chord. A chord has
 * to be *observed* to be cancelled, and the interesting ones never reach the
 * page: macOS swallows ⌘⇧3/4/5 and ⌘⇧Q outright, Windows swallows Alt+Shift for
 * the input-language switcher. `g` has no such failure mode, needs no arm timer
 * and no commit-on-release, and reads the same on every platform. `useShortcut`
 * already suppresses single keys while typing and while another overlay is open,
 * so it can't fire mid-sentence.
 *
 * Mounted app-wide from the layout; the sidebar's workspace menu shows the same
 * `g` hint so the shortcut is discoverable rather than folklore.
 */

/** Grant-only access (no workspace-wide role) reads as "shared". */
function roleLabel(role: WorkspaceOption["role"]): string {
  return role ?? "shared";
}

/** 0-based index → the key that jumps to it (1…9, then 0 for the 10th). */
function hotkeyDigit(i: number): string | null {
  if (i < 9) return String(i + 1);
  if (i === 9) return "0";
  return null;
}

export function WorkspaceSwitchDialog({
  workspaces,
  currentWorkspaceId,
}: {
  workspaces: WorkspaceOption[];
  currentWorkspaceId: string;
}) {
  const router = useRouter();
  const { run } = useLoadingOverlay();

  const currentIndex = Math.max(
    0,
    workspaces.findIndex((w) => w.id === currentWorkspaceId),
  );

  const [open, setOpen] = React.useState(false);
  const [index, setIndex] = React.useState(currentIndex);

  // Nothing to switch between — don't bind the key or render anything.
  const enabled = workspaces.length > 1;

  useShortcut(
    comboFor("workspace.switch"),
    () => {
      // Each open starts on the current workspace, like the dropdown does.
      setIndex(currentIndex);
      setOpen(true);
    },
    { enabled, requireNoOverlay: true },
  );

  function commit(i: number) {
    const target = workspaces[i];
    setOpen(false);
    if (!target || target.id === currentWorkspaceId) return;
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
  }

  function onKeyDown(e: React.KeyboardEvent) {
    // Match the physical key so a non-US layout still maps the number row.
    const digit = /^(?:Digit|Numpad)([0-9])$/.exec(e.code);
    if (digit) {
      const n = Number(digit[1]);
      const target = n === 0 ? 9 : n - 1;
      if (target < workspaces.length) {
        e.preventDefault();
        commit(target);
      }
      return;
    }
    const len = workspaces.length;
    switch (e.key) {
      case "ArrowDown":
      case "ArrowRight":
        e.preventDefault();
        setIndex((i) => (i + 1) % len);
        return;
      case "ArrowUp":
      case "ArrowLeft":
        e.preventDefault();
        setIndex((i) => (i - 1 + len) % len);
        return;
      case "Enter":
        e.preventDefault();
        commit(index);
        return;
    }
  }

  if (!enabled) return null;

  const highestDigit = Math.min(workspaces.length, 9);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        closeOnOutsideClick
        onKeyDown={onKeyDown}
        // Sits a touch above dead centre: optical centring reads as "centred",
        // where true centring reads as slightly low.
        className="top-[calc(50%-2.5rem)] gap-0 p-0 sm:max-w-xs"
      >
        <DialogHeader className="border-b px-4 py-2.5 text-left">
          <DialogTitle className="text-sm font-medium">Switch workspace</DialogTitle>
          <DialogDescription className="text-xs">
            Press 1–{highestDigit} to jump · ↑↓ then Enter · Esc to close
          </DialogDescription>
        </DialogHeader>

        <ul
          role="listbox"
          aria-label="Workspaces"
          aria-activedescendant={`workspace-pick-${index}`}
          className="max-h-[60vh] space-y-0.5 overflow-y-auto p-1.5"
        >
          {workspaces.map((w, i) => {
            const active = i === index;
            const isCurrent = w.id === currentWorkspaceId;
            const digit = hotkeyDigit(i);
            return (
              <li key={w.id}>
                <div
                  id={`workspace-pick-${i}`}
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => commit(i)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm",
                    // Exclusive, not layered: two `bg-*` utilities have equal
                    // specificity, so which one won would come down to their
                    // order in the generated CSS rather than the order here.
                    // The highlight outranks the you-are-here tint when both
                    // apply (which is the case the moment the dialog opens).
                    active
                      ? "bg-accent text-accent-foreground"
                      : isCurrent && "bg-muted",
                  )}
                >
                  {digit ? (
                    <Kbd combo={digit} className="shrink-0" />
                  ) : (
                    <span aria-hidden className="size-[22px] shrink-0" />
                  )}
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-accent">
                    {w.icon ? (
                      <span className="text-sm leading-none">{w.icon}</span>
                    ) : (
                      <Building2 className="size-3.5" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{w.name}</span>
                  <span
                    className={cn(
                      "shrink-0 text-sm text-muted-foreground",
                      !isCurrent && "capitalize",
                    )}
                  >
                    {isCurrent ? "current" : roleLabel(w.role)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

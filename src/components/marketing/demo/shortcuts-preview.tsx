"use client";

import { useState } from "react";
import { MousePointerClick, Sparkles } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { navItems } from "@/components/app/nav-items";
import { useIsMac } from "@/hooks/use-shortcut";
import { SHORTCUTS, comboFor, type ShortcutDef } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

/**
 * The keyboard shortcuts, at homepage size: press a key, watch the app move.
 *
 * A compact sibling of `demo/shortcuts-demo.tsx`, which is 36rem tall, carries
 * the `/app` sidebar, a live composer and the full generated cheat sheet. That
 * belongs on a page about shortcuts; here the claim being made is narrower —
 * "single keys really do this" — so the panel keeps the part that proves it
 * (the section actually changes when you press `t`) and links out for the rest.
 *
 * Every combo comes from `src/lib/shortcuts.ts`, the registry the app binds
 * against, and the navigation rows come from `navItems`. Not one key is written
 * as a literal below, so this can't advertise a binding the product doesn't
 * have.
 *
 * **The listener is on this panel, not `window`.** A landing page that
 * swallowed every keystroke would break find-in-page, browser shortcuts and the
 * scroll keys. The panel takes focus first and only then listens — which is
 * also a fair model of the app, where these same keys go quiet while a field or
 * a dialog has focus.
 */

/** Keys that must always reach the browser: the ways out of a focus trap. */
const PASSTHROUGH = new Set(["Tab", "Escape", "Shift", "Control", "Alt", "Meta"]);

/** The second group: what you'd press without leaving the tracker. */
const ACTION_IDS = [
  "action.add",
  "action.bulk",
  "tracker.toggle-mode",
  "tracker.toggle-type",
  "tracker.submit",
  "profiles.switch",
  "global.shortcuts",
];

const ACTIONS = ACTION_IDS.map((id) => SHORTCUTS.find((s) => s.id === id)).filter(
  (s): s is ShortcutDef => Boolean(s),
);

/**
 * Event → the registry's key vocabulary. Digits and the backtick are read off
 * `code` rather than `key`, for the reason the app does it: Shift + 1 emits "!"
 * on a US layout and something else elsewhere, so matching the printed
 * character would make the profile shortcuts layout-dependent.
 */
function normalizeKey(e: React.KeyboardEvent): string {
  const digit = /^(?:Digit|Numpad)([0-9])$/.exec(e.code ?? "");
  if (digit) return digit[1];
  if (e.code === "Backquote") return "`";
  if (e.key === "Enter") return "enter";
  if (e.key === "Escape") return "esc";
  if (e.key === " ") return "space";
  return e.key.toLowerCase();
}

/** The combo actually pressed, in the registry's DSL, for the echo chip. */
function pressedCombo(e: React.KeyboardEvent, key: string, isMac: boolean): string {
  const parts: string[] = [];
  if (isMac ? e.metaKey : e.ctrlKey) parts.push("mod");
  if (isMac ? e.ctrlKey : e.metaKey) parts.push("ctrl");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");
  parts.push(key);
  return parts.join("+");
}

/** First registry entry this keystroke satisfies, or nothing. */
function resolveShortcut(
  e: React.KeyboardEvent,
  key: string,
  isMac: boolean,
): ShortcutDef | undefined {
  const mod = isMac ? e.metaKey : e.ctrlKey;
  // Ctrl on a Mac (or Meta on Windows) is a different chord entirely.
  if ((isMac ? e.ctrlKey : e.metaKey) || e.altKey) return undefined;

  return SHORTCUTS.find((s) => {
    const parts = s.combo.split("+");
    if (parts.includes("mod") !== mod) return false;
    if (parts.includes("shift") !== e.shiftKey) return false;
    // Shift + any digit lands on the profile switcher; the registry stores the
    // first one as the representative combo.
    if (s.id === "profiles.switch") return e.shiftKey && /^[0-9]$/.test(key);
    return parts[parts.length - 1] === key;
  });
}

export function ShortcutsPreview() {
  const isMac = useIsMac();

  const [activeHref, setActiveHref] = useState<string>(navItems[0].href);
  const [aiMode, setAiMode] = useState(false);
  const [income, setIncome] = useState(false);
  const [pressed, setPressed] = useState("");
  const [fired, setFired] = useState<ShortcutDef | null>(null);
  const [effect, setEffect] = useState("");
  const [focused, setFocused] = useState(false);

  const section = navItems.find((n) => n.href === activeHref) ?? navItems[0];

  /** Run the shortcut and say what it did. */
  function apply(s: ShortcutDef): string {
    const nav = navItems.find((n) => n.shortcut === s.combo);
    if (nav) {
      setActiveHref(nav.href);
      return `Jumped to ${nav.label} — the profile you were on comes with you.`;
    }

    switch (s.id) {
      case "tracker.toggle-mode": {
        const next = !aiMode;
        setAiMode(next);
        return next
          ? "Composer switched to AI entry — one key, no menu."
          : "Back to manual entry.";
      }
      case "tracker.toggle-type": {
        const next = !income;
        setIncome(next);
        return `Now logging ${next ? "income" : "expense"} — this one works mid-amount.`;
      }
      case "tracker.submit":
        return "Sends from any field. The composer clears and keeps focus, so the next entry starts immediately.";
      case "action.add":
        return "Opens the add-transaction dialog from any page, pre-filled with the profile you're on.";
      case "action.bulk":
        return "Opens bulk add, for pasting a stack of rows at once.";
      case "profiles.switch":
        return "Shift and a digit switches profile — separate feed, separate balance.";
      case "global.shortcuts":
        return "Opens the full cheat sheet, over whatever you were doing.";
      default:
        return s.label;
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (PASSTHROUGH.has(e.key) || e.repeat) return;

    const key = normalizeKey(e);
    setPressed(pressedCombo(e, key, isMac));

    const match = resolveShortcut(e, key, isMac);
    if (!match) {
      setFired(null);
      setEffect("Nothing is bound to that, so nothing happens.");
      return;
    }

    e.preventDefault();
    setFired(match);
    setEffect(apply(match));
  }

  return (
    // `tabIndex` is what makes this a keyboard target at all.
    <div
      role="group"
      aria-label="Keyboard shortcut playground"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      className="flex h-[24rem] min-w-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm outline-none ring-offset-2 ring-offset-background focus-within:ring-3 focus-within:ring-ring/50"
    >
      <div className="shrink-0 border-b px-4 py-3">
        <div className="flex items-center gap-x-3 gap-y-1">
          <span className="inline-flex min-w-0 items-center gap-2 text-sm font-medium">
            <section.icon className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{section.label}</span>
          </span>
          {aiMode && (
            <span className="inline-flex shrink-0 items-center gap-1 text-xs text-violet-600 dark:text-violet-400">
              <Sparkles className="size-3.5" /> AI entry
            </span>
          )}
          <span className="ml-auto shrink-0">
            {pressed ? (
              <Kbd combo={pressed} />
            ) : (
              <span className="text-xs text-muted-foreground">no key yet</span>
            )}
          </span>
        </div>
        {/* Two lines reserved, so the longest sentence below can't grow the
            header and push the list — the panel height is fixed either way. */}
        <p
          className={cn(
            "mt-1.5 min-h-[2.5rem] text-sm",
            fired ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {focused ? (
            effect || (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                Press a key — try <Kbd combo={comboFor("nav.transactions")} />,{" "}
                <Kbd combo={comboFor("action.add")} /> or{" "}
                <Kbd combo={comboFor("tracker.toggle-mode")} />.
              </span>
            )
          ) : (
            <span className="inline-flex items-start gap-1.5">
              <MousePointerClick className="mt-0.5 size-3.5 shrink-0" />
              Click this panel, then press a key. Nothing outside it is touched.
            </span>
          )}
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        <div>
          <p className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Navigation
          </p>
          <ul className="divide-y rounded-lg border">
            {navItems.map((item) => (
              <li
                key={item.href}
                aria-current={item.href === activeHref ? "true" : undefined}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 text-sm transition-colors",
                  item.href === activeHref && "bg-accent font-medium text-accent-foreground",
                )}
              >
                <item.icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 truncate">{item.label}</span>
                <Kbd combo={item.shortcut} className="ml-auto shrink-0" />
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Entry
          </p>
          <ul className="divide-y rounded-lg border">
            {ACTIONS.map((s) => (
              <li
                key={s.id}
                className={cn(
                  "flex items-center justify-between gap-4 px-3 py-2 text-sm transition-colors",
                  fired?.id === s.id && "bg-accent text-accent-foreground",
                )}
              >
                <span className="min-w-0">{s.label}</span>
                <Kbd combo={s.combo} className="shrink-0" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

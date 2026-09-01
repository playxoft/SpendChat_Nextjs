"use client";

import { useId, useState } from "react";
import { MousePointerClick, Sparkles } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { navItems } from "@/components/app/nav-items";
import { useIsMac } from "@/hooks/use-shortcut";
import {
  SHORTCUTS,
  comboFor,
  describeShortcut,
  normalizeKey,
  spokenShortcut,
  type ShortcutDef,
} from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import {
  PASSTHROUGH,
  announceKeystroke,
  echoCombo,
  resolveShortcut,
  shouldSwallow,
} from "./shortcut-match";

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
      // Neither of the last two is in the list beside this panel, but the
      // matcher walks the whole registry, so both can still be pressed here —
      // and in both cases the honest answer is that the key isn't ours. The
      // panel lets them through rather than swallowing them.
      case "tracker.category":
        // Spelled "# (hash)" because the live region reads this sentence out:
        // a bare "#" is punctuation most readers drop, taking the subject of
        // the sentence with it.
        return "A character, not a binding — type # (hash) in the title field and the composer offers matching categories from the text itself.";
      case "global.print":
        return "That one is the browser's own print dialog — we didn't bind it, we just made the pages print properly.";
      default:
        return s.label;
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (PASSTHROUGH.has(e.key) || e.repeat) return;

    const key = normalizeKey(e);
    const match = resolveShortcut(e, key, isMac);
    setPressed(echoCombo(e, key, isMac, match));

    if (!match) {
      setFired(null);
      setEffect("Nothing is bound to that, so nothing happens.");
      return;
    }

    // Only swallow what the app itself takes: `shouldSwallow` keeps the keys
    // the registry documents without binding (the print dialog) working.
    if (shouldSwallow(match)) e.preventDefault();
    setFired(match);
    setEffect(apply(match));
  }

  const hintId = useId();
  /** The same three keys the visible hint offers, in words, for the description. */
  const tryKeys = ["nav.transactions", "action.add", "tracker.toggle-mode"].map((id) =>
    describeShortcut(comboFor(id), isMac),
  );

  return (
    // `tabIndex` is what makes this a keyboard target at all, and the role
    // changes on focus for the same reason as in the full demo: NVDA and JAWS
    // read a page in browse mode, where bare letters are quick-nav commands
    // (`t` table, `f` form, `e` edit box, `b` button — very nearly this panel's
    // key set) and a focusable `group` doesn't switch them out of it, so the
    // keystrokes would never reach `onKeyDown` at all. `application` is the
    // role that hands them over.
    //
    // Only while focused, because it isn't free: an application region
    // suppresses the virtual cursor, and the two lists below are ordinary
    // content a visitor should be able to read line by line. Unfocused it stays
    // a group; focused, it's a widget the visitor asked for. Tab leaves.
    <div
      role={focused ? "application" : "group"}
      aria-label="Keyboard shortcut playground"
      aria-describedby={hintId}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      // `ring-ring/50` measured 1.54:1 against the card — below the 3:1 a focus
      // indicator has to meet, on the control whose entire job is to say "keys
      // land here now".
      className="flex h-[24rem] min-w-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm outline-none ring-offset-2 ring-offset-background focus-within:ring-3 focus-within:ring-muted-foreground"
    >
      <p id={hintId} className="sr-only">
        An interactive demo of the app&apos;s keyboard shortcuts. While this
        panel has focus it takes single keys — press {tryKeys[0]}, {tryKeys[1]}{" "}
        or {tryKeys[2]} and it answers above the list; Tab moves on and gives
        every key back. If single letters still move your screen reader instead
        of the demo, switch it to focus mode — Insert + Space in NVDA, Insert +
        Z in JAWS.
      </p>
      {/* The visible answer — an `aria-hidden` echo chip and a paragraph
          mutated in place — is announced by nothing. This is the same answer
          as one spoken sentence. Empty on first paint, so the region is being
          watched before the first keystroke changes it. */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announceKeystroke(pressed, effect, isMac)}
      </div>

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
                Press a key — try{" "}
                <Kbd combo={comboFor("nav.transactions")} describe />,{" "}
                <Kbd combo={comboFor("action.add")} describe /> or{" "}
                <Kbd combo={comboFor("tracker.toggle-mode")} describe />.
              </span>
            )
          ) : (
            <span className="inline-flex items-start gap-1.5">
              <MousePointerClick className="mt-0.5 size-3.5 shrink-0" />
              Click this panel or Tab to it, then press a key. Nothing outside
              it is touched.
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
            {navItems.map((item) => {
              const spoken = spokenShortcut(item.shortcut, item.label, isMac);
              return (
                <li
                  key={item.href}
                  aria-current={item.href === activeHref ? "true" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 text-sm transition-colors",
                    item.href === activeHref && "bg-accent font-medium text-accent-foreground",
                  )}
                >
                  <item.icon className="size-4 shrink-0 text-muted-foreground" />
                  {/* The `sr-only` key is inside the truncating span on
                      purpose: it's absolutely positioned, so it can't widen the
                      row, and it stays part of the same sentence. This list is
                      a cheat sheet, not links with hints beside them — it's
                      what the line above points at when it says to try a key,
                      and without the spoken half it reads as five bare section
                      names, the chips being `aria-hidden` glyphs. */}
                  <span className="min-w-0 truncate">
                    {item.label}
                    {spoken && <span className="sr-only">, {spoken}</span>}
                  </span>
                  <Kbd combo={item.shortcut} className="ml-auto shrink-0" />
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Entry
          </p>
          <ul className="divide-y rounded-lg border">
            {ACTIONS.map((s) => {
              const spoken = spokenShortcut(s.combo, s.label, isMac);
              return (
                <li
                  key={s.id}
                  className={cn(
                    "flex items-center justify-between gap-4 px-3 py-2 text-sm transition-colors",
                    fired?.id === s.id && "bg-accent text-accent-foreground",
                  )}
                >
                  <span className="min-w-0">
                    {s.label}
                    {/* Spoken here as well — but `spokenShortcut` returns nothing
                        for the profile switcher, whose label already ends
                        "(Shift + 1…9, 0 for the 10th)" and would otherwise
                        announce its key a second time. */}
                    {spoken && <span className="sr-only">, {spoken}</span>}
                  </span>
                  <Kbd combo={s.combo} className="shrink-0" />
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

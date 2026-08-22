"use client";

import { useRef, useState } from "react";
import { LayoutGrid, Mic, MousePointerClick } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import {
  EntryModeToggle,
  MODE_ROW_DENSE,
  type EntryMode,
} from "@/components/app/entry-mode-toggle";
import { navItems } from "@/components/app/nav-items";
import { useIsMac } from "@/hooks/use-shortcut";
import { SHORTCUTS, comboFor, type ShortcutDef } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import { DemoFrame } from "./demo-frame";
import { DemoControlGroup, DemoDateChip, DemoTypeToggle } from "./demo-controls";
import { DEMO_PROFILES, DEMO_PROFILE_ICON, type DemoTxnType } from "./demo-data";

/**
 * The keyboard demo: press a key, watch the app respond.
 *
 * Everything it knows comes from `src/lib/shortcuts.ts` — the same registry the
 * app binds against — so a combo can't be right here and wrong in the product.
 * No combo is written out as a literal anywhere below; the matcher walks
 * `SHORTCUTS`, the sidebar chips come from `navItems` (which resolve through
 * `comboFor`), and the cheat sheet is the registry rendered straight out.
 *
 * The listener is on this component's own container, not `window`. A marketing
 * page that swallowed every keystroke would break the visitor's find-in-page,
 * their browser shortcuts, and their scroll keys — so the panel takes focus
 * first and only then starts listening, which is also a fair model of the app,
 * where the same keys are suppressed while a field or a dialog has focus.
 *
 * Nothing here waits for an effect to render: the cheat sheet is in the
 * server-rendered HTML, and only the ⌘-vs-Ctrl glyph inside `Kbd` resolves on
 * the client.
 */

/** Keys that must always reach the browser: the ways out of a focus trap. */
const PASSTHROUGH = new Set(["Tab", "Escape", "Shift", "Control", "Alt", "Meta"]);

/**
 * The three the app deliberately lets through while you're typing: ⌘/Ctrl +
 * Enter sends from any field, ⌘/Ctrl + E flips the type without leaving the
 * amount, and Shift + Enter is a handler on the title field itself. Every other
 * shortcut is a bare key, and bare keys stay quiet while a field has focus.
 */
const ALLOWED_WHILE_TYPING = new Set([
  "tracker.submit",
  "tracker.toggle-type",
  "tracker.description",
]);

/**
 * `#` is documented in the registry but isn't a bound key — it's a character
 * you type into the title field, and the composer watches the text. The cheat
 * sheet flags it rather than quietly implying you can press it here.
 */
const TYPED_ONLY_ID = "tracker.category";

/** "Shift" out of the registry's `shift+1`, so the per-profile chips can't drift. */
const PROFILE_MOD = comboFor("profiles.switch").split("+").slice(0, -1).join("+");
/** Shift + 1…9, then 0 for the tenth — the app's own numbering. */
function profileCombo(index: number): string {
  return `${PROFILE_MOD}+${(index + 1) % 10}`;
}

const ALL_PROFILES = "All profiles";

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable === true
  );
}

/**
 * Event → the registry's key vocabulary. Digits and the backtick are read off
 * `code` rather than `key` for the same reason the app does it: Shift + 1 emits
 * "!" on a US layout and something else again elsewhere, so matching the
 * printed character would make the profile shortcuts layout-dependent.
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

/** The combo the visitor actually pressed, in the registry's DSL, for the echo. */
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
  // Ctrl on a Mac (or the Meta key on Windows) is a different chord entirely.
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

export function ShortcutsDemo() {
  const isMac = useIsMac();

  const [activeHref, setActiveHref] = useState<string>(navItems[0].href);
  const [profile, setProfile] = useState<string>(DEMO_PROFILES[0]);
  const [mode, setMode] = useState<EntryMode>("manual");
  const [type, setType] = useState<DemoTxnType>("expense");
  const [title, setTitle] = useState("");
  const [holding, setHolding] = useState(false);
  const [focused, setFocused] = useState(false);

  /** The last keystroke, as a combo string — empty until the visitor presses one. */
  const [pressed, setPressed] = useState("");
  const [fired, setFired] = useState<ShortcutDef | null>(null);
  const [effect, setEffect] = useState("");

  const sheetRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const titleRef = useRef<HTMLInputElement>(null);

  const section = navItems.find((n) => n.href === activeHref) ?? navItems[0];

  /**
   * Scroll the matched row into the middle of the cheat sheet — by hand, rather
   * than `scrollIntoView`, which is free to scroll the *page* as well and would
   * yank the visitor around a marketing page they were only reading.
   */
  function revealRow(id: string) {
    const box = sheetRef.current;
    const row = rowRefs.current[id];
    if (!box || !row) return;
    const top = row.offsetTop - box.clientHeight / 2 + row.clientHeight / 2;
    box.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }

  /** Run the shortcut and say what it did. */
  function apply(s: ShortcutDef, key: string): string {
    const nav = navItems.find((n) => n.shortcut === s.combo);
    if (nav) {
      setActiveHref(nav.href);
      return `Jumped to ${nav.label}. In the app the profile you're on comes with you.`;
    }

    switch (s.id) {
      case "action.add":
        return "Opens the add-transaction dialog, from any page — pre-filled with the profile you're on.";
      case "action.bulk":
        return "Opens bulk add, for pasting a stack of rows at once.";
      case "tracker.toggle-mode": {
        const next = mode === "manual" ? "ai" : "manual";
        setMode(next);
        return next === "ai"
          ? "Composer switched to AI entry — one key, no menu."
          : "Back to manual entry.";
      }
      case "tracker.toggle-type": {
        const next = type === "expense" ? "income" : "expense";
        setType(next);
        return `Now logging ${next}. This one works while you're still typing the amount.`;
      }
      case "tracker.description":
        titleRef.current?.focus();
        return "Focus moved to the note field — the description is optional, so it stays out of the way until you ask.";
      case "tracker.submit":
        if (!title.trim()) {
          return "Sends from any field — even mid-amount. There's nothing in the field here, and the app would say so rather than save a blank row.";
        }
        setTitle("");
        return "Sent. The composer clears and keeps focus, so the next entry starts immediately.";
      case "tracker.voice":
        if (mode !== "ai") {
          return "Voice lives in AI entry — press the Manual/AI key first, then hold this one.";
        }
        setHolding(true);
        return "Recording while you hold it. Let go and the transcript lands in the note.";
      case "profiles.switch": {
        const index = (Number(key) + 9) % 10;
        const target = DEMO_PROFILES[index];
        if (!target) {
          return `There's no profile ${index + 1} here — this demo has ${DEMO_PROFILES.length}.`;
        }
        setProfile(target);
        return `Switched to ${target}. Separate feed, separate balance.`;
      }
      case "profiles.all":
        setProfile(ALL_PROFILES);
        return "Every profile at once — one balance across all your books.";
      case "workspace.switch":
        return "Opens the workspace picker; a digit then picks one. Workspaces are the shared layer above profiles.";
      case "global.shortcuts":
        return "Opens this cheat sheet in the app, over whatever you were doing.";
      case "global.print":
        return "That one is the browser's own print dialog. We didn't bind it — we just made the pages print properly.";
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
    if (isTypingTarget(e.target) && !ALLOWED_WHILE_TYPING.has(match.id)) {
      setFired(null);
      setEffect(
        "Ignored, because you're typing in a field. Bare keys never steal a keystroke meant for text.",
      );
      return;
    }

    e.preventDefault();
    setFired(match);
    setEffect(apply(match, key));
    revealRow(match.id);
  }

  function onKeyUp(e: React.KeyboardEvent<HTMLDivElement>) {
    // Match on the key alone: a modifier is often released first, and a full
    // combo check here would leave the hold stuck on.
    const voiceKey = comboFor("tracker.voice").split("+").pop();
    if (holding && normalizeKey(e) === voiceKey) setHolding(false);
  }

  const scopes = Array.from(new Set(SHORTCUTS.map((s) => s.scope)));

  return (
    // `tabIndex` is what makes this a keyboard target at all; `focus-within`
    // covers the case where focus is on the note field or a toggle inside.
    <div
      role="group"
      aria-label="Keyboard shortcut playground"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setFocused(false);
          setHolding(false);
        }
      }}
      className="rounded-2xl outline-none ring-offset-2 ring-offset-background focus-within:ring-3 focus-within:ring-ring/50"
    >
      <DemoFrame
        label="Interactive keyboard shortcuts demo"
        active={activeHref}
        className="h-[36rem]"
        sidebarTop={
          <div className="flex min-h-0 flex-col">
            <div className="px-3 pt-2 pb-1">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Profiles
              </span>
            </div>
            <div className="space-y-0.5 px-2 pb-2">
              {DEMO_PROFILES.map((name, i) => {
                const active = name === profile;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setProfile(name)}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                      active
                        ? "bg-accent font-medium text-accent-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span aria-hidden className="text-base">
                      {DEMO_PROFILE_ICON[name]}
                    </span>
                    <span className="truncate">{name}</span>
                    <Kbd combo={profileCombo(i)} className="ml-auto shrink-0 opacity-60" />
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setProfile(ALL_PROFILES)}
                aria-current={profile === ALL_PROFILES ? "true" : undefined}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                  profile === ALL_PROFILES
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <LayoutGrid className="size-4" />
                <span className="truncate">{ALL_PROFILES}</span>
                <Kbd
                  combo={comboFor("profiles.all")}
                  className="ml-auto shrink-0 opacity-60"
                />
              </button>
            </div>
          </div>
        }
        header={
          <div className="shrink-0 border-b px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-2 text-sm font-medium">
                <section.icon className="size-4 text-muted-foreground" />
                {section.label}
              </span>
              <span className="text-sm text-muted-foreground">· {profile}</span>
              <span className="ml-auto inline-flex items-center gap-2">
                {pressed ? (
                  <Kbd combo={pressed} />
                ) : (
                  <span className="text-xs text-muted-foreground">no key yet</span>
                )}
              </span>
            </div>
            <p
              className={cn(
                "mt-1.5 min-h-[1.25rem] text-sm",
                fired ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {focused ? (
                effect || (
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    Press a key — try{" "}
                    <Kbd combo={comboFor("nav.transactions")} />,{" "}
                    <Kbd combo={comboFor("action.add")} /> or{" "}
                    <Kbd combo={comboFor("tracker.toggle-mode")} />.
                  </span>
                )
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <MousePointerClick className="size-3.5" />
                  Click this panel, then press a key. Nothing outside it is
                  touched.
                </span>
              )}
            </p>
          </div>
        }
        bodyClassName="overflow-hidden"
        footer={
          <div className="shrink-0 space-y-2 border-t bg-muted/20 px-4 py-3">
            <div className={MODE_ROW_DENSE}>
              <EntryModeToggle mode={mode} onChange={setMode} dense pane={mode} />
              {mode === "manual" ? (
                <DemoControlGroup>
                  <DemoTypeToggle dense type={type} onChange={setType} />
                  <DemoDateChip />
                  <span className="truncate px-1 text-xs text-muted-foreground">
                    {profile}
                  </span>
                </DemoControlGroup>
              ) : (
                <span
                  className={cn(
                    "ml-auto inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs",
                    holding
                      ? "border-rose-500/40 text-rose-600 dark:text-rose-400"
                      : "text-muted-foreground",
                  )}
                >
                  <Mic className={cn("size-3.5", holding && "animate-pulse")} />
                  {holding ? "Listening — let go to stop" : "Hold the voice key to dictate"}
                </span>
              )}
            </div>

            <Input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-label="Note"
              placeholder="Type here — bare keys go quiet while a field has focus"
              className="h-9"
            />
          </div>
        }
      >
        <div ref={sheetRef} className="relative h-full overflow-y-auto px-4 py-3">
          {/* Deliberately not a heading: this sits between the page's h1 and
              its first h2, so an h3 here would put a hole in the outline. The
              text is indexed either way. */}
          <p className="text-sm font-medium">Every shortcut</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Straight from the app&apos;s registry — the same list the{" "}
            <Kbd combo={comboFor("global.shortcuts")} className="align-middle" /> sheet
            shows in Settings.
          </p>
          <div className="mt-3 space-y-4">
            {scopes.map((scope) => (
              <div key={scope}>
                <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {scope}
                </p>
                <ul className="divide-y rounded-lg border">
                  {SHORTCUTS.filter((s) => s.scope === scope).map((s) => (
                    <li
                      key={s.id}
                      ref={(el) => {
                        rowRefs.current[s.id] = el;
                      }}
                      className={cn(
                        "flex items-center justify-between gap-4 px-3 py-2 text-sm transition-colors",
                        fired?.id === s.id && "bg-accent text-accent-foreground",
                      )}
                    >
                      <span className="min-w-0">
                        {s.label}
                        {s.id === TYPED_ONLY_ID && (
                          <span className="text-muted-foreground">
                            {" "}
                            — typed into the field, not a bound key
                          </span>
                        )}
                      </span>
                      <Kbd combo={s.combo} className="shrink-0" />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </DemoFrame>
    </div>
  );
}

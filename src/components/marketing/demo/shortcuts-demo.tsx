"use client";

import { useId, useRef, useState } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
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
import {
  SHORTCUTS,
  comboFor,
  describeShortcut,
  isTypingTarget,
  normalizeKey,
  splitCombo,
  spokenShortcut,
  type ShortcutDef,
} from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import { DemoFrame } from "./demo-frame";
import { DemoControlGroup, DemoDateChip, DemoTypeToggle } from "./demo-controls";
import { DEMO_PROFILES, DEMO_PROFILE_ICON, type DemoTxnType } from "./demo-data";
import {
  PASSTHROUGH,
  announceKeystroke,
  echoCombo,
  resolveShortcut,
  shouldSwallow,
} from "./shortcut-match";

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
 * Whether a match is one the panel may answer for while the note field has
 * focus — the chords above, plus the opposite case: `#` is not a binding at
 * all, so a field having focus is the *only* moment it does anything.
 */
function firesWhileTyping(s: ShortcutDef | undefined): boolean {
  if (!s) return false;
  return ALLOWED_WHILE_TYPING.has(s.id) || s.unbound === "typed";
}

/**
 * Two entries are documented without being bound — `#` is a character you type
 * into the title field (the composer watches the text), and ⌘/Ctrl + P is the
 * browser's own print dialog. The registry says *that* they're unbound and why
 * (`unbound`); the wording is here, because it's marketing copy rather than app
 * data. A cheat sheet that listed them like the rest would be claiming two keys
 * we never took — and the panel doesn't swallow them either (`shouldSwallow`).
 */
const UNBOUND_NOTE: Record<NonNullable<ShortcutDef["unbound"]>, string> = {
  typed: "typed into the field, not a bound key",
  browser: "the browser's own — we just made the pages print properly",
};

/** "Shift" out of the registry's `shift+1`, so the per-profile chips can't drift. */
const PROFILE_MOD = splitCombo(comboFor("profiles.switch")).slice(0, -1).join("+");
/** Shift + 1…9, then 0 for the tenth — the app's own numbering. */
function profileCombo(index: number): string {
  return `${PROFILE_MOD}+${(index + 1) % 10}`;
}

const ALL_PROFILES = "All profiles";

export function ShortcutsDemo() {
  const isMac = useIsMac();
  const reduced = useReducedMotion();

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
    // `globals.css` forces `scroll-behavior: auto` under reduced motion, but
    // that rule can't reach a `behavior` passed to `scrollTo` — so this is the
    // one animation on the page that would still run for someone who asked for
    // none, on every keystroke.
    box.scrollTo({
      top: Math.max(0, top),
      behavior: reduced ? "auto" : "smooth",
    });
  }

  /** Run the shortcut and say what it did. */
  function apply(s: ShortcutDef, key: string, typing: boolean): string {
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
      case "tracker.category":
        // The one entry that only means anything *inside* the field: the app
        // never bound it, the composer reads the title as it is typed. So the
        // answer depends on where the visitor is — and on a US layout this
        // branch is only reachable from the field at all, because outside one
        // the same physical key is Shift + 3 and belongs to the profile
        // switcher, in the demo exactly as in the app.
        //
        // "# (hash)" rather than a bare "#", the way the page's own prose
        // writes it: this sentence is read aloud by the live region, and a
        // lone "#" is punctuation a reader drops at its default verbosity —
        // the sentence would lose the very character it's about.
        return typing
          ? "Typed, not fired — the # (hash) lands in the field, and the composer offers matching categories from the text as you go."
          : "A character, not a binding. Type # (hash) in the note field below and the category picker opens from the text itself.";
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
    const match = resolveShortcut(e, key, isMac);
    const typing = isTypingTarget(e.target);

    // Typing is typing, and the panel has nothing to say about it. While the
    // note field has focus, everything that isn't one of the few chords the app
    // deliberately lets through is text: no echo chip, no effect line, and
    // above all nothing written into the live region — which used to narrate a
    // twelve-word sentence per character, so typing "coffee" came back as six
    // of them, over the top of the reader's own echo of the letters. The
    // silence *is* the demonstration here; the field's placeholder is what
    // explains it.
    if (typing && !firesWhileTyping(match)) return;

    setPressed(echoCombo(e, key, isMac, match));

    if (!match) {
      setFired(null);
      setEffect("Nothing is bound to that, so nothing happens.");
      return;
    }

    // Matched, explained, highlighted — but only swallowed if the app itself
    // takes the key. See `shouldSwallow`.
    if (shouldSwallow(match)) e.preventDefault();
    setFired(match);
    setEffect(apply(match, key, typing));
    revealRow(match.id);
  }

  function onKeyUp(e: React.KeyboardEvent<HTMLDivElement>) {
    // Match on the key alone: a modifier is often released first, and a full
    // combo check here would leave the hold stuck on.
    const voiceKey = splitCombo(comboFor("tracker.voice")).pop();
    if (!holding || normalizeKey(e) !== voiceKey) return;
    setHolding(false);
    // Say that it stopped. The strip flipping from "Listening" back to "Hold
    // the voice key" is invisible by ear, and the start and the end of a
    // recording are the two moments that most need saying out loud — a mic you
    // can't tell is off is the whole reason people distrust push-to-talk. It
    // also keeps the *next* press audible: an unchanged sentence is never
    // re-announced, so without this the region would still read "Recording…"
    // and holding the key again would change nothing for it to say.
    setEffect(
      "Let go — recording stopped. In the app the transcript lands in the note for you to check before anything is saved.",
    );
  }

  const scopes = Array.from(new Set(SHORTCUTS.map((s) => s.scope)));
  const hintId = useId();
  /** The same three keys the visible hint offers, in words, for the description. */
  const tryKeys = ["nav.transactions", "action.add", "tracker.toggle-mode"].map((id) =>
    describeShortcut(comboFor(id), isMac),
  );

  return (
    // `tabIndex` is what makes this a keyboard target at all; `focus-within`
    // covers the case where focus is on the note field or a toggle inside.
    //
    // The role changes on focus, and that is a fix rather than a flourish.
    // NVDA and JAWS read a page in *browse mode*, where bare letters are their
    // own quick-nav commands — `t` jumps to the next table, `f` to the next
    // form, `e` to the next edit box, `b` to the next button — which is very
    // nearly this demo's key set, and neither reader leaves browse mode for a
    // focusable `group`. So a visitor could tab in, press `t`, and be moved to
    // the next table on the page while `onKeyDown` never ran at all: the one
    // panel on the site about the keyboard, undriveable from the keyboard, for
    // exactly the people it was captioned for. `application` is the role that
    // means "this widget handles its own keys", and both readers hand them over.
    //
    // It costs something, which is why it isn't the role all the time: inside
    // an application region the virtual cursor is suppressed, so the cheat
    // sheet below would stop being readable line by line the way ordinary page
    // content is. Focus is the honest line between the two. Unfocused, this is
    // a `group` and reads like the document it is; it only claims the keyboard
    // once a visitor has deliberately given it focus, and Tab still leaves —
    // which the description below says out loud, along with the manual way into
    // focus mode for a reader that doesn't follow the role change.
    <div
      role={focused ? "application" : "group"}
      aria-label="Keyboard shortcut playground"
      aria-describedby={hintId}
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
      // `ring-ring/50` measured 1.54:1 against this panel — a focus indicator
      // that fails the 3:1 it exists to meet, on the one control whose whole
      // job is to tell a keyboard user that keys now go here. The muted
      // foreground clears it in both themes.
      className="rounded-2xl outline-none ring-offset-2 ring-offset-background focus-within:ring-3 focus-within:ring-muted-foreground"
    >
      <p id={hintId} className="sr-only">
        An interactive demo of the app&apos;s keyboard shortcuts. While this
        panel has focus it takes single keys — press {tryKeys[0]}, {tryKeys[1]}{" "}
        or {tryKeys[2]} and it answers below; Tab moves on and gives every key
        back. If single letters still move your screen reader instead of the
        demo, switch it to focus mode — Insert + Space in NVDA, Insert + Z in
        JAWS.
      </p>
      {/* The panel's visible answer is unreadable by ear: the echo chip is
          `aria-hidden` glyphs and the effect line is a paragraph mutated in
          place, neither of which is announced. This says the same thing once,
          out loud. It renders (empty) from the first paint so the first
          keystroke is a change to a region already being watched. */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announceKeystroke(pressed, effect, isMac)}
      </div>

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
                    <Kbd combo={comboFor("nav.transactions")} describe />,{" "}
                    <Kbd combo={comboFor("action.add")} describe /> or{" "}
                    <Kbd combo={comboFor("tracker.toggle-mode")} describe />.
                  </span>
                )
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <MousePointerClick className="size-3.5" />
                  Click this panel or Tab to it, then press a key. Nothing
                  outside it is touched.
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
        <div
          ref={sheetRef}
          tabIndex={0}
          role="group"
          aria-label="Keyboard shortcut list"
          className="relative h-full overflow-y-auto px-4 py-3"
        >
          {/* Deliberately not a heading: this sits between the page's h1 and
              its first h2, so an h3 here would put a hole in the outline. The
              text is indexed either way. */}
          <p className="text-sm font-medium">Every shortcut</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Straight from the app&apos;s registry — the same list the{" "}
            <Kbd combo={comboFor("global.shortcuts")} className="align-middle" describe />{" "}
            sheet shows in Settings.
          </p>
          <div className="mt-3 space-y-4">
            {scopes.map((scope) => (
              <div key={scope}>
                <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {scope}
                </p>
                <ul className="divide-y rounded-lg border">
                  {SHORTCUTS.filter((s) => s.scope === scope).map((s) => {
                    const spoken = spokenShortcut(s.combo, s.label, isMac);
                    return (
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
                          {/* The key, spoken, sits with the label rather than
                              after the row like `Kbd describe` puts it: the
                              chip is drawn on the right, but read aloud in DOM
                              order it landed behind the note below and left
                              rows ending "…we just made the pages print
                              properly, Cmd + P". In a cheat sheet the key *is*
                              the content — three of these combos appear nowhere
                              else on the page — so it can't be dropped, only
                              placed. `spokenShortcut` also leaves it out where the
                              label already spells its own binding. */}
                          {spoken && <span className="sr-only">, {spoken}</span>}
                          {s.unbound && (
                            <span className="text-muted-foreground">
                              {" "}
                              — {UNBOUND_NOTE[s.unbound]}
                            </span>
                          )}
                        </span>
                        <Kbd combo={s.combo} className="shrink-0" />
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </DemoFrame>
    </div>
  );
}

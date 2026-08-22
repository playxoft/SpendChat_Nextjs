import Link from "next/link";
import { ShortcutsDemo } from "@/components/marketing/demo/shortcuts-demo";
import {
  FeatureAudience,
  FeaturePage,
  FeatureSection,
  FeatureSteps,
} from "@/components/marketing/feature-page";
import { Kbd } from "@/components/ui/kbd";
import { featureLink, getFeature } from "@/lib/features";
import { createMetadata } from "@/lib/seo";
import { comboFor, formatShortcutKeys } from "@/lib/shortcuts";

const SLUG = "keyboard-shortcuts";
const feature = getFeature(SLUG)!;

export const metadata = createMetadata({
  title: feature.title,
  description: feature.description,
  path: `/features/${SLUG}`,
});

/**
 * A combo written out as prose, for the places that take a plain string (steps,
 * FAQ answers) rather than JSX where `<Kbd>` can do it properly.
 *
 * Both platforms, always. This page is server-rendered and cached, so it can't
 * know whose keyboard it's about to land on — and an answer that says ⌘ to a
 * Windows reader is worse than one that says both. Everything still comes out
 * of the registry, so no key is spelled out by hand anywhere on this page.
 */
function comboText(id: string): string {
  const combo = comboFor(id);
  const mac = formatShortcutKeys(combo, true).join(" + ");
  const pc = formatShortcutKeys(combo, false).join(" + ");
  return mac === pc ? mac : `${mac} on a Mac, ${pc} on Windows and Linux`;
}

const faqs = [
  {
    q: "What are the keyboard shortcuts?",
    a: `Single letters move between sections: ${comboText("nav.tracker")} for the tracker, ${comboText("nav.transactions")} for transactions, ${comboText("nav.analytics")} for analytics, ${comboText("nav.files")} for files and ${comboText("nav.settings")} for settings. ${comboText("action.add")} opens the add-transaction dialog and ${comboText("action.bulk")} opens bulk add. In the composer, ${comboText("tracker.submit")} sends. Press ${comboText("global.shortcuts")} anywhere in the app for the full sheet — it is the same list you can try on this page.`,
  },
  {
    q: "Do the shortcuts work on Windows?",
    a: "Yes. A modifier is stored once as “mod” and resolves to Command on macOS, Control on Windows and Linux, and every hint in the interface renders the right one for the machine you are on. The number shortcuts match on the physical key rather than the character it produces, so they behave the same on a non-US layout.",
  },
  {
    q: "How do I log an expense without the mouse?",
    a: `The amount field already has focus when the tracker opens: type the amount, press Enter to move to the title, type ${comboFor("tracker.category")} and a few letters to pick a category from the list that filters as you go, then ${comboText("tracker.submit")} to send. From any other page, ${comboText("action.add")} opens the same entry as a dialog.`,
  },
  {
    q: "Why does pressing a letter sometimes do nothing?",
    a: "Single-key shortcuts are suppressed in two situations: when focus is in a text field, and when a dialog, menu or dropdown is open. The alternative is a key that types a letter most of the time and teleports you elsewhere the rest of the time. Shortcuts with a modifier still work while you type, which is why sending has one.",
  },
  {
    q: "Can I remap the keyboard shortcuts?",
    a: "Not today. Every shortcut lives in one registry in the source, which is what keeps the app, the settings sheet, the tooltips and this page from disagreeing — but it also means the bindings are fixed for now. SpendChat is open source under the AGPL, so remapping is a change to one list rather than a hunt through the codebase.",
  },
  {
    q: "Where do I find the full list of shortcuts?",
    a: `Press ${comboText("global.shortcuts")} anywhere in the app and the cheat sheet opens over whatever you were doing, or open Settings → Shortcuts for the same list as a page. Both render from the registry, so neither can go stale.`,
  },
];

export default function KeyboardShortcutsPage() {
  return (
    <FeaturePage
      slug={SLUG}
      demo={<ShortcutsDemo />}
      demoAction="click the panel, then press a key and watch the app move"
      faqs={faqs}
      intro={
        <>
          <p>
            Money is logged in small, frequent bursts — a coffee here, a bus
            fare there — and anything that makes you reach for the mouse turns a
            two-second job into a ten-second one. So the app answers to the
            keyboard: one letter per section, one letter to start an entry, one
            modifier combo to send it.
          </p>
          <p>
            The panel below is wired to the real shortcut registry. Click it,
            press a key, and watch the sidebar and the composer respond.
          </p>
        </>
      }
    >
      <FeatureSteps
        steps={[
          {
            title: "Press a letter to move",
            body: "One letter per section — tracker, transactions, analytics, files and settings — printed next to each in the sidebar. The profile you are on comes with you.",
          },
          {
            title: "Start an entry",
            body: `${comboText("action.add")} opens the add-transaction dialog from anywhere; on the tracker the composer already has focus, so you can just start typing the amount.`,
          },
          {
            title: "Send it",
            body: `${comboText("tracker.submit")} sends from any field in the composer, so your hands never leave the keys between one transaction and the next.`,
          },
        ]}
      />

      <FeatureSection title="One letter per section, and why letters">
        <p>
          The five sections of the app answer to five single keys:{" "}
          <Kbd combo={comboFor("nav.tracker")} className="align-middle" /> for the
          tracker,{" "}
          <Kbd combo={comboFor("nav.transactions")} className="align-middle" /> for
          transactions,{" "}
          <Kbd combo={comboFor("nav.analytics")} className="align-middle" /> for
          analytics, <Kbd combo={comboFor("nav.files")} className="align-middle" />{" "}
          for files and{" "}
          <Kbd combo={comboFor("nav.settings")} className="align-middle" /> for
          settings. Each is printed next to its item in the sidebar, so you
          learn them by using the app rather than by studying a manual.
        </p>
        <p>
          Bare letters rather than modifier chords, because a chord costs an
          awkward stretch and this is something you do dozens of times a
          session. A couple of them are positional rather than mnemonic — the
          obvious first initials collide with each other — but two days of use
          and your fingers stop asking. The price of bare letters is that they
          have to know when you&apos;re typing, which is the next section.
        </p>
        <p>
          A section jump carries your current profile along, so moving from the
          feed to the{" "}
          <Link href={featureLink("transactions")} className="underline underline-offset-4">
            transactions table
          </Link>{" "}
          doesn&apos;t drop you back into the first set of books. For anyone
          running{" "}
          <Link
            href={featureLink("multiple-profiles")}
            className="underline underline-offset-4"
          >
            separate profiles
          </Link>
          , a navigation that resets your context is one you stop trusting.
        </p>
      </FeatureSection>

      <FeatureSection title="The rule that makes single keys safe">
        <p>
          A single-key shortcut fires only when two things are true: focus
          isn&apos;t in a text field, and no dialog or menu is open. Without the
          first rule, typing &ldquo;taxi&rdquo; into a title would fling you at
          the transactions table. Without the second, a key would fight the
          type-ahead in the menu you just opened.
        </p>
        <p>
          Shortcuts carrying a modifier are exempt, because nothing you type
          into a field starts with ⌘ or Ctrl. That&apos;s why sending is a
          modifier combo: in the{" "}
          <Link
            href={featureLink("chat-expense-tracker")}
            className="underline underline-offset-4"
          >
            chat composer
          </Link>{" "}
          it has to work from inside the amount field, which is exactly where
          your hands are when you want it.
        </p>
        <p>
          The honest edge of the design is the category tag. The cheat sheet
          lists <Kbd combo={comboFor("tracker.category")} className="align-middle" />{" "}
          for picking a category, but it isn&apos;t a bound key — it&apos;s a
          character you type into the title field, and the composer watches the
          text and filters the list as you go. It couldn&apos;t be a binding: on
          a US layout that character <em>is</em> Shift and a digit, which is how
          you switch profiles. It&apos;s listed anyway, because a cheat sheet
          that omits the fastest way to categorise isn&apos;t much of a cheat
          sheet.
        </p>
      </FeatureSection>

      <FeatureSection title="⌘ or Ctrl, decided by your keyboard">
        <p>
          Shortcuts are stored once, with the modifier written as{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-sm">mod</code> —
          Command on macOS, Control everywhere else. Every hint in the app
          renders from that registry for the machine you&apos;re on, so a
          Windows user never sees a ⌘ they can&apos;t press. The chips on this
          page come from the same place, which is why they match whatever
          you&apos;re reading this on.
        </p>
        <p>
          Some keys we deliberately left alone. Printing is the browser&apos;s
          own combo — we didn&apos;t bind it, we gave every page a print
          stylesheet so that dialog produces a clean report rather than a
          screenshot of the app&apos;s furniture. Find-in-page, tab switching
          and reload stay yours; a web app that hijacks those is one you fight.
        </p>
      </FeatureSection>

      <FeatureSection title="One key is held rather than tapped">
        <p>
          Every shortcut is a tap except one:{" "}
          <Kbd combo={comboFor("tracker.voice")} className="align-middle" /> is
          push-to-talk. Hold it and the microphone records; let go and it stops,
          transcribes, and drops the text into the AI note for you to check.
          A hold rather than a toggle, for the obvious reason: a toggle leaves
          you one forgotten keystroke away from a microphone that&apos;s still
          on.
        </p>
        <p>
          Key repeat is ignored, so holding starts one recording rather than a
          hundred, and a release that lands while the window is in the
          background still ends the take. Dictation lives in AI entry, where the
          transcript has somewhere to go, so the tap that switches Manual and AI
          usually comes first — both single keys, so the whole gesture is press,
          hold, speak, release, read, send.
        </p>
      </FeatureSection>

      <FeatureSection title="Profiles and workspaces without opening a menu">
        <p>
          Every profile carries its own key, printed beside it in the sidebar:{" "}
          <Kbd combo={comboFor("profiles.switch")} className="align-middle" />{" "}
          for the first, and the digits carry on from there with the tenth on
          zero.{" "}
          <Kbd combo={comboFor("profiles.all")} className="align-middle" /> shows
          every profile at once, for when you want one number instead of three.
          If you keep personal, household and business books side by side,
          that&apos;s the difference between checking a balance and navigating
          to one.
        </p>
        <p>
          Workspaces — the shared layer, where other people are — get{" "}
          <Kbd combo={comboFor("workspace.switch")} className="align-middle" />,
          which opens a picker that then takes a digit. Two keystrokes rather
          than one, because a workspace switch changes far more than a profile
          switch does: different members, different categories, different
          currency.
        </p>
        <p>
          The same reasoning gates the write keys. The ones that open the add
          and{" "}
          <Link href={featureLink("bulk-add")} className="underline underline-offset-4">
            bulk-add
          </Link>{" "}
          dialogs stay inert while a switch is in flight, so a dialog never
          opens pre-filled with the books you&apos;re leaving — and if your role
          is view-only they do nothing at all, rather than opening a form that
          would fail on save.
        </p>
      </FeatureSection>

      <FeatureAudience
        items={[
          {
            title: "People who log as they go",
            body: "If you log transactions the moment they happen, several times a day, the trip to the mouse is most of the work. Removing it turns tracking into a reflex.",
          },
          {
            title: "Keyboard-first people",
            body: "If you drive your editor, your terminal and your mail client from the keyboard, a money app that insists on clicks feels broken. This one doesn't.",
          },
          {
            title: "Anyone catching up on a backlog",
            body: "Entering a month of receipts in one sitting is where shortcuts pay for themselves: one key to open the entry, one combo to send, repeat.",
          },
        ]}
      />
    </FeaturePage>
  );
}

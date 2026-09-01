import Link from "next/link";
import { VoiceDemo } from "@/components/marketing/demo/voice-demo";
import {
  FeatureAudience,
  FeaturePage,
  FeatureSection,
  FeatureSteps,
} from "@/components/marketing/feature-page";
import { featureLink, getFeature } from "@/lib/features";
import { createMetadata } from "@/lib/seo";
import { MAX_VOICE_LANGUAGES, VOICE_LANGUAGES } from "@/lib/voice-languages";

const SLUG = "voice-expense-tracker";
const feature = getFeature(SLUG)!;

export const metadata = createMetadata({
  title: feature.title,
  description: feature.description,
  path: `/features/${SLUG}`,
});

const faqs = [
  {
    q: "How does voice expense tracking work?",
    a: "Hold the M key (or the mic button) and say what you spent. When you let go, the recording is transcribed, the text is dropped into the AI note, and the parsed transactions appear as drafts for you to check. You confirm, and they're in.",
  },
  {
    q: "Which languages does it understand?",
    a: `${VOICE_LANGUAGES.length} languages, and you choose up to ${MAX_VOICE_LANGUAGES} of them in Settings. Naming several at once is what makes mixed speech work — a sentence that starts in Hindi and finishes in English is transcribed as spoken rather than forced into one language.`,
  },
  {
    q: "Does it work with Hinglish, or Tamil mixed with English?",
    a: "Yes, and that's the case it was built for. Because the transcription is told to expect every language you selected — not just one — a sentence like \"chai 20 aur groceries 620\" comes back as written rather than transliterated into whichever language was picked first.",
  },
  {
    q: "Is my audio recorded or stored?",
    a: "No. The recording is sent to be transcribed, the text comes back, and the audio is discarded. Nothing is written to storage and there is no recording history to browse, export or leak.",
  },
  {
    q: "Does speaking create a transaction straight away?",
    a: "Never. Voice produces text, the text produces drafts, and the drafts wait for you. A misheard merchant or a wrong amount is caught by a person before anything is saved.",
  },
  {
    q: "Do I need to install an app to use voice entry?",
    a: "No. It records in the browser on desktop and mobile. Your browser will ask for microphone permission the first time, and you can revoke it whenever you like — voice entry is optional and everything else works without it.",
  },
];

export default function VoiceExpenseTrackerPage() {
  return (
    <FeaturePage
      slug={SLUG}
      demo={<VoiceDemo />}
      demoAction="pick a language and hold the mic button"
      faqs={faqs}
      intro={
        <>
          <p>
            Typing is fast. Talking is faster — and it&apos;s the only option at
            all when you&apos;re driving, carrying shopping, or halfway through
            cooking. Hold one key, say what you spent, and SpendChat writes it
            down for you to check.
          </p>
          <p>
            Most voice expense trackers assume you speak one language at a time.
            Plenty of people don&apos;t. Try the demo below in Hinglish or Tamil
            and watch it come back as spoken.
          </p>
        </>
      }
    >
      <FeatureSteps
        steps={[
          {
            title: "Hold M",
            body: "Push-to-talk, not a mode you switch into. Hold the key or the mic button; releasing it ends the recording. There's no way to leave the mic running by accident.",
          },
          {
            title: "Say it normally",
            body: "\"Coffee four fifty and sixty two on groceries.\" No command words, no fixed order, no pauses to dictate punctuation.",
          },
          {
            title: "Check and confirm",
            body: "The transcript becomes draft transactions. Fix anything it misheard, then save. Nothing is written until you do.",
          },
        ]}
      />

      <FeatureSection title="Speak the languages you actually speak">
        <p>
          This is the part most voice trackers get wrong, and it isn&apos;t a
          small thing. Speech-to-text services usually take{" "}
          <em>one</em> language code per request. Give them{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-sm">hi</code> and
          they&apos;ll do a good job of Hindi — and then transliterate every
          English word you said into Devanagari. Give them{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-sm">en</code> and
          the Hindi comes back as nonsense that merely rhymes. Neither is what
          you said, and both make the parse downstream useless.
        </p>
        <p>
          But almost nobody who speaks two languages speaks them one at a time.
          &ldquo;Chai 20 aur groceries 620&rdquo; is an entirely ordinary
          sentence in a great many households, and every word in it is chosen on
          purpose. A tracker that can&apos;t hear it is a tracker you have to
          consciously translate for, which is slower than typing and defeats the
          point.
        </p>
        <p>
          So SpendChat treats your languages as a <strong>list</strong>, not a
          setting. You pick up to {MAX_VOICE_LANGUAGES} in Settings → Voice, and
          the transcription is told to expect all of them at once. A sentence
          that switches mid-way is transcribed as spoken, because nothing ever
          forced it into a single language in the first place. That one design
          decision is the whole feature.
        </p>
        <p>
          {VOICE_LANGUAGES.length} languages are available, weighted toward the
          places where code-mixing with English is simply how people talk:
        </p>
        <ul className="flex flex-wrap gap-1.5 pt-1">
          {VOICE_LANGUAGES.map((language) => (
            <li
              key={language.code}
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm text-foreground"
            >
              <span>{language.nativeName}</span>
              {language.nativeName !== language.englishName && (
                <span className="text-xs text-muted-foreground">
                  {language.englishName}
                </span>
              )}
            </li>
          ))}
        </ul>
        <p className="pt-1">
          The cap is deliberate. Past a handful, naming more languages stops
          narrowing anything down and starts reading as &ldquo;expect
          anything&rdquo; — which is worse than useful, because the instruction
          budget goes on a list instead of on the money vocabulary that actually
          improves the result.
        </p>
      </FeatureSection>

      <FeatureSection title="The audio is transcribed and thrown away">
        <p>
          Your recording is sent to be transcribed and then discarded. It
          isn&apos;t written to storage, there&apos;s no recording history, and
          there is nothing to export or lose in a breach. The only thing that
          survives the round trip is the text — and after you&apos;ve confirmed
          the drafts, not even that.
        </p>
        <p>
          Push-to-talk matters here too. A mic that toggles on and off can be
          left running; one that records only while held cannot. The button
          captures the pointer when you press it, so even sliding your finger
          off and releasing somewhere else still stops the recording.
        </p>
      </FeatureSection>

      <FeatureSection title="Speaking never creates a transaction directly">
        <p>
          Voice produces text. The text goes into the{" "}
          <Link
            href={featureLink("ai-expense-tracker")}
            className="underline underline-offset-4"
          >
            AI note
          </Link>
          , which produces drafts. The drafts wait for you. At no point does
          something you said become a saved record without passing in front of a
          person.
        </p>
        <p>
          That&apos;s a deliberate constraint rather than an unfinished feature.
          Transcription is good, not perfect, and it degrades exactly where you
          most want to use it — in a car, in a market, with a fan running. The
          failure it produces is a plausible-looking wrong number, which is the
          worst kind to let into a financial record. One review step costs two
          seconds and removes the entire class of problem.
        </p>
      </FeatureSection>

      <FeatureSection title="Where it actually earns its place">
        <p>
          <strong>In the car.</strong> You&apos;ve just paid for fuel and
          you&apos;re pulling out. Typing isn&apos;t an option; talking is.
        </p>
        <p>
          <strong>Hands full.</strong> Carrying shopping, holding a child,
          halfway through cooking — all the moments where a purchase just
          happened and a phone is out of reach.
        </p>
        <p>
          <strong>Several things at once.</strong> Saying four purchases in one
          breath is meaningfully faster than typing them, and the parse splits
          them apart for you.
        </p>
        <p>
          <strong>When typing your own language is slow.</strong> If your
          keyboard makes you switch scripts to write a word, speaking it is
          often several times faster.
        </p>
      </FeatureSection>

      <FeatureSection title="Why not just use a general voice assistant?">
        <p>
          You can dictate into any notes app, and if that works for you it&apos;s
          genuinely fine. What you don&apos;t get is the second half: something
          that reads &ldquo;coffee 4.50 and 62 on groceries&rdquo; and produces
          two categorised transactions in the right profile, with a running
          balance that updates. You&apos;d still be transcribing your own note
          into a tracker afterwards.
        </p>
        <p>
          General assistants also tend to be single-language by default, and to
          keep recordings by default. Both are the opposite of what this is for.
        </p>
      </FeatureSection>

      <FeatureAudience
        items={[
          {
            title: "Multilingual households",
            body: "If your everyday speech mixes two languages, this is the only part of the product built specifically for you — and the reason the language setting is a list.",
          },
          {
            title: "People who spend on the move",
            body: "Delivery drivers, field sales, anyone whose day is a series of small cash payments between other tasks. Speaking is the only entry method that fits.",
          },
          {
            title: "Anyone who types slowly on a phone",
            body: "Especially in a non-Latin script, where switching keyboards for one word is its own small chore.",
          },
        ]}
      />
    </FeaturePage>
  );
}

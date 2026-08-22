"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, Keyboard, Mic, Minus, Paperclip, Sparkles } from "lucide-react";
import { DemoFrame } from "./demo-frame";
import { MAX_INPUT_CHARS, MAX_RECORDING_MS } from "@/lib/ai-limits";
import { cn } from "@/lib/utils";

/**
 * Privacy has no product surface to demonstrate — there is no screen where
 * "your data is scoped to your account" happens. So this demo isn't a replica of
 * anything; it's a ledger.
 *
 * The visitor picks one of the four things you can actually do in SpendChat and
 * reads two columns: what the request carries, and what it doesn't. Every line
 * below is a statement about code in this repo — the payload the AI adapters
 * build (`ai-parse.ts` / `ai-transcribe.ts` / `ai-provider.ts`), the columns
 * `ai_usage_log` has, the headers `next.config.ts` sends, the layout the
 * analytics scripts are mounted in. Nothing here is aspirational, and nothing
 * describes encryption or compliance we haven't got. If a claim can't be
 * pointed at a file, it doesn't belong in this list.
 *
 * Inert by design: no fetch, no storage, no state beyond which chip is
 * selected, and the whole thing server-renders so a crawler reads the same
 * ledger a visitor does.
 */

type Item = {
  /** The short noun phrase, shown in the row's own weight. */
  what: string;
  /** Why it's in this column — one sentence, specific. */
  detail: string;
};

type Flow = {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Read under the chips: what this action is, in one line. */
  caption: string;
  /** Where the payload ends up. */
  destination: string;
  sent: Item[];
  withheld: Item[];
};

const RECORDING_SECONDS = MAX_RECORDING_MS / 1000;

const FLOWS: Flow[] = [
  {
    id: "manual",
    label: "Add a transaction",
    icon: Keyboard,
    caption: "The ordinary path — type an amount, pick a category, send.",
    destination: "SpendChat's own server, and nowhere else.",
    sent: [
      {
        what: "The amount",
        detail:
          "Stored as a whole number of minor units — 4.50 is saved as 450, so no rounding error can creep into a balance.",
      },
      {
        what: "Title, note, category, date and profile",
        detail: "The fields you filled in, exactly as you filled them in.",
      },
      {
        what: "Your session cookie",
        detail:
          "An httpOnly cookie holding your Firebase sign-in token. It is what scopes the write to your account — and JavaScript on the page can't read it.",
      },
    ],
    withheld: [
      {
        what: "Any AI provider",
        detail:
          "Manual entry calls no model. There is no request to make, so there is nothing to leak in one.",
      },
      {
        what: "Bank or card credentials",
        detail:
          "There is no bank integration, so there is no field anywhere in the app to type them into.",
      },
      {
        what: "Analytics",
        detail:
          "Google Analytics and Microsoft Clarity are mounted in the marketing layout only. The signed-in app never loads either one.",
      },
    ],
  },
  {
    id: "ai",
    label: "Use AI entry",
    icon: Sparkles,
    caption: "One messy sentence becomes drafts you check before saving.",
    destination: "The model configured for parsing — plus our server, as above.",
    sent: [
      {
        what: "Your note, as typed",
        detail: `One string, capped at ${MAX_INPUT_CHARS.toLocaleString("en-US")} characters. Whatever you wrote is what the model sees.`,
      },
      {
        what: "Your workspace's category names",
        detail:
          "A plain list, so the model can only pick a category that already exists. The prompt tells it to treat the list as data, never as instructions.",
      },
      {
        what: "The workspace currency code and today's date",
        detail:
          "Enough to read “1,000” as an amount and “yesterday” as a date. Both are settings, not personal data.",
      },
    ],
    withheld: [
      {
        what: "Who you are",
        detail:
          "The request carries the note and the category list. No name, no email, no user id goes with it.",
      },
      {
        what: "Your balance and your other transactions",
        detail:
          "The model is given the sentence you just typed, never your history — it has no way to ask for it.",
      },
      {
        what: "The note, in our own records",
        detail:
          "The usage row that enforces the hourly limit holds a user id, a workspace id, a label and a timestamp. Four columns, none of them your text.",
      },
      {
        what: "Anything saved before you look",
        detail:
          "What comes back is a review list. Nothing reaches the database until you press Add.",
      },
    ],
  },
  {
    id: "voice",
    label: "Dictate a voice note",
    icon: Mic,
    caption: "Hold the mic, say what you spent, read it back.",
    destination:
      "The model configured for transcription — a separate setting from the parser.",
    sent: [
      {
        what: "The recording",
        detail: `Raw audio from the browser's recorder, which stops itself at ${RECORDING_SECONDS} seconds whether or not you're still holding the key.`,
      },
      {
        what: "The languages you picked",
        detail:
          "From Settings → Voice. Naming several at once is what lets a sentence that switches mid-way come back as spoken.",
      },
      {
        what: "Category names and the currency code",
        detail:
          "Spelling hints only. Nothing in the reply chooses a category — that happens later, against your workspace's own list.",
      },
    ],
    withheld: [
      {
        what: "The audio, once it's text",
        detail:
          "It is transcribed and discarded. Nothing is written to storage, so there is no recording history to browse, export or lose.",
      },
      {
        what: "A microphone that stays on",
        detail:
          "Recording runs while the key is held and stops when you let go. Every page except the tracker also ships a Permissions-Policy header that closes the mic entirely.",
      },
      {
        what: "A finished transaction",
        detail:
          "Speaking produces text. The text produces drafts. The drafts wait for a person to read them.",
      },
    ],
  },
  {
    id: "receipt",
    label: "Upload a receipt",
    icon: Paperclip,
    caption: "A bill or invoice, attached to the transaction it belongs to.",
    destination: "Cloudflare R2 object storage, through our server.",
    sent: [
      {
        what: "The file itself",
        detail: "Up to 5 MB, stored under a key that only your workspace's rows point at.",
      },
      {
        what: "Its name, size and type",
        detail:
          "Recorded against the transaction, so the app can show the right filename and icon without opening the file.",
      },
    ],
    withheld: [
      {
        what: "The contents, to any model",
        detail:
          "There is no OCR step and no vision step. Nothing reads your receipt except you.",
      },
      {
        what: "A public link",
        detail:
          "The bucket address is never exposed. Every view is authorised first, then either served from our own origin or redirected to a signed link that expires in five minutes.",
      },
      {
        what: "Anything you didn't attach",
        detail:
          "Uploads are one explicit file at a time. Nothing is scanned, indexed or picked up from your device.",
      },
    ],
  },
];

function Column({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "sent" | "withheld";
  items: Item[];
}) {
  const Icon = tone === "sent" ? ArrowUpRight : Minus;
  return (
    <div className="min-w-0">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <span
          aria-hidden
          className={cn(
            "flex size-6 items-center justify-center rounded-full border",
            tone === "sent" ? "bg-muted" : "bg-background",
          )}
        >
          <Icon className="size-3.5 text-muted-foreground" />
        </span>
        {title}
      </h3>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li
            key={item.what}
            className={cn(
              "rounded-xl border p-3",
              tone === "sent" ? "bg-card" : "border-dashed bg-transparent",
            )}
          >
            <p className="text-sm font-medium">{item.what}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {item.detail}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PrivacyDemo() {
  const [flowId, setFlowId] = useState(FLOWS[0].id);
  const flow = FLOWS.find((f) => f.id === flowId) ?? FLOWS[0];

  return (
    <div>
      {/* The chips sit above the frame, like the voice demo's language picker —
          choosing the action *is* the demo, so it shouldn't be buried inside a
          pane the visitor has to notice first. */}
      <div className="mb-3 flex flex-col items-center gap-2">
        <div className="flex flex-wrap justify-center gap-1.5">
          {FLOWS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFlowId(f.id)}
              aria-pressed={f.id === flow.id}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
                f.id === flow.id
                  ? "border-foreground bg-foreground text-background"
                  : "hover:bg-muted",
              )}
            >
              <f.icon className="size-3.5" />
              {f.label}
            </button>
          ))}
        </div>
        <p className="text-center text-xs text-muted-foreground">{flow.caption}</p>
      </div>

      <DemoFrame
        label="What leaves your device"
        active="/app/settings"
        // Pinned: the four actions have different numbers of rows, and a frame
        // that resized between them would shift everything below it on the page.
        className="h-[34rem]"
        header={
          <div className="flex shrink-0 flex-wrap items-baseline gap-x-2 gap-y-1 border-b px-4 py-3">
            <h2 className="text-sm font-medium">Where it goes</h2>
            <p className="min-w-0 text-sm text-muted-foreground">{flow.destination}</p>
          </div>
        }
        bodyClassName="overflow-y-auto"
        footer={
          <p className="shrink-0 border-t bg-muted/20 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
            Connections run over HTTPS, and the app sends a strict
            Content-Security-Policy, HSTS and frame-blocking headers on every
            response. Nothing on this page is a live request — it&apos;s a
            written-down description of what the code does.
          </p>
        }
      >
        <div className="grid gap-6 px-4 py-4 md:grid-cols-2">
          <Column title="What is sent" tone="sent" items={flow.sent} />
          <Column title="What never leaves" tone="withheld" items={flow.withheld} />
        </div>
      </DemoFrame>
    </div>
  );
}

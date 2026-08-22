"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ListPlus, MessageSquare, Mic, Sparkles } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { VoiceListeningStrip } from "@/components/app/voice-mic";
import { DemoFeed } from "@/components/marketing/demo/demo-feed";
import {
  DemoDraftRows,
  patchDraft,
  type DemoDraft,
} from "@/components/marketing/demo/demo-draft-rows";
import {
  DEMO_CURRENCY,
  DEMO_LOCALE,
  DEMO_SEEDS,
} from "@/components/marketing/demo/demo-data";
import { featurePath, getFeature } from "@/lib/features";
import { parseBulk } from "@/lib/bulk-parser";
import { formatMoney, signedMinor, toMinorUnits } from "@/lib/money";

/**
 * "Four ways to add a transaction" — the homepage's routing section.
 *
 * The full demos live on the feature pages; this shows each method at a glance
 * and sends people to the page that proves it. That split is deliberate.
 * Loading four complete demos here would cost the homepage its LCP for
 * illustrations nobody scrolled to yet, and the homepage's job is to route,
 * not to demonstrate — the hero already carries one fully interactive tracker.
 *
 * The previews are still built from the app's real components rather than
 * screenshots, so the section can't drift out of date the way an image would.
 */

/** Fixed so nothing reads the clock during render — see `demo-data.ts`. */
const BULK_TODAY = "2026-08-01";

const BULK_SAMPLE = [
  "12.50, Lunch with the team, Food & Dining, expense",
  "62, Weekly groceries, Groceries, expense",
  "2000, August salary, Salary, income",
].join("\n");

const AI_DRAFTS: DemoDraft[] = [
  { key: 1, type: "expense", amount: "4.50", title: "Coffee", categoryName: "Food & Dining" },
  { key: 2, type: "expense", amount: "62.00", title: "Groceries", categoryName: "Groceries" },
];

const METHODS = [
  {
    id: "chat",
    label: "Chat",
    icon: MessageSquare,
    slug: "chat-expense-tracker",
    heading: "Type an amount, pick a category, send",
    body: "The default, and the fastest for a single purchase. Entries land in a feed grouped by day, with your balance running above them. No form, no save dialog, no page change.",
  },
  {
    id: "ai",
    label: "AI",
    icon: Sparkles,
    slug: "ai-expense-tracker",
    heading: "Write a sentence, check the drafts",
    body: "Best when you're logging a whole day at once. The AI splits the sentence into transactions and guesses the categories from your own list — then waits for you to confirm. Nothing saves on its own.",
  },
  {
    id: "voice",
    label: "Voice",
    icon: Mic,
    slug: "voice-expense-tracker",
    heading: "Hold a key and say it",
    body: "For when your hands are full. The recording is transcribed and turned into drafts, then discarded. Name several languages and a sentence that mixes them still comes back as spoken.",
  },
  {
    id: "bulk",
    label: "Bulk paste",
    icon: ListPlus,
    slug: "bulk-add",
    heading: "Paste a spreadsheet",
    body: "For catching up, or moving in from somewhere else. Paste rows as amount, note, category, type, date and you'll see them parsed — including anything that needs fixing — before a single record is saved.",
  },
] as const;

export function EntryMethods() {
  const [bulkText, setBulkText] = useState(BULK_SAMPLE);
  const [aiRows, setAiRows] = useState<DemoDraft[]>(AI_DRAFTS);

  // The real parser, running in the browser. It's a pure function over a
  // string, so a marketing page can use it directly — which makes this preview
  // genuinely honest rather than a mock-up of what parsing looks like.
  const bulk = useMemo(
    () => parseBulk(bulkText, BULK_TODAY, DEMO_LOCALE),
    [bulkText],
  );

  return (
    <Tabs defaultValue="chat" className="w-full gap-6">
      <TabsList className="mx-auto">
        {METHODS.map((method) => (
          <TabsTrigger key={method.id} value={method.id} className="gap-1.5">
            <method.icon className="size-4" />
            {method.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {METHODS.map((method) => {
        const page = getFeature(method.slug);
        return (
          <TabsContent key={method.id} value={method.id}>
            <div className="grid items-center gap-8 lg:grid-cols-2">
              <div className="min-w-0">
                <h3 className="text-xl font-medium tracking-tight sm:text-2xl">
                  {method.heading}
                </h3>
                <p className="mt-3 leading-relaxed text-muted-foreground">
                  {method.body}
                </p>
                {page && (
                  <Link
                    href={featurePath(page.slug)}
                    data-track-event="nav_link_click"
                    data-track-params={JSON.stringify({
                      location: "home_entry_methods",
                      label: page.slug,
                    })}
                    className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4"
                  >
                    See how {method.label.toLowerCase()} entry works
                    <ArrowRight className="size-3.5" />
                  </Link>
                )}
              </div>

              {/* Preview. A fixed min-height across all four keeps the section
                  from resizing as tabs are switched. */}
              <div className="min-h-[16rem] min-w-0 rounded-2xl border bg-card p-4">
                {method.id === "chat" && <DemoFeed txns={DEMO_SEEDS.Personal} />}

                {method.id === "ai" && (
                  <div className="space-y-2">
                    <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                      coffee 4.50 and 62 on groceries
                    </p>
                    <DemoDraftRows
                      rows={aiRows}
                      visible={aiRows.length}
                      onPatch={(key, changes) =>
                        setAiRows((prev) => patchDraft(prev, key, changes))
                      }
                      onRemove={(key) =>
                        setAiRows((prev) => prev.filter((r) => r.key !== key))
                      }
                    />
                  </div>
                )}

                {method.id === "voice" && (
                  <div className="space-y-2">
                    <VoiceListeningStrip
                      state="recording"
                      interim="chai 20 aur groceries 620"
                      level={0.55}
                      liveSupported
                    />
                    <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                      chai 20 aur groceries 620
                    </p>
                    <p className="px-0.5 text-xs text-muted-foreground">
                      Hinglish, transcribed as spoken rather than forced into one
                      language.
                    </p>
                  </div>
                )}

                {method.id === "bulk" && (
                  <div className="space-y-2">
                    <Textarea
                      value={bulkText}
                      onChange={(e) => setBulkText(e.target.value)}
                      rows={4}
                      aria-label="Paste transactions"
                      spellCheck={false}
                      className="resize-none font-mono text-xs"
                    />
                    <div className="rounded-lg border">
                      {bulk.drafts.length === 0 ? (
                        <p className="px-3 py-2 text-sm text-muted-foreground">
                          Nothing to preview yet.
                        </p>
                      ) : (
                        <ul className="divide-y text-sm">
                          {bulk.drafts.slice(0, 4).map((draft, i) => (
                            <li
                              key={i}
                              className="flex items-center justify-between gap-3 px-3 py-1.5"
                            >
                              <span className="min-w-0 truncate">
                                {draft.title || draft.note}
                                {draft.categoryName && (
                                  <span className="text-muted-foreground">
                                    {" · "}
                                    {draft.categoryName}
                                  </span>
                                )}
                              </span>
                              <span
                                className={
                                  draft.type === "income"
                                    ? "shrink-0 tabular-nums text-emerald-600 dark:text-emerald-400"
                                    : "shrink-0 tabular-nums"
                                }
                              >
                                {/* The app's own conversion and formatter, so
                                    the preview groups thousands and places the
                                    sign exactly as the real feed does. The
                                    parser hands back major units; `toMinorUnits`
                                    is the only sanctioned way to cross that
                                    boundary. */}
                                {formatMoney(
                                  signedMinor(
                                    draft.type,
                                    toMinorUnits(draft.amount, DEMO_CURRENCY, DEMO_LOCALE),
                                  ),
                                  DEMO_CURRENCY,
                                  DEMO_LOCALE,
                                  { signed: true },
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <p className="px-0.5 text-xs text-muted-foreground">
                      {bulk.drafts.length} ready
                      {bulk.errors.length > 0 &&
                        ` · ${bulk.errors.length} line${bulk.errors.length === 1 ? "" : "s"} need fixing`}
                      {" — edit the box above and watch it re-parse."}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        );
      })}
    </Tabs>
  );
}

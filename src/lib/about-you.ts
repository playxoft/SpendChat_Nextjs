import { z } from "zod";

/**
 * "About you" — the optional, skippable questions every account is asked once,
 * straight after a new account's currency step and before the product tour
 * (`components/app/about-you-dialog.tsx`). Every answer is a choice from a
 * fixed list: nothing typed, nothing that identifies anyone. They're stored on
 * `users.about` (once — answered or skipped, it never comes back) and read by
 * `pnpm growth:report:*`. "How did you hear about us?" is asked in the
 * same flow but stored where it always was: `users.acquisition.heardFrom`
 * (`lib/attribution.ts`).
 *
 * The Privacy Policy lists these questions — add one there when you add one
 * here.
 */

export const USE_FOR = ["personal", "business", "both"] as const;
export const GOALS = ["track", "budget", "split", "invoices", "save", "other"] as const;
export const USE_WITH = ["solo", "family", "friends", "team"] as const;
export const TRACKING_NOW = ["spreadsheet", "app", "notebook", "bank", "none"] as const;
export const DESCRIBES = ["student", "working", "freelancer", "business_owner", "other"] as const;
export const TEAM_SIZE = ["1", "2-10", "11-50", "50+"] as const;
export const FREQUENCY = ["daily", "few_weekly", "weekly", "monthly"] as const;
export const FEATURES = ["ai", "voice", "budgets", "split", "invoices", "files"] as const;

export type UseFor = (typeof USE_FOR)[number];
export type Goal = (typeof GOALS)[number];
export type Feature = (typeof FEATURES)[number];

/** What the browser sends: any question may be left out (skipped). */
export const aboutYouAnswersSchema = z
  .object({
    useFor: z.enum(USE_FOR).optional(),
    goals: z.array(z.enum(GOALS)).max(GOALS.length).optional(),
    useWith: z.enum(USE_WITH).optional(),
    trackingNow: z.enum(TRACKING_NOW).optional(),
    describes: z.enum(DESCRIBES).optional(),
    teamSize: z.enum(TEAM_SIZE).optional(),
    frequency: z.enum(FREQUENCY).optional(),
    features: z.array(z.enum(FEATURES)).max(FEATURES.length).optional(),
    // (Email preferences aren't asked here: product news is the optional
    // second box on the terms dialog, `users.news_emails_at`.)
  })
  .strict();
export type AboutYouAnswers = z.infer<typeof aboutYouAnswersSchema>;

/**
 * Stored shape of `users.about`: the answers, whether the person went through
 * the questions or skipped them all, and when.
 */
export type AboutYou = AboutYouAnswers & {
  status: "answered" | "skipped";
  at: string;
};

/** Team size only means something for business use. */
export function asksTeamSize(useFor: UseFor | undefined): boolean {
  return useFor === "business" || useFor === "both";
}

/**
 * Tidy a set of answers before storing: duplicates out of the lists, empty
 * lists dropped, and a team size only alongside business use.
 */
export function cleanAboutYou(answers: AboutYouAnswers): AboutYouAnswers {
  const out: AboutYouAnswers = { ...answers };
  for (const key of ["goals", "features"] as const) {
    const list = out[key];
    if (!list) continue;
    const unique = [...new Set(list)];
    if (unique.length) (out as Record<string, unknown>)[key] = unique;
    else delete out[key];
  }
  if (!asksTeamSize(out.useFor)) delete out.teamSize;
  return out;
}

export type Option<T extends string> = { value: T; label: string };

export const ABOUT_OPTIONS = {
  useFor: [
    { value: "personal", label: "Personal" },
    { value: "business", label: "Business" },
    { value: "both", label: "Both" },
  ],
  goals: [
    { value: "track", label: "Track my spending" },
    { value: "budget", label: "Stick to a budget" },
    { value: "split", label: "Split bills with friends" },
    { value: "invoices", label: "Send invoices" },
    { value: "save", label: "Save for something" },
    { value: "other", label: "Something else" },
  ],
  useWith: [
    { value: "solo", label: "Just me" },
    { value: "family", label: "Partner or family" },
    { value: "friends", label: "Friends or roommates" },
    { value: "team", label: "My team" },
  ],
  trackingNow: [
    { value: "spreadsheet", label: "A spreadsheet" },
    { value: "app", label: "Another app" },
    { value: "notebook", label: "Pen and paper" },
    { value: "bank", label: "My bank's app" },
    { value: "none", label: "I don't yet" },
  ],
  describes: [
    { value: "student", label: "Student" },
    { value: "working", label: "Working" },
    { value: "freelancer", label: "Freelancer" },
    { value: "business_owner", label: "Business owner" },
    { value: "other", label: "Something else" },
  ],
  teamSize: [
    { value: "1", label: "Just me" },
    { value: "2-10", label: "2–10" },
    { value: "11-50", label: "11–50" },
    { value: "50+", label: "50+" },
  ],
  frequency: [
    { value: "daily", label: "Every day" },
    { value: "few_weekly", label: "A few times a week" },
    { value: "weekly", label: "Once a week" },
    { value: "monthly", label: "Once a month" },
  ],
  features: [
    { value: "ai", label: "AI entry" },
    { value: "voice", label: "Voice entry" },
    { value: "budgets", label: "Budgets" },
    { value: "split", label: "Split bills" },
    { value: "invoices", label: "Invoices" },
    { value: "files", label: "Receipts & files" },
  ],
} satisfies {
  useFor: Option<UseFor>[];
  goals: Option<Goal>[];
  useWith: Option<(typeof USE_WITH)[number]>[];
  trackingNow: Option<(typeof TRACKING_NOW)[number]>[];
  describes: Option<(typeof DESCRIBES)[number]>[];
  teamSize: Option<(typeof TEAM_SIZE)[number]>[];
  frequency: Option<(typeof FREQUENCY)[number]>[];
  features: Option<Feature>[];
};

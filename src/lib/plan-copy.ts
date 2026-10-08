import { formatFileSize } from "@/lib/attachments";
import {
  budgetsLimitLabel,
  formatPlanStorage,
  formatResetDate,
  nextMonthStartUtc,
  type PlanLimitInfo,
  type UpgradeLimit,
} from "@/lib/plan-limit";
import {
  PERSONAL_PLANS,
  PLAN_LIMITS,
  PLAN_NAMES,
  lowestPlanWith,
  TOPUP,
  TRASH_DAYS,
  VOICE,
  type PersonalPlan,
  type PlanLimits,
} from "@/lib/plans";
import { checkoutCurrency, checkoutPath, trialDaysFor, type CheckoutRefusal } from "@/lib/checkout";
import {
  PAID_PERSONAL_PLANS,
  PERIOD_LABEL,
  STUDENT_DISCOUNT,
  TRIAL_DAYS,
  isCurrency,
  isPaidPersonalPlan,
  pct,
  type Currency,
  type PaidPersonalPlan,
  type Period,
} from "@/lib/pricing";
import type { Faq } from "@/lib/seo";
import { siteConfig } from "@/lib/site";

/**
 * Every word we use to sell a plan — the public pricing page, the in-app
 * upgrade page and the upgrade dialog all read from here, so the three can't
 * tell different stories. Pure and client-safe.
 *
 * The register: lead with the problem the plan removes and what life looks
 * like after, and let the numbers come in as proof, not as the pitch. Plain
 * English — many readers use English as a second language — no guilt, no fake
 * urgency, no exclamation marks. Every number is read from `PLAN_LIMITS` /
 * `pricing.ts`, never typed out, so the copy can't promise what the app
 * doesn't enforce.
 *
 * Plans are bought per workspace, and every paid CTA is a purchase CTA: it
 * links into checkout through `lib/checkout.ts` (`checkoutPath` /
 * `topUpCheckoutPath`), and the words on it come from `PURCHASE` below.
 */

// ── Small formatters ───────────────────────────────────────────────────────

/** "1,000". */
export function count(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

type BooleanFeature = keyof {
  [K in keyof PlanLimits as PlanLimits[K] extends boolean ? K : never]: true;
};

/** "Plus and Pro" — the plans that include a boolean feature, by name. */
export function plansWith(feature: BooleanFeature): string {
  const names = PERSONAL_PLANS.filter((p) => PLAN_LIMITS[p][feature]).map((p) => PLAN_NAMES[p]);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : (names[0] ?? "");
}

/** "Plus or Pro" — the paid plans, by name. */
const paidPlanNames = PAID_PERSONAL_PLANS.map((p) => PLAN_NAMES[p]).join(" or ");

const voiceClipMinutes = VOICE.maxClipMs / 60_000;
const minutes = (n: number) => `${n} ${n === 1 ? "minute" : "minutes"}`;

/**
 * The currency a workspace's prices are shown in: its own, when we sell in it,
 * else US dollars. (A workspace can keep its books in any currency; we only
 * price in six.)
 */
export function pricingCurrencyFor(code: string | null | undefined): Currency {
  return code && isCurrency(code) ? code : "USD";
}

/**
 * The currency the app quotes a workspace's plans in for this request: the
 * one checkout would charge (`checkoutCurrency`), with the workspace's own
 * currency as the preference. So the rupee list shows only to a request from
 * a rupee country (`country` = `requestCountry()`), and the plan cards and the
 * upgrade dialog never quote a price that checkout then changes.
 */
export function workspacePriceCurrency(
  code: string | null | undefined,
  country: string | null | undefined,
): Currency {
  return checkoutCurrency(pricingCurrencyFor(code), country);
}

// ── Plans ──────────────────────────────────────────────────────────────────

export type PlanPitch = {
  /** Who the plan is for, in one line. */
  audience: string;
  /** The problem it removes → what it's like after. The card's headline. */
  headline: string;
  /** Two sentences of the same story, for wider layouts. */
  story: string;
  /** The badge beside the plan's name. */
  people: string;
  /** What the outcome list builds on: "Everything in Free, and". */
  lead: string;
  /** Three to five outcomes. Numbers appear as proof, not as the point. */
  outcomes: string[];
};

const L = PLAN_LIMITS;
const people = (plan: PersonalPlan) => `Up to ${count(L[plan].members)} people`;

export const PLAN_PITCH: Record<PersonalPlan, PlanPitch> = {
  free: {
    audience: "For getting started — on your own, or with a partner.",
    headline: "Know where this month's money went",
    story:
      "Most people can't say where last month's money went. Write it down as it happens, like a message, and the answer is always one look away.",
    people: people("free"),
    lead: "Includes",
    outcomes: [
      "Every expense and income in one feed, with a running balance — no limit on transactions",
      `Write one line about your day and let AI fill in the rows — ${count(L.free.aiActionsPerMonth)} times a month`,
      `Track together with up to ${count(L.free.members)} people, in ${count(L.free.spaces)} spaces`,
      `Keep the receipt with the spend — ${formatPlanStorage(L.free.storageBytes)} of storage`,
      `Export to CSV or PDF any time, and get a deleted entry back for ${TRASH_DAYS} days. Your data is always yours.`,
    ],
  },
  plus: {
    audience: "For families and couples who share the spending.",
    headline: "Your family's money, in one place everyone can see",
    story:
      "In most homes one person knows where the money went, and everyone else finds out at the end of the month. With Plus, everyone adds their own spending and everyone sees the same numbers.",
    people: people("plus"),
    lead: "Everything in Free, and",
    outcomes: [
      `Everyone adds their own spending — room for ${count(L.plus.members)} people`,
      `Home, kids, a side business and the next trip, each kept apart — ${count(L.plus.spaces)} spaces, ${count(L.plus.profilesPerSpace)} profiles in each`,
      "Choose who sees what — keep one profile private, let someone only read another",
      `Stop typing every entry — ${count(L.plus.aiActionsPerMonth)} AI actions a month, and top-ups if you run out`,
      `Bills and warranties kept with the spend, not lost in your gallery — ${formatPlanStorage(L.plus.storageBytes)}, and ${TRASH_DAYS} days to undo a deleted file`,
    ],
  },
  pro: {
    audience: "For freelancers, small businesses and big families with a lot to track.",
    headline: "Stop re-typing receipts at midnight",
    story:
      "When you track for clients, staff and family, the typing never ends. With Pro you say what you spent as it happens, in any mix of languages, and check the rows when you have a minute.",
    people: people("pro"),
    lead: "Everything in Plus, and",
    outcomes: [
      `Say it instead of typing it — voice entry that understands mixed languages, up to ${minutes(voiceClipMinutes)} a clip`,
      `Never run out in the middle of the month — ${count(L.pro.aiActionsPerMonth)} AI actions, and top-ups if you need more`,
      `Room for a team or a joint family — ${count(L.pro.members)} people, ${count(L.pro.spaces)} spaces, ${count(L.pro.profilesPerSpace)} profiles in each`,
      `Years of receipts and invoices, kept — ${formatPlanStorage(L.pro.storageBytes)}`,
      `Sort it your way — ${count(L.pro.categories)} categories and ${count(L.pro.tags)} tags`,
    ],
  },
};

/** The card that gets the lift and the badge, and the shaded table column. */
export const FEATURED_PLAN: PersonalPlan = "pro";
/** Pro has ~3× Plus's AI actions for 1.5× the price — "best value" is arithmetic, not hype. */
export const FEATURED_BADGE = "Best value";

// ── Buying ─────────────────────────────────────────────────────────────────

/** How a buyer can pay in `currency`: UPI only exists for payments in rupees. */
export function paymentMethods(currency: Currency): string {
  return currency === "INR" ? "card or UPI" : "card";
}

/** The words on every buy button and the lines around them. */
export const PURCHASE = {
  /** A paid plan bought from Free — it starts with the trial. */
  trialCta: `Start ${TRIAL_DAYS}-day free trial`,
  topUpCta: `Buy ${count(TOPUP.actions)} AI actions`,
  /** Under a buy button, for the currency on screen. */
  ctaNote: (currency: Currency) => `Pay by ${paymentMethods(currency)}. Cancel any time.`,
  /** Under the plan cards, and on the checkout page. */
  billing: (currency: Currency) =>
    `Billed per workspace. Pay by ${paymentMethods(currency)}. Cancel any time — the plan runs to the end of what you paid for.`,
  keepsEverything: "Your transactions, files and members stay exactly as they are.",
} as const;

/** A paid plan's button: the trial from Free, a straight upgrade from a paid plan. */
export function planCta(plan: PaidPersonalPlan, currentPlan: PersonalPlan = "free"): string {
  return trialDaysFor(currentPlan) > 0 ? PURCHASE.trialCta : `Upgrade to ${PLAN_NAMES[plan]}`;
}

/**
 * The trial line on a paid plan card: shown from Free — and on the public page,
 * where there's no plan yet — but not to a paid workspace looking at a bigger
 * plan, since the trial comes with a workspace's first paid plan only.
 */
export function cardTrialLine(currentPlan?: PersonalPlan): string | null {
  const days = trialDaysFor(currentPlan ?? "free");
  return days > 0 ? `First ${days} days free` : null;
}

/** "21 days free, then ₹1,299 billed yearly" — or just the price when there's no trial. */
export function chargeLine(price: string, period: Period, trialDays: number): string {
  const billed = `${price} ${PERIOD_LABEL[period].billed}`;
  return trialDays > 0 ? `${trialDays} days free, then ${billed}` : `${billed}, starting today`;
}

/** The invoice line the payment provider prints: "SpendChat Pro · 1 year · Workspace: Home". */
export function checkoutDescription(
  item: { kind: "plan"; plan: PaidPersonalPlan; period: Period } | { kind: "topup" },
  workspaceName: string,
): string {
  const what =
    item.kind === "plan"
      ? `${siteConfig.name} ${PLAN_NAMES[item.plan]} · ${PERIOD_LABEL[item.period].toggle}`
      : `${siteConfig.name} AI top-up · ${count(TOPUP.actions)} actions`;
  return `${what} · Workspace: ${workspaceName}`;
}

/** Why checkout can't sell this — shown on the checkout page and returned by the server. */
export function checkoutRefusalMessage(
  reason: CheckoutRefusal,
  current: PersonalPlan,
  wanted?: PersonalPlan,
): string {
  switch (reason) {
    case "samePlan":
      return `This workspace is already on ${PLAN_NAMES[current]}.`;
    case "downgrade":
      return `This workspace is on ${PLAN_NAMES[current]}, which already includes everything in ${PLAN_NAMES[wanted ?? current]}.`;
    case "topUpNeedsPlan":
      return `Top-ups are for ${plansWith("topUps")} workspaces. Upgrade this one first — its monthly AI actions go up too.`;
  }
}

export type PlanChange = { label: string; from?: string; to: string };

/**
 * What a move from `from` to `to` changes the moment it happens — only what
 * goes up, read straight from `PLAN_LIMITS`. Numbers show "3 → 5"; a feature
 * the plan adds shows "Included".
 */
export function planChanges(from: PersonalPlan, to: PersonalPlan): PlanChange[] {
  const a = L[from];
  const b = L[to];
  const out: PlanChange[] = [];
  const num = (label: string, x: number, y: number, fmt: (n: number) => string = count) => {
    if (y > x) out.push({ label, from: fmt(x), to: fmt(y) });
  };
  const flag = (label: string, x: boolean, y: boolean) => {
    if (y && !x) out.push({ label, to: "Included" });
  };
  num("People in the workspace", a.members, b.members);
  num("AI actions a month", a.aiActionsPerMonth, b.aiActionsPerMonth);
  num("Storage", a.storageBytes, b.storageBytes, formatPlanStorage);
  num("Spaces", a.spaces, b.spaces);
  num("Profiles in each space", a.profilesPerSpace, b.profilesPerSpace);
  num("Categories", a.categories, b.categories);
  num("Tags", a.tags, b.tags);
  if (b.budgets.max > a.budgets.max) {
    out.push({ label: "Budgets", from: budgetsLimitLabel(from), to: budgetsLimitLabel(to) });
  }
  flag("Voice entry", a.voice, b.voice);
  flag("Access per profile", a.profileLevelAccess, b.profileLevelAccess);
  flag("AI top-ups", a.topUps, b.topUps);
  flag(`Trash for files (${TRASH_DAYS} days)`, a.fileTrash, b.fileTrash);
  return out;
}

// ── Page heroes ────────────────────────────────────────────────────────────

export const PRICING_HERO = {
  eyebrow: "Pricing",
  title: "Free to start. Pay only when it saves you time.",
  body: "Track every expense and income for free. Upgrade a workspace when the family joins in, the typing piles up, or the receipts outgrow the drawer.",
  perWorkspace: "A plan covers one workspace and everyone in it.",
} as const;

export function upgradeHero(workspaceName: string) {
  return {
    title: `Plans for ${workspaceName}`,
    body: `Plans belong to a workspace, not a person. Everyone in ${workspaceName} shares its plan — the members, the spaces, the AI actions and the storage.`,
  };
}

// ── Limits: the upgrade dialog ─────────────────────────────────────────────

type LimitContext = {
  info: PlanLimitInfo;
  /** The workspace's plan, by name. */
  current: string;
  /** The cap that was hit (from the error, else the plan's own number). */
  max: number;
  now: Date;
};

type UpgradeContext = LimitContext & { next: string; nextLimits: PlanLimits };

type LimitPitchDef = {
  /** The dialog's title: the outcome, not the error. */
  headline: string;
  /** What happened, as plain fact. */
  status: (c: LimitContext) => string;
  /** What the plan that lifts the limit changes, in one line. */
  pitch: (c: UpgradeContext) => string;
  /** The cap for this limit on `plan`, when the error didn't say. */
  cap?: (plan: PersonalPlan) => number;
};

export const LIMIT_PITCH: Record<UpgradeLimit, LimitPitchDef> = {
  aiActions: {
    headline: "Don't go back to typing every entry",
    cap: (p) => L[p].aiActionsPerMonth,
    status: ({ max, now }) =>
      `This workspace has used all ${count(max)} AI actions for this month. They come back on ${formatResetDate(nextMonthStartUtc(now))}, and typing entries by hand works as always.`,
    pitch: ({ next, nextLimits }) =>
      `${next} gives the workspace ${count(nextLimits.aiActionsPerMonth)} a month, so the AI keeps doing the typing until the month is over.`,
  },
  voice: {
    headline: "Say it instead of typing it",
    status: () =>
      "Voice entry isn't part of this workspace's plan. You can still type or paste a note for the AI.",
    pitch: ({ next }) =>
      `With ${next}, hold M and say what you spent — in English, Hindi, Tamil or a mix — and check the rows it writes. Clips can be up to ${minutes(voiceClipMinutes)}.`,
  },
  members: {
    headline: "Bring everyone who spends into one place",
    cap: (p) => L[p].members,
    status: ({ max }) =>
      `This workspace has room for ${count(max)} people, and every place is taken. Pending invites count too.`,
    pitch: ({ next, nextLimits }) =>
      `${next} has room for ${count(nextLimits.members)}, so the person who paid adds it themselves — no more "tell me later".`,
  },
  spaces: {
    headline: "Keep home, work and trips apart",
    cap: (p) => L[p].spaces,
    status: ({ max }) => `This workspace has ${count(max)} spaces, and they're all in use.`,
    pitch: ({ next, nextLimits }) =>
      `${next} gives you ${count(nextLimits.spaces)}, so the side business never gets mixed up with the groceries.`,
  },
  profilesPerSpace: {
    headline: "Give everyone their own profile",
    cap: (p) => L[p].profilesPerSpace,
    status: ({ max, current }) =>
      `On ${current}, each space holds ${count(max)} profiles, and this one is full. You can put the new profile in another space.`,
    pitch: ({ next, nextLimits }) =>
      `${next} allows ${count(nextLimits.profilesPerSpace)} in each space, so every person, card or project gets its own.`,
  },
  categories: {
    headline: "Sort spending the way you think about it",
    cap: (p) => L[p].categories,
    status: ({ max }) =>
      `This workspace has ${count(max)} categories, counting the starter ones. Deleting one you don't use frees a place.`,
    pitch: ({ next, nextLimits }) =>
      `${next} gives you ${count(nextLimits.categories)}, so nothing important hides in a catch-all.`,
  },
  tags: {
    headline: "Tag it once, find it in seconds",
    cap: (p) => L[p].tags,
    status: ({ max }) =>
      `This workspace has ${count(max)} tags. Deleting one you don't use frees a place.`,
    pitch: ({ next, nextLimits }) =>
      `${next} gives you ${count(nextLimits.tags)} — enough for every trip, client and tax claim.`,
  },
  budgets: {
    headline: "See it coming before the month runs out",
    cap: (p) => L[p].budgets.max,
    status: ({ max }) =>
      `This workspace has ${count(max)} budgets, and they're all in use. Deleting one you don't need frees a place.`,
    pitch: ({ next, nextLimits }) =>
      nextLimits.budgets.displayUnlimited
        ? `${next} takes the limit off, so every category that matters gets its own budget and its own alert.`
        : `${next} gives you ${count(nextLimits.budgets.max)}, so every category that matters gets its own budget and its own alert.`,
  },
  storage: {
    headline: "Keep every receipt where you can find it",
    cap: (p) => L[p].storageBytes,
    status: ({ max, info }) =>
      info.used !== undefined
        ? `This workspace's ${formatPlanStorage(max)} is full (${formatFileSize(Math.min(info.used, max))} used), so this file doesn't fit.`
        : `This workspace's ${formatPlanStorage(max)} is full, so this file doesn't fit.`,
    pitch: ({ next, nextLimits }) =>
      `${next} has ${formatPlanStorage(nextLimits.storageBytes)}, so bills and warranties stay with the spend instead of in your gallery.`,
  },
  profileLevelAccess: {
    headline: "Share the money, not every detail",
    status: ({ current }) =>
      `On ${current}, people get access to a whole space at a time.`,
    pitch: ({ next }) =>
      `${next} lets you set it for each profile — your accountant reads only the business, and a personal profile stays private.`,
  },
  // This workspace is an extra free one, so it's view-only.
  freeWorkspaces: {
    headline: "Give this workspace its own plan",
    status: () =>
      "Everyone gets one free workspace. This one is extra, so it's view-only for now — nothing in it is deleted.",
    pitch: ({ next }) =>
      `With ${next}, it works like your first one: add, edit and invite.`,
  },
  // Client-only: the trash's Files tab on a plan without a file trash.
  fileTrash: {
    headline: "Get a deleted file back",
    status: ({ current }) =>
      `On ${current}, deleting a file or folder is final. Deleted transactions still go to the trash for ${TRASH_DAYS} days.`,
    pitch: ({ next }) =>
      `${next} keeps deleted files and folders in the trash for ${TRASH_DAYS} days, so one wrong click never costs you a contract or a warranty.`,
  },
  // "New workspace", when the person already has their free one.
  newWorkspace: {
    headline: "Make room for another workspace",
    status: () =>
      `You already have a free workspace — each extra workspace needs its own ${paidPlanNames} plan.`,
    pitch: ({ next, info }) =>
      info.freeSlotHere
        ? `Upgrade this workspace to ${next} and your free place opens up, so the new workspace can start on Free.`
        : (info.freeOwned ?? 1) > 1
          ? `You have ${info.freeOwned} free workspaces and only one can stay free — move the others to ${next} to make room for a new one.`
          : `Upgrade your free workspace to ${next} and the new one can start on Free.`,
  },
};

export type LimitPitch = {
  headline: string;
  status: string;
  /** null when no plan lifts the limit — the dialog offers "Contact us". */
  pitch: string | null;
  upgradeTo: PersonalPlan | null;
};

/** The upgrade dialog's words for a plan-limit failure. */
export function limitPitch(info: PlanLimitInfo, now: Date = new Date()): LimitPitch {
  const def = LIMIT_PITCH[info.limit];
  const ctx: LimitContext = {
    info,
    current: PLAN_NAMES[info.plan],
    max: info.max ?? def.cap?.(info.plan) ?? 0,
    now,
  };
  const target = info.upgradeTo;
  return {
    headline: def.headline,
    status: def.status(ctx),
    pitch: target
      ? def.pitch({ ...ctx, next: PLAN_NAMES[target], nextLimits: L[target] })
      : null,
    upgradeTo: target,
  };
}

export type UpgradeAction = {
  /** Where the dialog's upgrade button goes. */
  href: string;
  label: string;
  /** Trial days the upgrade comes with, for the dialog's price line. */
  trialDays: number;
};

/**
 * The upgrade dialog's button for a limit that a plan lifts. A limit on this
 * workspace goes straight to checkout for `upgradeTo`. The one-free-workspace
 * rule is different: a view-only workspace (`freeWorkspaces`) may not be the
 * one open, so it goes to the plans page; "New workspace" (`newWorkspace`) is
 * lifted by upgrading the person's free workspace — the plans page when that's
 * this one, organisation settings (every workspace, each with Open) when it's
 * another. That free workspace is what gets the trial, even from a paid one.
 */
export function upgradeAction(info: PlanLimitInfo): UpgradeAction {
  const target = info.upgradeTo;
  const label = target ? `Upgrade to ${PLAN_NAMES[target]}` : "Upgrade";
  if (info.limit === "newWorkspace") {
    const trialDays = trialDaysFor("free");
    return info.freeSlotHere
      ? { href: "/app/upgrade", label, trialDays }
      : { href: "/app/settings/organization", label: "Upgrade your free workspace", trialDays };
  }
  const trialDays = trialDaysFor(info.plan);
  if (info.limit === "freeWorkspaces" || !target || !isPaidPersonalPlan(target)) {
    return { href: "/app/upgrade", label, trialDays };
  }
  return { href: checkoutPath({ plan: target, period: "yearly" }), label, trialDays };
}

/** What the dialog says when no plan lifts the limit. */
export const BIGGEST_PLAN_LINE =
  "This workspace is already on our biggest plan. Write to us and we'll work out what you need.";

/** The reassurance every limit message ends on. */
export const NOTHING_DELETED_LINE =
  "Nothing you already have is affected — a limit only stops adding new things.";

// ── FAQ ────────────────────────────────────────────────────────────────────

/**
 * The pricing questions, shared by `/pricing` (which also marks them up as
 * `FAQPage`) and the in-app `/app/upgrade`. `selfHost` adds the open-source
 * question, which only the public page needs.
 */
export function pricingFaqs({ selfHost = false }: { selfHost?: boolean } = {}): Faq[] {
  const faqs: Faq[] = [
    {
      q: "How does billing work?",
      a: `You buy a plan for a workspace, from Plans in the app. Pay every month, every 3 months or once a year, by card — or UPI when you pay in rupees. A workspace's first paid plan starts with a ${TRIAL_DAYS}-day free trial. Upgrading keeps every transaction, file and member the workspace already has. Cancel or move to a smaller plan any time: the change takes effect at renewal, the plan runs to the end of what you paid for, and nothing is ever deleted.`,
    },
    {
      q: "Is a plan for me, or for a workspace?",
      a: "For a workspace. Everyone in it shares the plan: its members, spaces, AI actions and storage. If you're in two workspaces, each has its own plan. Your first workspace is free; each extra workspace needs Plus or Pro, and until then it's view-only.",
    },
    {
      q: "What happens when we reach a limit?",
      a: "Nothing is deleted and nothing is locked away. You just can't add more of that one thing — another member, space or file — until you upgrade or make room. Transactions are unlimited on every plan.",
    },
    {
      q: "What counts as an AI action?",
      a: `One note or receipt that the AI turns into transactions. A voice clip uses one per started minute, up to ${minutes(voiceClipMinutes)} a clip. The allowance is shared by the whole workspace and comes back on the 1st of each month. Typing or bulk-adding entries yourself never uses one. On ${plansWith("topUps")}, a top-up adds ${count(TOPUP.actions)} more, valid for ${TOPUP.validityMonths} months.`,
    },
    {
      q: "How does the free trial work?",
      a: `A workspace's first paid plan starts with ${TRIAL_DAYS} days free, with everything in that plan. You add a way to pay to start it, and if you cancel before the trial ends you pay nothing. Each workspace gets one trial.`,
    },
    {
      q: "Is there a student discount?",
      a: `Yes — ${pct(STUDENT_DISCOUNT)} off Plus and Pro. We check it by hand: email ${siteConfig.supportEmail} from your college email, or with a photo of your student ID.`,
    },
    {
      q: "I already use SpendChat for free. What changes?",
      a: "Your workspace is on Free. If it already has more than Free allows — say, four members — you keep all of it. You just can't add more of that thing until you upgrade or tidy up.",
    },
    {
      q: "What happens when I delete something?",
      a: `It goes to the trash and waits there for ${TRASH_DAYS} days — restore it any time before then, or press Undo right after you delete. Transactions go to the trash on every plan. On ${PLAN_NAMES[lowestPlanWith("fileTrash")]} and up, files and folders do too; on Free, deleting a file is final, and the app says so before you confirm. Files in the trash still count toward your storage until you empty it.`,
    },
    {
      q: "Can I take my data with me?",
      a: "Always. CSV and PDF export are on every plan and will never be a paid feature. If a paid plan ends, the workspace goes back to Free and keeps everything in it.",
    },
  ];
  if (selfHost) {
    faqs.push({
      q: "Is self-hosting still free?",
      a: `Yes. ${siteConfig.name} is open source under ${siteConfig.license}. Run every feature on your own server, with your own AI keys, at no cost.`,
    });
  }
  return faqs;
}

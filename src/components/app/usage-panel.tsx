"use client";

import { Mic, MicOff } from "lucide-react";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatFileSize } from "@/lib/attachments";
import { PLAN_NAMES, lowestPlanWith, type PersonalPlan } from "@/lib/plans";
import {
  formatPlanStorage,
  formatResetDate,
  meterState,
  nextPlanFor,
  nextPlanForBudgets,
  type NumericPlanLimit,
  type PlanLimitInfo,
  type PlanLimitKey,
} from "@/lib/plan-limit";
import { cn } from "@/lib/utils";
import { PlanBadge } from "./plan-badge";
import { usePlan } from "./upgrade-dialog";

/**
 * The workspace's plan and how much of it is used — every member sees it,
 * since the limits are shared. Data is `getUsage(workspaceId)`, read on the
 * server and passed in (this component never fetches).
 *
 * Over a limit is never framed as a threat: a downgraded workspace keeps
 * everything, and only adding more is blocked.
 */

type Meter = { used: number; limit: number };

/** The shape `getUsage` returns (kept structural — entitlements are server-only). */
export type UsageData = {
  plan: PersonalPlan;
  readOnly: boolean;
  /** Why it's view-only; optional so older callers fit. */
  readOnlyReason?: "extra_free" | "payment_failed" | "dispute" | null;
  ai: {
    used: number;
    limit: number;
    remaining: number;
    resetsAt: string;
    /** Top-up actions left (C4), and when the soonest expires. Optional so older callers fit. */
    topUpRemaining?: number;
    topUpExpiresAt?: string | null;
  };
  storage: { usedBytes: number; limitBytes: number };
  members: Meter;
  spaces: Meter;
  categories: Meter;
  tags: Meter;
  /** Optional so older callers fit; `unlimited` shows "Unlimited" (Pro). */
  budgets?: Meter & { unlimited: boolean };
  profilesPerSpace: number;
  voice: boolean;
};

const BAR_CLASS = {
  ok: "bg-primary",
  warn: "bg-amber-500",
  full: "bg-destructive",
} as const;

export function UsagePanel({ usage }: { usage: UsageData }) {
  const { showUpgrade } = usePlan();
  const plan = usage.plan;

  function upgradeInfo(limit: PlanLimitKey, key: NumericPlanLimit, m: Meter): PlanLimitInfo {
    return { limit, plan, max: m.limit, used: m.used, upgradeTo: nextPlanFor(plan, key) };
  }

  const resets = formatResetDate(usage.ai.resetsAt);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plan & usage</CardTitle>
        <CardDescription>
          Shared by everyone in this workspace. Limits only stop adding new things — nothing you
          have is ever removed.
        </CardDescription>
        <CardAction>
          <PlanBadge plan={plan} className="h-5 px-2 text-xs" />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-5">
        {usage.readOnly && (
          <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            {usage.readOnlyReason === "dispute"
              ? "This workspace is view-only while a disputed payment is sorted out — contact support. Everything in it is still here to browse and export."
              : usage.readOnlyReason === "payment_failed"
                ? "This workspace is view-only because its plan's payment didn't go through — update the payment method in Settings → Billing. Everything in it is still here."
                : "This workspace is view-only — you can have one free workspace. Everything in it is still here to browse and export."}
          </p>
        )}

        <UsageMeter
          label="AI actions this month"
          used={usage.ai.used}
          limit={usage.ai.limit}
          display={`${usage.ai.used.toLocaleString("en-US")} of ${usage.ai.limit.toLocaleString("en-US")}`}
          note={`${usage.ai.remaining.toLocaleString("en-US")} left · refills on ${resets}${
            (usage.ai.topUpRemaining ?? 0) > 0
              ? ` · plus ${usage.ai.topUpRemaining!.toLocaleString("en-US")} top-up actions${
                  usage.ai.topUpExpiresAt ? ` (the first expire ${formatResetDate(usage.ai.topUpExpiresAt)})` : ""
                }`
              : ""
          }`}
          onUpgrade={() =>
            showUpgrade({
              limit: "aiActions",
              plan,
              max: usage.ai.limit,
              used: usage.ai.used,
              upgradeTo: nextPlanFor(plan, "aiActionsPerMonth"),
            })
          }
        />
        <UsageMeter
          label="Storage"
          used={usage.storage.usedBytes}
          limit={usage.storage.limitBytes}
          display={`${formatFileSize(usage.storage.usedBytes)} of ${formatPlanStorage(usage.storage.limitBytes)}`}
          note="Files and receipts"
          onUpgrade={() =>
            showUpgrade({
              limit: "storage",
              plan,
              max: usage.storage.limitBytes,
              used: usage.storage.usedBytes,
              upgradeTo: nextPlanFor(plan, "storageBytes"),
            })
          }
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <UsageMeter
            label="Members"
            used={usage.members.used}
            limit={usage.members.limit}
            note="Pending invites count too"
            onUpgrade={() => showUpgrade(upgradeInfo("members", "members", usage.members))}
          />
          <UsageMeter
            label="Spaces"
            used={usage.spaces.used}
            limit={usage.spaces.limit}
            note={`Up to ${usage.profilesPerSpace} profiles in each`}
            onUpgrade={() => showUpgrade(upgradeInfo("spaces", "spaces", usage.spaces))}
          />
          <UsageMeter
            label="Categories"
            used={usage.categories.used}
            limit={usage.categories.limit}
            onUpgrade={() =>
              showUpgrade(upgradeInfo("categories", "categories", usage.categories))
            }
          />
          <UsageMeter
            label="Tags"
            used={usage.tags.used}
            limit={usage.tags.limit}
            onUpgrade={() => showUpgrade(upgradeInfo("tags", "tags", usage.tags))}
          />
          {usage.budgets && (
            <UsageMeter
              label="Budgets"
              used={usage.budgets.used}
              limit={usage.budgets.limit}
              display={
                usage.budgets.unlimited
                  ? `${usage.budgets.used.toLocaleString("en-US")} · Unlimited`
                  : undefined
              }
              note="Monthly, with alerts at 80% and 100%"
              onUpgrade={() =>
                showUpgrade({
                  limit: "budgets",
                  plan,
                  max: usage.budgets!.limit,
                  used: usage.budgets!.used,
                  upgradeTo: nextPlanForBudgets(plan),
                })
              }
            />
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t pt-4 text-sm">
          <span className="flex items-center gap-2">
            {usage.voice ? (
              <Mic aria-hidden className="size-4 text-muted-foreground" />
            ) : (
              <MicOff aria-hidden className="size-4 text-muted-foreground" />
            )}
            Voice entry
          </span>
          {usage.voice ? (
            <span className="text-muted-foreground">On</span>
          ) : (
            <button
              type="button"
              className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
              onClick={() =>
                showUpgrade({ limit: "voice", plan, upgradeTo: lowestPlanWith("voice") })
              }
            >
              On {PLAN_NAMES[lowestPlanWith("voice")]} only
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function UsageMeter({
  label,
  used,
  limit,
  display,
  note,
  onUpgrade,
}: {
  label: string;
  used: number;
  limit: number;
  /** "120 MB of 1 GB" — defaults to "used of limit". */
  display?: string;
  note?: string;
  onUpgrade: () => void;
}) {
  const state = meterState(used, limit);
  const shown = display ?? `${used.toLocaleString("en-US")} of ${limit.toLocaleString("en-US")}`;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground tabular-nums">{shown}</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={state.percent}
        aria-valuetext={shown}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn("h-full rounded-full transition-[width]", BAR_CLASS[state.tone])}
          style={{ width: `${state.percent}%` }}
        />
      </div>
      {state.over ? (
        <p className="text-xs text-muted-foreground">
          Over your plan&apos;s limit — you can keep what you have, but can&apos;t add more.{" "}
          <UpgradeLink onClick={onUpgrade} />
        </p>
      ) : state.full ? (
        <p className="text-xs text-muted-foreground">
          At your plan&apos;s limit — you can&apos;t add more. <UpgradeLink onClick={onUpgrade} />
        </p>
      ) : note ? (
        <p className="text-xs text-muted-foreground">{note}</p>
      ) : null}
    </div>
  );
}

function UpgradeLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="underline underline-offset-2 hover:text-foreground"
    >
      See what&apos;s included
    </button>
  );
}

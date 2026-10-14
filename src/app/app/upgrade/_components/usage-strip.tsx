import { formatFileSize } from "@/lib/attachments";
import { formatPlanStorage, formatResetDate, meterState } from "@/lib/plan-limit";
import { count } from "@/lib/plan-copy";
import { cn } from "@/lib/utils";

/** The slice of `getUsage()` the strip shows (structural — entitlements are server-only). */
export type UsageStripData = {
  ai: { used: number; limit: number; resetsAt: string; topUpRemaining: number };
  storage: { usedBytes: number; limitBytes: number };
  members: { used: number; limit: number };
  spaces: { used: number; limit: number };
  categories: { used: number; limit: number };
  tags: { used: number; limit: number };
};

const BAR = { ok: "bg-primary", warn: "bg-amber-500", full: "bg-destructive" } as const;

/**
 * How much of the plan this workspace is using, in one compact row — so the
 * plans below read against real numbers ("we're at 48 of 50 AI actions").
 * The full, actionable version is the usage card in Settings → Workspace.
 */
export function UsageStrip({ usage }: { usage: UsageStripData }) {
  const items = [
    {
      label: "AI actions",
      used: usage.ai.used,
      limit: usage.ai.limit,
      value: `${count(usage.ai.used)} / ${count(usage.ai.limit)}`,
      note:
        usage.ai.topUpRemaining > 0
          ? `Back on ${formatResetDate(usage.ai.resetsAt)} · +${count(usage.ai.topUpRemaining)} top-up`
          : `Back on ${formatResetDate(usage.ai.resetsAt)}`,
    },
    {
      label: "Storage",
      used: usage.storage.usedBytes,
      limit: usage.storage.limitBytes,
      value: `${formatFileSize(usage.storage.usedBytes)} / ${formatPlanStorage(usage.storage.limitBytes)}`,
    },
    { label: "Members", ...pair(usage.members), note: "Invites count too" },
    { label: "Spaces", ...pair(usage.spaces) },
    { label: "Categories", ...pair(usage.categories) },
    { label: "Tags", ...pair(usage.tags) },
  ];

  return (
    <section aria-labelledby="usage-heading" className="rounded-2xl border bg-card p-4 sm:p-5">
      <h2 id="usage-heading" className="text-sm font-medium">
        What this workspace is using
      </h2>
      <ul className="mt-3 grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
        {items.map((m) => {
          const state = meterState(m.used, m.limit);
          return (
            <li key={m.label} className="min-w-0 space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-xs text-muted-foreground">{m.label}</span>
                {state.full ? (
                  <span className="text-[11px] font-medium text-destructive">Full</span>
                ) : null}
              </div>
              <p className="truncate text-sm font-medium tabular-nums">{m.value}</p>
              <div
                role="progressbar"
                aria-label={m.label}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={state.percent}
                className="h-1.5 overflow-hidden rounded-full bg-muted"
              >
                <div className={cn("h-full rounded-full", BAR[state.tone])} style={{ width: `${state.percent}%` }} />
              </div>
              {m.note ? <p className="truncate text-[11px] text-muted-foreground">{m.note}</p> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function pair(m: { used: number; limit: number }) {
  return { used: m.used, limit: m.limit, value: `${count(m.used)} / ${count(m.limit)}` };
}

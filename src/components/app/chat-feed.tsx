import { MessageSquarePlus } from "lucide-react";
import { DayDivider } from "./day-divider";
import { TransactionItem } from "./transaction-item";
import { dayDividerLabel } from "@/lib/dates";
import type { Category, Profile } from "@/db/schema";
import type { TransactionRow } from "@/lib/queries";

function timeLabel(value: Date | string, locale: string, timeZone: string): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

export function ChatFeed({
  rows,
  currency,
  locale,
  timeZone,
  today,
  categories,
  profiles = [],
}: {
  rows: TransactionRow[];
  currency: string;
  locale: string;
  timeZone: string;
  today: string;
  categories: Pick<Category, "id" | "name" | "kind" | "icon">[];
  profiles?: Pick<Profile, "id" | "name" | "icon">[];
}) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <MessageSquarePlus className="size-6 text-muted-foreground" />
        </div>
        <h2 className="mt-4 font-medium">No transactions yet</h2>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
          Add your first one below — type an amount, pick a category, and send.
        </p>
      </div>
    );
  }

  // rows are oldest-first; group consecutively by date.
  const groups: { date: string; items: TransactionRow[] }[] = [];
  for (const r of rows) {
    const last = groups[groups.length - 1];
    if (last && last.date === r.occurredOn) last.items.push(r);
    else groups.push({ date: r.occurredOn, items: [r] });
  }

  return (
    <div className="space-y-1">
      {groups.map((g) => (
        <div key={g.date}>
          <DayDivider label={dayDividerLabel(g.date, today, locale)} />
          <div className="space-y-2">
            {g.items.map((r) => (
              <TransactionItem
                key={r.id}
                row={r}
                currency={currency}
                locale={locale}
                categories={categories}
                profiles={profiles}
                today={today}
                timeLabel={timeLabel(r.createdAt, locale, timeZone)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { endOfMonth, startOfMonth, subMonths } from "date-fns";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseISODate, toISODate } from "@/lib/dates";
import type { Profile } from "@/db/schema";

const RANGES = [
  { key: "1", label: "This month", months: 1 },
  { key: "3", label: "3 months", months: 3 },
  { key: "6", label: "6 months", months: 6 },
  { key: "12", label: "12 months", months: 12 },
  { key: "all", label: "All time", months: 0 },
] as const;

export function AnalyticsFilters({
  profiles = [],
  today,
}: {
  profiles?: Pick<Profile, "id" | "name" | "icon">[];
  today: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const profile = sp.get("profile") ?? "all";
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";

  function update(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function applyRange(months: number) {
    if (months === 0) {
      update({ from: undefined, to: undefined });
      return;
    }
    const end = parseISODate(today);
    const startMonth = startOfMonth(subMonths(end, months - 1));
    update({
      from: toISODate(startMonth),
      to: toISODate(months === 1 ? endOfMonth(end) : end),
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      {profiles.length > 0 && (
        <Select
          value={profile}
          onValueChange={(v) => update({ profile: v === "all" ? undefined : v })}
        >
          <SelectTrigger className="w-36" aria-label="Profile">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All profiles</SelectItem>
            {profiles.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.icon ? `${p.icon} ` : ""}
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
        {RANGES.map((r) => (
          <Button
            key={r.key}
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => applyRange(r.months)}
          >
            {r.label}
          </Button>
        ))}
      </div>

      <DatePicker
        value={from}
        max={to || today}
        placeholder="From"
        onChange={(iso) => update({ from: iso || undefined })}
        className="w-[9.5rem]"
      />
      <DatePicker
        value={to}
        min={from || undefined}
        max={today}
        placeholder="To"
        onChange={(iso) => update({ to: iso || undefined })}
        className="w-[9.5rem]"
      />
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DateRangeFilter } from "@/components/app/date-range-filter";
import { TypeFilterOptions } from "@/components/app/type-filter-options";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TagSelect } from "@/components/app/tags/tag-select";
import type { Category } from "@/db/schema";
import type { TxnTagDTO } from "@/lib/tags";

export function TransactionFilters({
  categories,
  tags,
  today,
  locale,
}: {
  categories: Pick<Category, "id" | "name" | "kind" | "icon">[];
  /** The workspace's tags, for the tag filter. */
  tags: TxnTagDTO[];
  today: string;
  locale: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const type = sp.get("type") ?? "all";
  const category = sp.get("category") ?? "all";
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  const qParam = sp.get("q") ?? "";
  // `?tags=` is one comma-joined value, not a repeatable key — see `parseTagIds`
  // in `lib/filters.ts` for why. Ids are kept only while they name a tag that
  // still exists, so a deleted tag drops out of the control instead of sitting
  // there as a chip nothing can render; the next change writes the URL clean.
  const knownTagIds = new Set(tags.map((t) => t.id));
  const tagIds = (sp.get("tags") ?? "").split(",").filter((id) => knownTagIds.has(id));

  const [q, setQ] = useState(qParam);

  function update(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  // Debounced search.
  useEffect(() => {
    const t = setTimeout(() => {
      if (q !== qParam) update({ q: q || undefined });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const hasFilters =
    type !== "all" ||
    category !== "all" ||
    !!from ||
    !!to ||
    !!qParam ||
    tagIds.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      {/* Search leads the row: it's the one control you reach for by name
          rather than by browsing, and the filters after it narrow what it
          searched. */}
      <div className="relative">
        <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          data-shortcut-search
          placeholder="Search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-44 pl-8"
          aria-label="Search transactions"
        />
      </div>
      <DateRangeFilter
        from={from}
        to={to}
        today={today}
        locale={locale}
        onChange={update}
      />
      <Select value={type} onValueChange={(v) => update({ type: v === "all" ? undefined : v })}>
        <SelectTrigger className="w-32" aria-label="Type">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <TypeFilterOptions />
        </SelectContent>
      </Select>
      <Select
        value={category}
        onValueChange={(v) => update({ category: v === "all" ? undefined : v })}
      >
        <SelectTrigger className="w-44" aria-label="Category">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          {categories.map((c) => (
            <SelectItem
              key={c.id}
              value={c.id}
              className={
                c.kind === "income"
                  ? "text-emerald-600 focus:text-emerald-600 dark:text-emerald-400 dark:focus:text-emerald-400"
                  : "text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
              }
            >
              {c.icon ? `${c.icon} ` : ""}
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {/* Multi-value, so a popover of chips rather than a `Select`. Matching
          ANY of the picked tags is the filter's meaning — see the plan's
          decision; "all of them" would need a second control to choose between
          the two, and nobody asked for it. */}
      <TagSelect
        tags={tags}
        value={tagIds}
        onChange={(ids) => update({ tags: ids.length ? ids.join(",") : undefined })}
        placeholder="All tags"
        className="w-44"
      />
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-9"
          onClick={() => {
            setQ("");
            router.push(pathname);
          }}
        >
          <X className="size-4" /> Clear
        </Button>
      )}
    </div>
  );
}

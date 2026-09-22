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
import { parseTagIds } from "@/lib/filters";
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
  // in `lib/filters.ts` for why. Parsed with the server's own function so the
  // control can't disagree with what is actually filtering.
  const tagsParam = sp.get("tags") ?? "";

  // The tag selection is held locally, because it is the one filter you set
  // several times in a row without the menu closing. Deriving it from
  // `useSearchParams()` made the control lag a whole round-trip: the second
  // tick was computed from a selection that hadn't updated yet and replaced
  // the first instead of adding to it.
  //
  // Local state alone isn't enough either — the URL has to be able to win,
  // for Back, Clear and links. The rule below is "adopt a URL we didn't ask
  // for". Without that test, our own push arriving is indistinguishable from
  // an external change, and re-seeding from it undoes anything picked while
  // it was in flight. `pushedTags` is state rather than a ref because this
  // decision happens during render, and a ref read there is both barred by the
  // lint rule and genuinely unreliable.
  const [tagIds, setTagIds] = useState<string[]>(() => parseTagIds(tagsParam) ?? []);
  const [seenTagsParam, setSeenTagsParam] = useState(tagsParam);
  const [pushedTags, setPushedTags] = useState<string | null>(null);
  if (tagsParam !== seenTagsParam) {
    setSeenTagsParam(tagsParam);
    if (pushedTags === tagsParam) {
      // Our own push landing. The control is already showing it.
      setPushedTags(null);
    } else if (pushedTags === null) {
      setTagIds(parseTagIds(tagsParam) ?? []);
    }
    // Otherwise an earlier push is landing while a newer one is still on its
    // way — adopting it would undo a pick the user has already made.
  }
  // Only ids that still name a tag can be rendered as chips; the rest are left
  // in `tagIds` so the URL isn't rewritten behind the user's back.
  const knownTagIds = new Set(tags.map((t) => t.id));
  const resolvedTagIds = tagIds.filter((id) => knownTagIds.has(id));

  const [q, setQ] = useState(qParam);

  function update(next: Record<string, string | undefined>) {
    // Read the live URL, not the `sp` captured at render. An App Router
    // navigation runs inside a transition, so `useSearchParams()` keeps
    // returning the old value until the new RSC payload commits — on this
    // dynamic, DB-backed page that is a round-trip. Rebuilding from the stale
    // snapshot means two changes made inside that window each drop the other:
    // pick a tag, then let the 400ms search debounce fire, and the tag is gone.
    const params = new URLSearchParams(window.location.search);
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

  // The selection reaches the URL on a short debounce, like the search box, so
  // ticking three tags is one navigation instead of three — the list still
  // updates while the menu is open, just once the picking pauses. The live URL
  // is re-read at fire time so a Clear that already happened isn't pushed over.
  const tagsJoined = tagIds.join(",");
  useEffect(() => {
    const t = setTimeout(() => {
      const live = new URLSearchParams(window.location.search).get("tags") ?? "";
      if (live === tagsJoined) return;
      setPushedTags(tagsJoined);
      update({ tags: tagsJoined || undefined });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagsJoined]);

  const hasFilters =
    type !== "all" ||
    category !== "all" ||
    !!from ||
    !!to ||
    !!qParam ||
    // The raw parameter, not the resolved list: filtering by a tag that has
    // since been deleted matches nothing, and if Clear were hidden there the
    // page would sit on "No transactions match these filters" with every
    // control looking unset and no way out but editing the URL.
    !!tagsParam;

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
        value={resolvedTagIds}
        onChange={setTagIds}
        placeholder="All tags"
        triggerAriaLabel="Tags"
        className="w-44"
      />
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-9"
          onClick={() => {
            setQ("");
            setTagIds([]);
            setPushedTags("");
            router.push(pathname);
          }}
        >
          <X className="size-4" /> Clear
        </Button>
      )}
    </div>
  );
}

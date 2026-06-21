"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Category } from "@/db/schema";

export function TransactionFilters({
  categories,
}: {
  categories: Pick<Category, "id" | "name" | "kind" | "icon">[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const type = sp.get("type") ?? "all";
  const category = sp.get("category") ?? "all";
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  const qParam = sp.get("q") ?? "";

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
    type !== "all" || category !== "all" || !!from || !!to || !!qParam;

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <DatePicker
        value={from}
        max={to || undefined}
        placeholder="From"
        onChange={(iso) => update({ from: iso || undefined })}
        className="w-[9.5rem]"
      />
      <DatePicker
        value={to}
        min={from || undefined}
        placeholder="To"
        onChange={(iso) => update({ to: iso || undefined })}
        className="w-[9.5rem]"
      />
      <Select value={type} onValueChange={(v) => update({ type: v === "all" ? undefined : v })}>
        <SelectTrigger className="w-32" aria-label="Type">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All types</SelectItem>
          <SelectItem value="income">Income</SelectItem>
          <SelectItem value="expense">Expense</SelectItem>
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
            <SelectItem key={c.id} value={c.id}>
              {c.icon ? `${c.icon} ` : ""}
              {c.name}
              {c.kind === "income" ? " · in" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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

"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { ToolCardGrid } from "@/components/tools/tool-card";
import type { Tool } from "@/lib/tools";

export type ToolGroupWithItems = { id: string; label: string; blurb: string; items: Tool[] };

/** Everything a tool can be found by, lowercased once. */
function haystack(tool: Tool, groupLabel: string): string {
  return [tool.label, tool.h1, tool.blurb, tool.description, groupLabel, ...(tool.keywords ?? [])]
    .join(" ")
    .toLowerCase();
}

/**
 * Tools that match every word of the query, in hub order. Every word has to
 * match somewhere, so "gst invoice" narrows to the invoice generator rather
 * than widening to anything that mentions either word.
 */
function search(groups: ToolGroupWithItems[], query: string): Tool[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return groups.flatMap((g) =>
    g.items.filter((t) => {
      const text = haystack(t, g.label);
      return words.every((w) => text.includes(w));
    }),
  );
}

/**
 * The `/tools` hub's directory: a search box over the grouped tool cards.
 *
 * With the box empty it renders the full grouped list — which is also what the
 * static HTML holds, so every card link is there for crawlers. Typing swaps the
 * groups for one flat list of matches. "/" focuses the box from anywhere on the
 * page, like most sites with search.
 */
export function ToolsDirectory({ groups }: { groups: ToolGroupWithItems[] }) {
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const trimmed = query.trim();
  const results = trimmed ? search(groups, trimmed) : null;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      e.preventDefault();
      input.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="mt-8">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          ref={input}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setQuery("")}
          placeholder="Search tools — GST, invoice, SIP, age…"
          aria-label="Search tools"
          autoComplete="off"
          spellCheck={false}
          className="h-12 w-full rounded-xl border border-input bg-background pr-11 pl-11 text-base outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 dark:bg-input/30 [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              input.current?.focus();
            }}
            aria-label="Clear search"
            className="absolute top-1/2 right-2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        ) : (
          <kbd
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded-md border px-1.5 py-0.5 font-mono text-xs text-muted-foreground sm:block"
          >
            /
          </kbd>
        )}
      </div>

      {results ? (
        <section className="mt-8" aria-live="polite">
          <h2 className="text-sm text-muted-foreground">
            {results.length === 0
              ? `No tools match “${trimmed}”.`
              : `${results.length} ${results.length === 1 ? "tool" : "tools"} for “${trimmed}”`}
          </h2>
          <ToolCardGrid items={results} location="tools_hub_search" className="mt-4" />
        </section>
      ) : (
        <div className="mt-12 space-y-12">
          {groups.map((g) => (
            <section key={g.id} aria-labelledby={`group-${g.id}`}>
              <h2 id={`group-${g.id}`} className="text-xl font-semibold tracking-tight">
                {g.label}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{g.blurb}</p>
              <ToolCardGrid items={g.items} location="tools_hub" className="mt-5" />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { Kbd } from "@/components/ui/kbd";
import { SHORTCUTS } from "@/lib/shortcuts";

/** Read-only reference of the app's keyboard shortcuts, grouped by scope. */
export function ShortcutList() {
  const scopes = Array.from(new Set(SHORTCUTS.map((s) => s.scope)));

  return (
    <div className="space-y-5">
      {scopes.map((scope) => (
        <div key={scope}>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">{scope}</h3>
          <ul className="divide-y rounded-lg border">
            {SHORTCUTS.filter((s) => s.scope === scope).map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-4 px-3 py-2 text-sm"
              >
                <span>{s.label}</span>
                <Kbd combo={s.combo} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

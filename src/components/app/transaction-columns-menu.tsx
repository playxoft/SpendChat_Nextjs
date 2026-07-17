"use client";

import { Columns3, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  COLUMN_IDS,
  COLUMN_LABELS,
  resetColumns,
  toggleColumnVisible,
  useColumnLayout,
} from "./transaction-columns-store";

/** Toolbar dropdown to show/hide table columns and reset the layout. Reads the
 * same localStorage-backed store the table renders from, so toggles apply live. */
export function TransactionColumnsMenu() {
  const layout = useColumnLayout();
  const visibleCount = COLUMN_IDS.length - layout.hidden.length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" aria-label="Columns">
          <Columns3 className="size-4" />
          <span className="hidden sm:inline">Columns</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {COLUMN_IDS.map((id) => {
          const checked = !layout.hidden.includes(id);
          return (
            <DropdownMenuCheckboxItem
              key={id}
              checked={checked}
              // Keep the last remaining column from being hidden.
              disabled={checked && visibleCount <= 1}
              onCheckedChange={() => toggleColumnVisible(id)}
              // Keep the menu open so several columns can be toggled at once.
              onSelect={(e) => e.preventDefault()}
            >
              {COLUMN_LABELS[id]}
            </DropdownMenuCheckboxItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => resetColumns()}>
          <RotateCcw className="size-4" /> Reset layout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

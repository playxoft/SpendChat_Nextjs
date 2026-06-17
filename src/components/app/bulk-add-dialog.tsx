"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { parseBulk } from "@/lib/bulk-parser";
import { addBulkTransactions } from "@/actions/transactions";

const PLACEHOLDER = `12.50, Lunch, Food & Dining
-40, Weekly groceries, Groceries, expense, 2026-06-15
+2000, June salary, Salary, income`;

export function BulkAddDialog({
  trigger,
  today,
}: {
  trigger: ReactNode;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();

  const result = useMemo(() => parseBulk(text, today), [text, today]);

  function handleImport() {
    if (result.drafts.length === 0) {
      toast.error("Nothing to import yet");
      return;
    }
    startTransition(async () => {
      const res = await addBulkTransactions(result.drafts);
      if (res.ok) {
        toast.success(`Imported ${res.count} transaction${res.count === 1 ? "" : "s"}`);
        setText("");
        setOpen(false);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk add transactions</DialogTitle>
          <DialogDescription>
            One per line: <code>amount, note, category, type, date</code>. Only the amount
            is required. A leading <code>-</code> or <code>+</code> sets expense or income.
            Unknown categories are imported as uncategorized.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={PLACEHOLDER}
          className="font-mono text-sm"
          aria-label="Transactions to import"
        />

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {result.drafts.length} ready
            {result.errors.length > 0 ? `, ${result.errors.length} need fixing` : ""}
          </span>
        </div>

        {result.errors.length > 0 && (
          <ul className="max-h-24 space-y-1 overflow-auto rounded-md bg-muted/50 p-2 text-xs text-destructive">
            {result.errors.slice(0, 6).map((e) => (
              <li key={e.line}>
                Line {e.line}: {e.message}
              </li>
            ))}
            {result.errors.length > 6 && <li>…and {result.errors.length - 6} more</li>}
          </ul>
        )}

        <DialogFooter>
          <Button
            onClick={handleImport}
            disabled={pending || result.drafts.length === 0}
          >
            Import {result.drafts.length > 0 ? result.drafts.length : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

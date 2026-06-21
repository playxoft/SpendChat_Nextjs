"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseBulk, type BulkDraft } from "@/lib/bulk-parser";
import { addBulkTransactions } from "@/actions/transactions";
import { getCurrency } from "@/lib/currencies";
import { cn } from "@/lib/utils";
import type { Category, Profile } from "@/db/schema";

const NONE = "none";

type DraftRow = {
  key: number;
  type: "income" | "expense";
  amount: string;
  title: string;
  description: string;
  categoryName: string;
  profileId: string;
  date: string;
};

export function BulkAddDialog({
  trigger,
  today,
  categories,
  profiles,
  activeProfileId,
  currency = "USD",
}: {
  trigger: ReactNode;
  today: string;
  categories: Pick<Category, "id" | "name" | "kind" | "icon">[];
  profiles: Pick<Profile, "id" | "name" | "icon">[];
  activeProfileId?: string;
  currency?: string;
}) {
  const defaultProfile = activeProfileId ?? profiles[0]?.id ?? "";
  const idRef = useRef(3);
  const nextKey = () => ++idRef.current;

  const emptyRow = (key: number): DraftRow => ({
    key,
    type: "expense",
    amount: "",
    title: "",
    description: "",
    categoryName: "",
    profileId: defaultProfile,
    date: today,
  });

  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<DraftRow[]>(() => [0, 1, 2].map((k) => emptyRow(k)));
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pending, startTransition] = useTransition();

  const symbol = getCurrency(currency).symbol;

  function patch(key: number, change: Partial<DraftRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...change } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, emptyRow(nextKey())]);
  }
  function removeRow(key: number) {
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));
  }

  const drafts: BulkDraft[] = rows
    .filter((r) => Number(r.amount) > 0)
    .map((r) => ({
      type: r.type,
      amount: Number(r.amount),
      title: r.title.trim() || undefined,
      description: r.description.trim() || undefined,
      note: "",
      categoryName: r.categoryName || null,
      profileId: r.profileId || undefined,
      occurredOn: r.date || today,
    }));

  function handleParse() {
    const { drafts: parsed, errors } = parseBulk(pasteText, today);
    if (parsed.length === 0) {
      toast.error("Couldn't read any rows from the pasted text");
      return;
    }
    setRows((rs) => {
      const kept = rs.filter((r) => Number(r.amount) > 0);
      const added = parsed.map((d) => ({
        key: nextKey(),
        type: d.type,
        amount: String(d.amount),
        title: d.note ?? "",
        description: "",
        categoryName: d.categoryName ?? "",
        profileId: defaultProfile,
        date: d.occurredOn,
      }));
      return [...kept, ...added];
    });
    setPasteText("");
    setPasteOpen(false);
    if (errors.length) toast.warning(`${errors.length} line(s) couldn't be parsed`);
  }

  function handleImport() {
    if (drafts.length === 0) {
      toast.error("Add at least one row with an amount");
      return;
    }
    startTransition(async () => {
      const res = await addBulkTransactions(drafts);
      if (res.ok) {
        toast.success(`Imported ${res.count} transaction${res.count === 1 ? "" : "s"}`);
        setRows([0, 1, 2].map((k) => emptyRow(k)));
        setOpen(false);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Bulk add transactions</DialogTitle>
          <DialogDescription>
            Fill in a row per transaction. Only the amount is required.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/70 backdrop-blur-sm">
              <tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium">
                <th className="w-28">Type</th>
                <th className="w-28">Amount</th>
                <th className="min-w-40">Title</th>
                <th className="min-w-40">Description</th>
                <th className="w-40">Category</th>
                <th className="w-40">Date</th>
                {profiles.length > 1 && <th className="w-36">Profile</th>}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="[&>tr>td]:px-2 [&>tr>td]:py-1.5 [&>tr]:border-t">
              {rows.map((r) => {
                const cats = categories.filter((c) => c.kind === r.type);
                return (
                  <tr key={r.key}>
                    <td>
                      <Select
                        value={r.type}
                        onValueChange={(v) =>
                          patch(r.key, { type: v as "income" | "expense", categoryName: "" })
                        }
                      >
                        <SelectTrigger className="h-8 w-full" aria-label="Type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="expense">Expense</SelectItem>
                          <SelectItem value="income">Income</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td>
                      <div className="relative">
                        <span className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-xs text-muted-foreground">
                          {symbol}
                        </span>
                        <Input
                          inputMode="decimal"
                          value={r.amount}
                          onChange={(e) => patch(r.key, { amount: e.target.value })}
                          placeholder="0.00"
                          aria-label="Amount"
                          className="h-8 pl-6 tabular-nums"
                        />
                      </div>
                    </td>
                    <td>
                      <Input
                        value={r.title}
                        onChange={(e) => patch(r.key, { title: e.target.value })}
                        placeholder="Title"
                        aria-label="Title"
                        maxLength={100}
                        className="h-8"
                      />
                    </td>
                    <td>
                      <Input
                        value={r.description}
                        onChange={(e) => patch(r.key, { description: e.target.value })}
                        placeholder="Description"
                        aria-label="Description"
                        maxLength={250}
                        className="h-8"
                      />
                    </td>
                    <td>
                      <Select
                        value={r.categoryName || NONE}
                        onValueChange={(v) =>
                          patch(r.key, { categoryName: v === NONE ? "" : v })
                        }
                      >
                        <SelectTrigger className="h-8 w-full" aria-label="Category">
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>No category</SelectItem>
                          {cats.map((c) => (
                            <SelectItem key={c.id} value={c.name}>
                              {c.icon ? `${c.icon} ` : ""}
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td>
                      <DatePicker
                        value={r.date}
                        max={today}
                        onChange={(iso) => patch(r.key, { date: iso })}
                        className="h-8"
                      />
                    </td>
                    {profiles.length > 1 && (
                      <td>
                        <Select
                          value={r.profileId}
                          onValueChange={(v) => patch(r.key, { profileId: v })}
                        >
                          <SelectTrigger className="h-8 w-full" aria-label="Profile">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {profiles.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.icon ? `${p.icon} ` : ""}
                                {p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                    )}
                    <td>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Remove row"
                        onClick={() => removeRow(r.key)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            <Plus className="size-4" /> Add row
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setPasteOpen((v) => !v)}
          >
            <ChevronDown
              className={cn("size-4 transition-transform", pasteOpen && "rotate-180")}
            />
            Paste from spreadsheet
          </Button>
          <span className="ml-auto text-sm text-muted-foreground">
            {drafts.length} ready
          </span>
        </div>

        {pasteOpen && (
          <div className="space-y-2">
            <Textarea
              rows={4}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={`12.50, Lunch, Food & Dining\n-40, Groceries, Groceries, expense, 2026-06-15\n+2000, June salary, Salary, income`}
              className="font-mono text-xs"
              aria-label="Paste rows"
            />
            <Button type="button" variant="secondary" size="sm" onClick={handleParse}>
              Add parsed rows
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button onClick={handleImport} disabled={pending || drafts.length === 0}>
            Import {drafts.length > 0 ? drafts.length : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

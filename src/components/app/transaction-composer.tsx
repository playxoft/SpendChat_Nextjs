"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { addTransaction } from "@/actions/transactions";
import { getCurrency } from "@/lib/currencies";
import type { Category } from "@/db/schema";

const NONE = "none";

export function TransactionComposer({
  categories,
  currency,
  today,
}: {
  categories: Pick<Category, "id" | "name" | "kind" | "icon">[];
  currency: string;
  today: string;
}) {
  const [type, setType] = useState<"expense" | "income">("expense");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<string>(NONE);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  const cats = useMemo(() => categories.filter((c) => c.kind === type), [categories, type]);
  const symbol = getCurrency(currency).symbol;

  function switchType(t: "expense" | "income") {
    setType(t);
    setCategoryId(NONE);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    if (!value || value <= 0) {
      toast.error("Enter an amount greater than 0");
      return;
    }
    startTransition(async () => {
      const res = await addTransaction({
        type,
        amount: value,
        categoryId: categoryId === NONE ? null : categoryId,
        note: note.trim() || undefined,
        occurredOn: today,
      });
      if (res.ok) {
        setAmount("");
        setNote("");
        toast.success(type === "income" ? "Income added" : "Expense added");
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="sticky bottom-20 z-20 border-t bg-background/95 px-3 py-3 backdrop-blur-sm md:bottom-0"
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-2">
        <div className="inline-flex w-fit rounded-full border bg-muted/50 p-0.5 text-sm">
          {(["expense", "income"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => switchType(t)}
              aria-pressed={type === t}
              className={cn(
                "rounded-full px-3 py-1 capitalize transition-colors",
                type === t
                  ? "bg-background font-medium shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">
              {symbol}
            </span>
            <Input
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-label="Amount"
              className="w-28 pl-7 tabular-nums"
            />
          </div>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="w-40" aria-label="Category">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No category</SelectItem>
              {cats.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.icon ? `${c.icon} ` : ""}
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Add a note…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-label="Note"
            className="min-w-32 flex-1"
          />
          <Button type="submit" size="icon" disabled={pending} aria-label="Add transaction">
            <ArrowUp className="size-4" />
          </Button>
        </div>
      </div>
    </form>
  );
}

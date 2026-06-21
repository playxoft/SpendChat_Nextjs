"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
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
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Kbd } from "@/components/ui/kbd";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { addTransaction, updateTransaction } from "@/actions/transactions";
import { getCurrency } from "@/lib/currencies";
import { useShortcut } from "@/hooks/use-shortcut";
import { comboFor } from "@/lib/shortcuts";
import type { Category, Profile } from "@/db/schema";

const NONE = "none";

export type TransactionValues = {
  id?: string;
  type: "income" | "expense";
  amount: string;
  categoryId: string | null;
  profileId: string | null;
  title: string;
  description: string;
  occurredOn: string;
};

export function TransactionDialog({
  mode,
  categories,
  profiles = [],
  currency,
  today,
  defaultValues,
  activeProfileId,
  trigger,
  open,
  onOpenChange,
}: {
  mode: "add" | "edit";
  categories: Pick<Category, "id" | "name" | "kind" | "icon">[];
  profiles?: Pick<Profile, "id" | "name" | "icon">[];
  currency: string;
  today: string;
  defaultValues?: TransactionValues;
  activeProfileId?: string;
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}) {
  const controlled = open !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlled ? open : internalOpen;
  const setOpen = controlled ? onOpenChange! : setInternalOpen;

  const emptyValues: TransactionValues = {
    type: "expense",
    amount: "",
    categoryId: null,
    profileId: activeProfileId ?? profiles[0]?.id ?? null,
    title: "",
    description: "",
    occurredOn: today,
  };
  const [values, setValues] = useState<TransactionValues>(defaultValues ?? emptyValues);
  const [pending, startTransition] = useTransition();

  // Reset the form to the row being edited each time the dialog opens.
  useEffect(() => {
    if (!isOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValues(defaultValues ?? emptyValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const cats = categories.filter((c) => c.kind === values.type);
  const symbol = getCurrency(currency).symbol;
  const toggleCombo = comboFor("tracker.toggle-type");

  function setType(type: "income" | "expense") {
    setValues((v) => ({ ...v, type, categoryId: null }));
  }

  // ⌘/Ctrl+E toggles expense/income while the dialog is open.
  useShortcut(
    toggleCombo,
    () => setValues((v) => ({ ...v, type: v.type === "expense" ? "income" : "expense", categoryId: null })),
    { enabled: !!isOpen, allowInInput: true },
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(values.amount);
    if (!amount || amount <= 0) {
      toast.error("Enter an amount greater than 0");
      return;
    }
    if (!values.occurredOn) {
      toast.error("Pick a date");
      return;
    }
    startTransition(async () => {
      const payload = {
        type: values.type,
        amount,
        categoryId: values.categoryId,
        profileId: values.profileId || undefined,
        title: values.title.trim() || undefined,
        description: values.description.trim() || undefined,
        occurredOn: values.occurredOn,
      };
      const res =
        mode === "edit" && values.id
          ? await updateTransaction({ ...payload, id: values.id })
          : await addTransaction(payload);
      if (res.ok) {
        toast.success(mode === "edit" ? "Transaction updated" : "Transaction added");
        setOpen(false);
        if (mode === "add") setValues(emptyValues);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "edit" ? "Edit transaction" : "Add transaction"}
          </DialogTitle>
          <DialogDescription>
            Amounts are recorded in {getCurrency(currency).code}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="inline-flex w-full items-center rounded-lg border bg-muted/50 p-0.5 text-sm">
            {(["expense", "income"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                aria-pressed={values.type === t}
                className={cn(
                  "flex-1 rounded-md px-3 py-1.5 capitalize transition-colors",
                  values.type === t
                    ? "bg-background font-medium shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t}
              </button>
            ))}
            <Kbd combo={toggleCombo} className="mr-1.5 ml-1 hidden sm:inline-flex" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount</Label>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">
                  {symbol}
                </span>
                <Input
                  id="amount"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={values.amount}
                  onChange={(e) => setValues((v) => ({ ...v, amount: e.target.value }))}
                  className="pl-7 tabular-nums"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="date">Date</Label>
              <DatePicker
                id="date"
                max={today}
                value={values.occurredOn}
                onChange={(iso) => setValues((v) => ({ ...v, occurredOn: iso }))}
              />
            </div>
          </div>

          <div className={cn("grid gap-3", profiles.length > 0 ? "grid-cols-2" : "grid-cols-1")}>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select
                value={values.categoryId ?? NONE}
                onValueChange={(v) =>
                  setValues((prev) => ({ ...prev, categoryId: v === NONE ? null : v }))
                }
              >
                <SelectTrigger className="w-full">
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
            </div>
            {profiles.length > 0 && (
              <div className="space-y-1.5">
                <Label>Profile</Label>
                <Select
                  value={values.profileId ?? profiles[0]?.id}
                  onValueChange={(v) => setValues((prev) => ({ ...prev, profileId: v }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Profile" />
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
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="Add title"
              value={values.title}
              maxLength={100}
              onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              rows={2}
              placeholder="Optional description"
              value={values.description}
              maxLength={250}
              onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {mode === "edit" ? "Save changes" : "Add transaction"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

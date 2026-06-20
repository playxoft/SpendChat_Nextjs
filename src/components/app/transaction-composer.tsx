"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { ArrowUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Kbd } from "@/components/ui/kbd";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CategoryRow } from "./category-row";
import { CategoryEditorDialog } from "./category-editor-dialog";
import { cn } from "@/lib/utils";
import { addTransaction } from "@/actions/transactions";
import { getCurrency } from "@/lib/currencies";
import { useShortcut } from "@/hooks/use-shortcut";
import { comboFor } from "@/lib/shortcuts";
import type { Category, Profile } from "@/db/schema";

export function TransactionComposer({
  categories,
  currency,
  today,
  profiles,
  activeProfileId,
}: {
  categories: Pick<Category, "id" | "name" | "kind" | "icon">[];
  currency: string;
  today: string;
  profiles: Pick<Profile, "id" | "name" | "icon">[];
  activeProfileId?: string;
}) {
  const [type, setType] = useState<"expense" | "income">("expense");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [descOpen, setDescOpen] = useState(false);
  const [profileId, setProfileId] = useState(activeProfileId ?? profiles[0]?.id ?? "");
  const [editorOpen, setEditorOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const descRef = useRef<HTMLTextAreaElement>(null);
  const cats = useMemo(() => categories.filter((c) => c.kind === type), [categories, type]);
  const symbol = getCurrency(currency).symbol;

  const toggleCombo = comboFor("tracker.toggle-type");
  const editCombo = comboFor("tracker.categories");

  function switchType(t?: "expense" | "income") {
    setType((prev) => t ?? (prev === "expense" ? "income" : "expense"));
    setCategoryId(null);
  }

  // ⌘/Ctrl+E toggles expense/income even while typing.
  useShortcut(toggleCombo, () => switchType(), { allowInInput: true });
  // "/" opens the category editor when not typing in a field.
  useShortcut(editCombo, () => setEditorOpen(true));

  function submit() {
    const value = Number(amount);
    if (!value || value <= 0) {
      toast.error("Enter an amount greater than 0");
      return;
    }
    startTransition(async () => {
      const res = await addTransaction({
        type,
        amount: value,
        categoryId,
        profileId: profileId || undefined,
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        occurredOn: today,
      });
      if (res.ok) {
        setAmount("");
        setTitle("");
        setDescription("");
        setDescOpen(false);
        toast.success(type === "income" ? "Income added" : "Expense added");
      } else {
        toast.error(res.error);
      }
    });
  }

  function onTitleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    if (e.shiftKey) {
      e.preventDefault();
      setDescOpen(true);
      requestAnimationFrame(() => descRef.current?.focus());
    } else {
      e.preventDefault();
      submit();
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="sticky bottom-20 z-20 border-t bg-background/95 px-3 py-3 backdrop-blur-sm md:bottom-0"
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex w-fit items-center rounded-full border bg-muted/50 p-0.5 text-sm">
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
            <Kbd combo={toggleCombo} className="mr-1.5 ml-1 hidden sm:inline-flex" />
          </div>

          {profiles.length > 0 && (
            <Select value={profileId} onValueChange={setProfileId}>
              <SelectTrigger className="h-8 w-auto gap-1" aria-label="Profile">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.icon ? `${p.icon} ` : ""}
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <CategoryRow
          categories={cats}
          value={categoryId}
          onChange={setCategoryId}
          onEdit={() => setEditorOpen(true)}
          editCombo={editCombo}
        />

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
          <Input
            placeholder="Add title…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={onTitleKeyDown}
            aria-label="Title"
            className="min-w-32 flex-1"
          />
          <Button type="submit" size="icon" disabled={pending} aria-label="Add transaction">
            <ArrowUp className="size-4" />
          </Button>
        </div>

        {descOpen ? (
          <Textarea
            ref={descRef}
            rows={2}
            placeholder="Add a description…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            aria-label="Description"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setDescOpen(true);
              requestAnimationFrame(() => descRef.current?.focus());
            }}
            className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            Add description
            <Kbd combo={comboFor("tracker.description")} />
          </button>
        )}
      </div>

      <CategoryEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        categories={categories}
        defaultKind={type}
      />
    </form>
  );
}

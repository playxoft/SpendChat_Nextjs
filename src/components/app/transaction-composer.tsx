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

const TITLE_MAX = 100;
const DESCRIPTION_MAX = 250;
// Matches a trailing "/query" token typed into the title field.
const SLASH_RE = /(?:^|\s)\/([^\s/]*)$/;

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
  const [slashDismissed, setSlashDismissed] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const [pending, startTransition] = useTransition();

  const descRef = useRef<HTMLTextAreaElement>(null);
  const cats = useMemo(() => categories.filter((c) => c.kind === type), [categories, type]);
  const symbol = getCurrency(currency).symbol;

  const toggleCombo = comboFor("tracker.toggle-type");
  const submitCombo = comboFor("tracker.submit");
  const descCombo = comboFor("tracker.description");

  // "/" in the title opens an inline category picker.
  const slashMatch = title.match(SLASH_RE);
  const slashQuery = slashMatch?.[1] ?? "";
  const slashActive = !!slashMatch && !slashDismissed;
  const slashResults = slashActive
    ? cats.filter((c) => c.name.toLowerCase().includes(slashQuery.toLowerCase())).slice(0, 8)
    : [];
  const slashIdx = slashResults.length ? Math.min(slashIndex, slashResults.length - 1) : 0;

  function switchType(t?: "expense" | "income") {
    setType((prev) => t ?? (prev === "expense" ? "income" : "expense"));
    setCategoryId(null);
  }

  // ⌘/Ctrl+E toggles expense/income even while typing.
  useShortcut(toggleCombo, () => switchType(), { allowInInput: true });

  function openDescription() {
    setDescOpen(true);
    requestAnimationFrame(() => descRef.current?.focus());
  }

  function selectSlashCategory(cat: Pick<Category, "id">) {
    setCategoryId(cat.id);
    setTitle((t) => t.replace(SLASH_RE, "").replace(/\s+$/, ""));
    setSlashDismissed(true);
    setSlashIndex(0);
  }

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
        setSlashDismissed(false);
        toast.success(type === "income" ? "Income added" : "Expense added");
      } else {
        toast.error(res.error);
      }
    });
  }

  function onTitleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (slashActive && slashResults.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashIndex((i) => (i + 1) % slashResults.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashIndex((i) => (i - 1 + slashResults.length) % slashResults.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        selectSlashCategory(slashResults[slashIdx]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSlashDismissed(true);
        return;
      }
    }

    if (e.key === "Enter") {
      // Shift+Enter opens the description; Enter (and ⌘/Ctrl+Enter) sends.
      if (e.shiftKey) {
        e.preventDefault();
        openDescription();
      } else {
        e.preventDefault();
        submit();
      }
    }
  }

  function onDescriptionKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  }

  const sendButton = (
    <Button type="submit" size="icon" disabled={pending} aria-label="Send transaction">
      <ArrowUp className="size-4" />
    </Button>
  );

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
        />

        <div className="flex flex-wrap items-end gap-2">
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

          <div className="relative min-w-32 flex-1">
            <Input
              placeholder="Add a title — type / to tag a category"
              value={title}
              maxLength={TITLE_MAX}
              onChange={(e) => {
                setTitle(e.target.value);
                setSlashDismissed(false);
                setSlashIndex(0);
              }}
              onKeyDown={onTitleKeyDown}
              aria-label="Title"
              className="w-full"
            />
            {slashActive && (
              <div className="absolute bottom-full left-0 z-30 mb-1 w-64 overflow-hidden rounded-lg border bg-popover p-1 shadow-md">
                {slashResults.length > 0 ? (
                  <ul className="max-h-56 overflow-y-auto">
                    {slashResults.map((c, i) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selectSlashCategory(c);
                          }}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                            i === slashIdx ? "bg-accent" : "hover:bg-muted",
                          )}
                        >
                          <span aria-hidden>{c.icon ?? "🏷️"}</span>
                          <span className="truncate">{c.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-2 py-1.5 text-sm text-muted-foreground">
                    No category matches “{slashQuery}”
                  </p>
                )}
              </div>
            )}
          </div>

          {!descOpen && (
            <>
              <Kbd combo={submitCombo} className="hidden self-center sm:inline-flex" />
              {sendButton}
            </>
          )}
        </div>

        {descOpen ? (
          <div className="flex items-end gap-2">
            <Textarea
              ref={descRef}
              rows={2}
              placeholder="Add a description…"
              value={description}
              maxLength={DESCRIPTION_MAX}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={onDescriptionKeyDown}
              aria-label="Description"
              className="flex-1"
            />
            <div className="flex shrink-0 items-center gap-1.5 pb-0.5">
              <Kbd combo={submitCombo} className="hidden sm:inline-flex" />
              {sendButton}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={openDescription}
            className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            Add description
            <Kbd combo={descCombo} />
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

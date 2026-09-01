"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { addTransaction, updateTransaction, deleteTransaction } from "@/actions/transactions";
import { getCurrency } from "@/lib/currencies";
import { amountPlaceholder, formatAmountInput, integerDigitCount, parseAmountInput, stripNonAmountChars } from "@/lib/parse-amount";
import {
  AMOUNT_INTEGER_DIGITS_MAX,
  ATTACHMENT_MAX_PER_TRANSACTION,
  TRANSACTION_DESCRIPTION_MAX,
  TRANSACTION_TITLE_MAX,
} from "@/lib/validation";
import { useShortcut } from "@/hooks/use-shortcut";
import { comboFor } from "@/lib/shortcuts";
import { usePermissions } from "./permissions";
import { AttachmentBox } from "./attachments/attachment-box";
import { StagedAttachmentList, useStagedAttachments } from "./attachments/staged-attachments";
import { TransactionAttachments } from "./attachments/transaction-attachments";
import { uploadStagedAttachments } from "./attachments/upload-client";
import type { AttachmentDTO } from "@/lib/attachments";
import type { TransactionRow } from "@/lib/queries";
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
  locale = "en-US",
  today,
  defaultValues,
  activeProfileId,
  trigger,
  open,
  onOpenChange,
  onSaved,
  onDeleted,
  initialFiles,
  attachments = [],
}: {
  mode: "add" | "edit";
  categories: Pick<Category, "id" | "name" | "kind" | "icon">[];
  profiles?: Pick<Profile, "id" | "name" | "icon">[];
  currency: string;
  /** Drives how a typed amount is read ("1,50" is 1.50 for a de-DE user). */
  locale?: string;
  today: string;
  defaultValues?: TransactionValues;
  activeProfileId?: string;
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  /** (add) Files dropped onto the page, staged when the dialog opens. */
  initialFiles?: File[];
  /** (edit) The row's attachments, embedded in the query — rendered instantly
   * so the section never shows a loading spinner. */
  attachments?: AttachmentDTO[];
  /** (edit) Called on a successful save with a row patch, so the caller can
   * update the row optimistically in the same commit as the toast. */
  onSaved?: (patch: Partial<TransactionRow>) => void;
  /** (edit) Called on a successful delete, so the caller can remove the row
   * optimistically in the same commit as the toast. */
  onDeleted?: () => void;
}) {
  // Viewers (no editor access anywhere) get a read-only dialog: fields are
  // disabled and the Save/Delete buttons are hidden. The server enforces this too.
  const { canWrite } = usePermissions();
  const readOnly = !canWrite;

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
  const [deletePending, startDeleteTransition] = useTransition();
  // (add) Files chosen before the transaction exists; uploaded once it's created.
  const staged = useStagedAttachments();
  const [uploading, setUploading] = useState(false);

  // Has the user changed anything from what the form opened with? When dirty we
  // block click-away dismissal so unsaved edits aren't lost; a pristine form
  // still closes on an outside click.
  const baseline = defaultValues ?? emptyValues;
  const isDirty =
    // A staged receipt is work too, and it's the one kind the form's own values
    // don't carry — a pristine dialog holding a dropped file used to be
    // dismissable by a click away, taking the file with it.
    staged.items.length > 0 ||
    values.type !== baseline.type ||
    values.amount !== baseline.amount ||
    values.categoryId !== baseline.categoryId ||
    values.profileId !== baseline.profileId ||
    values.title !== baseline.title ||
    values.description !== baseline.description ||
    values.occurredOn !== baseline.occurredOn;

  // Reset the form to the row being edited each time the dialog opens, and (add
  // mode) seed any files dropped onto the page as staged attachments.
  useEffect(() => {
    if (!isOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValues(defaultValues ?? emptyValues);
    if (mode === "add") {
      staged.clear();
      if (initialFiles?.length) staged.add(initialFiles);
    }
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
    { enabled: !!isOpen && !readOnly, allowInInput: true },
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly) return;
    // Read against the user's locale, so "1,50" is 1.50 for a de-DE user
    // and "1,000" is 1000 for an en-US one; ambiguous input is rejected.
    const amount = parseAmountInput(values.amount, locale);
    if (amount === null || amount <= 0) {
      toast.error(
        amount === null && values.amount.trim()
          ? `That amount isn't clear — try ${formatAmountInput(12.5, locale)}`
          : "Enter an amount greater than 0",
      );
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
        // (add) Upload any staged files to the transaction we just created. The
        // row is already saved, so an attachment failure only warns — it doesn't
        // roll the transaction back.
        if (mode === "add" && "id" in res && typeof res.id === "string" && staged.items.length > 0) {
          setUploading(true);
          try {
            await uploadStagedAttachments(res.id, staged.toInputs());
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : "Some files couldn't be attached",
            );
          } finally {
            setUploading(false);
          }
        }
        if (mode === "add") staged.clear();
        // Paint the edit onto the row in this same commit (before the server
        // revalidation lands) so the change and the toast happen together.
        if (mode === "edit" && values.id) {
          const cat = values.categoryId
            ? (categories.find((c) => c.id === values.categoryId) ?? null)
            : null;
          const prof = values.profileId
            ? (profiles.find((p) => p.id === values.profileId) ?? null)
            : null;
          const patch: Partial<TransactionRow> = {
            type: values.type,
            amountMinor: Math.round(amount * 10 ** getCurrency(currency).decimals),
            title: values.title.trim() || null,
            description: values.description.trim() || null,
            occurredOn: values.occurredOn,
            categoryId: values.categoryId,
            categoryName: cat?.name ?? null,
            categoryIcon: cat?.icon ?? null,
          };
          if (prof) {
            patch.profileId = prof.id;
            patch.profileName = prof.name;
            patch.profileIcon = prof.icon;
          }
          onSaved?.(patch);
        }
        toast.success(mode === "edit" ? "Transaction updated" : "Transaction added");
        setOpen(false);
        if (mode === "add") setValues(emptyValues);
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleDelete() {
    if (readOnly || !values.id) return;
    const id = values.id;
    startDeleteTransition(async () => {
      const res = await deleteTransaction(id);
      if (res.ok) {
        // Remove the row in this same commit so it disappears with the toast,
        // not a beat later when the server revalidation arrives.
        onDeleted?.();
        toast.success("Transaction deleted");
        setOpen(false);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      {/* Capped height with a scrollable body + pinned footer, so the dialog
          stays a consistent size no matter how many fields/files it holds. */}
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-md" closeOnOutsideClick={!isDirty}>
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {readOnly ? "Transaction" : mode === "edit" ? "Edit transaction" : "Add transaction"}
          </DialogTitle>
          <DialogDescription>
            Amounts are recorded in {getCurrency(currency).code}.
          </DialogDescription>
        </DialogHeader>

        {/* `min-w-0` on the form (a grid child of DialogContent) and the fieldset
            (which otherwise has an intrinsic `min-width: min-content`) lets the
            attachment tiles' `truncate` actually engage — without it a long
            unbreakable filename forces the whole dialog wider. */}
        <form onSubmit={handleSubmit} className="flex min-h-0 min-w-0 flex-1 flex-col">
          <fieldset disabled={readOnly} className="m-0 min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto border-0 p-0 pr-1">
          <div className="flex w-full items-center rounded-lg border bg-muted/50 p-0.5 text-sm">
            {(["expense", "income"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                aria-pressed={values.type === t}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 capitalize transition-colors",
                  values.type === t
                    ? "bg-background font-medium shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t}
                {/* The ⌘E hint rides inside the active capsule. */}
                {values.type === t && (
                  <Kbd combo={toggleCombo} className="hidden opacity-70 sm:inline-flex" />
                )}
              </button>
            ))}
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
                  placeholder={amountPlaceholder(locale)}
                  value={values.amount}
                  // Numbers only (digits + the separators any locale groups/points
                  // with); reject the keystroke once the whole-number part hits the
                  // 9-digit cap. The authoritative check is still `amountSchema`.
                  onChange={(e) => {
                    const next = stripNonAmountChars(e.target.value, locale);
                    setValues((v) =>
                      integerDigitCount(next, locale) > AMOUNT_INTEGER_DIGITS_MAX
                        ? v
                        : { ...v, amount: next },
                    );
                  }}
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
              maxLength={TRANSACTION_TITLE_MAX}
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
              maxLength={TRANSACTION_DESCRIPTION_MAX}
              onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
              // Bounded box that can't stretch the dialog: `overflow-wrap:anywhere`
              // breaks a long no-space string onto the next line *and* shrinks the
              // textarea's min-content width, so the base `field-sizing-content`
              // can't grow it sideways; `max-h` caps its height (scrolls past that)
              // and `resize-none` blocks a manual drag. `min-w-0` lets it shrink.
              className="max-h-28 min-w-0 resize-none overflow-y-auto [overflow-wrap:anywhere]"
            />
          </div>

          <div className="space-y-2">
            <Label>
              Attachments{" "}
              <span className="font-normal text-muted-foreground">
                — receipts, bills, invoices
              </span>
            </Label>
            {mode === "edit" && values.id ? (
              <TransactionAttachments
                transactionId={values.id}
                canEdit={!readOnly}
                initialAttachments={attachments}
              />
            ) : (
              // The box IS the dropzone; fixed height keeps the dialog steady.
              <AttachmentBox
                onFiles={staged.add}
                remaining={ATTACHMENT_MAX_PER_TRANSACTION - staged.items.length}
                disabled={readOnly}
                hasItems={staged.items.length > 0}
              >
                <StagedAttachmentList
                  items={staged.items}
                  onRemove={staged.remove}
                  onUpdate={staged.update}
                  disabled={readOnly}
                />
              </AttachmentBox>
            )}
          </div>

          </fieldset>

          {/* Viewers see a read-only record — no Save/Delete, just Close. */}
          {readOnly ? (
            <DialogFooter className="mt-4 shrink-0 border-t pt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          ) : (
            <DialogFooter className={cn("mt-4 shrink-0 border-t pt-4", mode === "edit" && "sm:justify-between")}>
              {mode === "edit" ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="destructive" disabled={deletePending || pending}>
                      <Trash2 className="size-4" /> Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this transaction?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This removes it for good and updates your balance. This can’t be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={deletePending}>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDelete}
                        disabled={deletePending}
                        className={buttonVariants({ variant: "destructive" })}
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : null}
              {/* In edit mode, Save stays disabled until something actually changes. */}
              <Button
                type="submit"
                disabled={pending || deletePending || (mode === "edit" && !isDirty)}
              >
                {uploading
                  ? "Uploading files…"
                  : mode === "edit"
                    ? "Save changes"
                    : "Add transaction"}
              </Button>
            </DialogFooter>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}

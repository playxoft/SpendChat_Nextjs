"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { deleteBudget } from "@/actions/budgets";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { usePlan } from "../upgrade-dialog";

/**
 * "Delete the Groceries budget?" — the one confirm before a budget goes. Kept
 * open until the delete lands, so a failure is reported here rather than after
 * the dialog has already said it worked.
 */
export function BudgetDeleteConfirm({
  budget,
  open,
  onOpenChange,
  onDeleted,
}: {
  budget: { id: string; label: string } | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** After a successful delete (e.g. to close the edit dialog behind it). */
  onDeleted?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const { reportFailure } = usePlan();

  function confirm() {
    if (!budget) return;
    startTransition(async () => {
      const res = await deleteBudget(budget.id);
      if (!res.ok) {
        reportFailure(res);
        return;
      }
      toast.success("Budget deleted");
      onOpenChange(false);
      onDeleted?.();
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete the {budget?.label ?? ""} budget?</AlertDialogTitle>
          <AlertDialogDescription>
            Its limit and alerts go. Your transactions aren&apos;t touched, and you can set a new
            budget any time.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            className={buttonVariants({ variant: "destructive" })}
            onClick={(e) => {
              e.preventDefault();
              confirm();
            }}
          >
            {pending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

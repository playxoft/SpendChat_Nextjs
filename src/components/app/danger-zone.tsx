"use client";

import { useState, useTransition } from "react";
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
import { deleteAccount, deleteAllTransactions } from "@/actions/settings";
import { authClient } from "@/lib/neon-auth-client";

/** A confirm-by-typing-DELETE destructive row. */
function DangerRow({
  title,
  description,
  buttonLabel,
  dialogTitle,
  dialogDescription,
  confirmLabel,
  onConfirm,
}: {
  title: string;
  description: string;
  buttonLabel: string;
  dialogTitle: string;
  dialogDescription: string;
  confirmLabel: string;
  onConfirm: (confirm: string, done: (ok: boolean) => void) => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(
      () =>
        new Promise<void>((resolve) => {
          onConfirm(confirm, (ok) => {
            if (ok) {
              setConfirm("");
              setOpen(false);
            }
            resolve();
          });
        }),
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="destructive">{buttonLabel}</Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>
              {dialogDescription} Type <span className="font-semibold">DELETE</span> to
              confirm.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="DELETE"
            aria-label="Type DELETE to confirm"
          />
          <DialogFooter>
            <Button
              variant="destructive"
              onClick={handleConfirm}
              disabled={pending || confirm !== "DELETE"}
            >
              {confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function DangerZone() {
  return (
    <div className="space-y-3">
      <DangerRow
        title="Delete all transactions"
        description="Permanently remove every transaction. Your categories and settings are kept. This cannot be undone."
        buttonLabel="Delete all"
        dialogTitle="Delete all transactions?"
        dialogDescription="This permanently removes all of your transactions."
        confirmLabel="Delete everything"
        onConfirm={(confirm, done) => {
          void deleteAllTransactions(confirm).then((res) => {
            if (res.ok) toast.success("All transactions deleted");
            else toast.error(res.error);
            done(res.ok);
          });
        }}
      />
      <DangerRow
        title="Delete account"
        description="Erase everything: your transactions, workspaces (including shared ones you own), categories, and settings. This cannot be undone."
        buttonLabel="Delete account"
        dialogTitle="Delete your account?"
        dialogDescription="This permanently erases all of your SpendChat data and signs you out."
        confirmLabel="Delete my account"
        onConfirm={(confirm, done) => {
          void deleteAccount(confirm).then(async (res) => {
            if (res.ok) {
              toast.success("Account data deleted");
              await authClient.signOut();
              window.location.href = "/";
            } else {
              toast.error(res.error);
              done(false);
            }
          });
        }}
      />
    </div>
  );
}

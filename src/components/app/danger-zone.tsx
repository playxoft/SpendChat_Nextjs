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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { deleteUser, signOut } from "firebase/auth";
import { deleteAccount, deleteAllTransactions } from "@/actions/settings";
import { clearSession, getFirebaseAuth } from "@/lib/firebase";
import { usePermissions } from "./permissions";

type ProfileOption = { id: string; name: string; icon: string | null };

/** Shared destructive-row shell. */
function DangerRowShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

/** A confirm-by-typing-DELETE destructive row (used for account deletion). */
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
    <DangerRowShell title={title} description={description}>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="destructive">{buttonLabel}</Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>
              {dialogDescription} Type <span className="font-semibold">DELETE</span> to confirm.
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
    </DangerRowShell>
  );
}

/**
 * Clear transactions per profile (workspace admins only). The admin picks which
 * profiles to wipe; every transaction in a selected profile is removed.
 */
function ClearTransactionsRow({ profiles }: { profiles: ProfileOption[] }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(profiles.map((p) => p.id)));
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      // Default to every profile selected each time it opens.
      setSelected(new Set(profiles.map((p) => p.id)));
      setConfirm("");
    }
  }

  const allSelected = profiles.length > 0 && selected.size === profiles.length;

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function handleConfirm() {
    startTransition(async () => {
      const res = await deleteAllTransactions(confirm, [...selected]);
      if (res.ok) {
        const n = res.deleted ?? 0;
        toast.success(`Deleted ${n} transaction${n === 1 ? "" : "s"}`);
        setOpen(false);
        setConfirm("");
      } else {
        toast.error(res.error);
      }
    });
  }

  const canDelete = confirm === "DELETE" && selected.size > 0 && !pending;

  return (
    <DangerRowShell
      title="Delete all transactions"
      description="Permanently remove every transaction in the profiles you choose. Categories and settings are kept. This cannot be undone."
    >
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogTrigger asChild>
          <Button variant="destructive">Delete all</Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete transactions?</DialogTitle>
            <DialogDescription>
              Choose which profiles to clear — every transaction in a selected profile is removed
              for everyone. Type <span className="font-semibold">DELETE</span> to confirm.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1">
            <label className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 hover:bg-accent">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(c) =>
                  setSelected(c === true ? new Set(profiles.map((p) => p.id)) : new Set())
                }
                aria-label="All profiles"
              />
              <span className="text-sm font-medium">All profiles</span>
            </label>
            <Separator />
            <div className="max-h-48 space-y-0.5 overflow-y-auto">
              {profiles.map((p) => (
                <label
                  key={p.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 hover:bg-accent"
                >
                  <Checkbox
                    checked={selected.has(p.id)}
                    onCheckedChange={(c) => toggle(p.id, c === true)}
                    aria-label={p.name}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {p.icon ? `${p.icon} ` : ""}
                    {p.name}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <Input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="DELETE"
            aria-label="Type DELETE to confirm"
          />
          <DialogFooter>
            <Button variant="destructive" onClick={handleConfirm} disabled={!canDelete}>
              Delete everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DangerRowShell>
  );
}

export function DangerZone({ profiles }: { profiles: ProfileOption[] }) {
  const { canManage } = usePermissions();

  return (
    <div className="space-y-3">
      {/* Only workspace admins can clear transactions. */}
      {canManage && <ClearTransactionsRow profiles={profiles} />}
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
              const auth = getFirebaseAuth();
              try {
                if (auth.currentUser) await deleteUser(auth.currentUser);
              } catch (err) {
                // The DB data is already gone; Firebase may need a recent login
                // to delete the credential itself. Sign out regardless.
                const code =
                  err && typeof err === "object" && "code" in err
                    ? String((err as { code?: unknown }).code)
                    : "";
                if (code === "auth/requires-recent-login") {
                  toast.info("Your data is deleted. Sign in again to remove your login.");
                }
              }
              await signOut(auth);
              await clearSession();
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

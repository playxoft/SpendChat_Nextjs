"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { deleteInvoiceClient, saveInvoiceClient, updateInvoiceClient } from "@/actions/invoices";
import { SelectField, TextAreaField, TextField } from "@/components/tools/fields";
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
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePlan } from "@/components/app/upgrade-dialog";
import type { InvoiceClientDTO } from "@/lib/invoice-queries";
import { DOC_FIELD_LIMITS } from "@/lib/invoices";

type ProfileOption = { id: string; name: string; icon: string | null };

/**
 * Saved clients: who you bill, kept per profile so an invoice can be filled
 * in with a pick. Editing or deleting one never changes a document that
 * already went out — those keep their own copy.
 */
export function ClientManager({
  clients,
  profiles,
  writable,
  limit,
}: {
  clients: InvoiceClientDTO[];
  /** Every profile in view, for the labels. */
  profiles: ProfileOption[];
  /** Profiles the person can add to and edit in. */
  writable: string[];
  /** The tier's cap and use, or null for none. */
  limit: { used: number; max: number; reached: boolean } | null;
}) {
  const [editing, setEditing] = useState<InvoiceClientDTO | "new" | null>(null);
  const [deleting, setDeleting] = useState<InvoiceClientDTO | null>(null);
  const router = useRouter();
  const { reportFailure } = usePlan();
  const [pending, startTransition] = useTransition();
  const canAdd = writable.length > 0 && !limit?.reached;
  const profileName = (id: string) => {
    const p = profiles.find((x) => x.id === id);
    return p ? `${p.icon ? `${p.icon} ` : ""}${p.name}` : "";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {clients.length === 1 ? "1 client" : `${clients.length} clients`}
          {limit ? ` · ${limit.used} of ${limit.max} saved` : ""}
        </p>
        {writable.length > 0 &&
          (canAdd ? (
            <Button onClick={() => setEditing("new")}>
              <Plus /> New client
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              All {limit?.max} places are used — delete one you don&apos;t need to add another.
            </p>
          ))}
      </div>

      {clients.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-muted">
            <Users className="size-5 text-muted-foreground" />
          </span>
          <p className="max-w-sm text-sm text-muted-foreground">
            Save the people and companies you bill, and pick them when you make an invoice or quote.
          </p>
        </div>
      ) : (
        <ul className="divide-y rounded-xl border">
          {clients.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{c.name}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {[c.email, c.taxId && `Tax ID ${c.taxId}`, profiles.length > 1 && profileName(c.profileId)]
                    .filter(Boolean)
                    .join(" · ") || "No details yet"}
                </p>
              </div>
              {writable.includes(c.profileId) && (
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="icon-sm" aria-label={`Edit ${c.name}`} onClick={() => setEditing(c)}>
                    <Pencil />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Delete ${c.name}`} onClick={() => setDeleting(c)}>
                    <Trash2 />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <ClientDialog
          client={editing === "new" ? null : editing}
          profiles={profiles.filter((p) => writable.includes(p.id))}
          onClose={() => setEditing(null)}
        />
      )}

      <AlertDialog open={deleting !== null} onOpenChange={(o) => !pending && !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Invoices and quotes already made for them keep their details — only the saved client goes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                if (!deleting) return;
                startTransition(async () => {
                  const res = await deleteInvoiceClient(deleting.id);
                  if (!res.ok) {
                    reportFailure(res);
                    return;
                  }
                  toast.success("Client deleted.");
                  setDeleting(null);
                  router.refresh();
                });
              }}
            >
              {pending && <Loader2 className="animate-spin" />} Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ClientDialog({
  client,
  profiles,
  onClose,
}: {
  client: InvoiceClientDTO | null;
  profiles: ProfileOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const { reportFailure } = usePlan();
  const [pending, startTransition] = useTransition();
  const [profileId, setProfileId] = useState(client?.profileId ?? profiles[0]?.id ?? "");
  const [name, setName] = useState(client?.name ?? "");
  const [email, setEmail] = useState(client?.email ?? "");
  const [address, setAddress] = useState(client?.address ?? "");
  const [taxId, setTaxId] = useState(client?.taxId ?? "");

  const save = () =>
    startTransition(async () => {
      const fields = { name, email: email || null, address: address || null, taxId: taxId || null };
      const res = client ? await updateInvoiceClient(client.id, fields) : await saveInvoiceClient({ profileId, ...fields });
      if (!res.ok) {
        reportFailure(res);
        return;
      }
      toast.success(client ? "Client saved." : `Added ${res.client.name}.`);
      onClose();
      router.refresh();
    });

  return (
    <Dialog open onOpenChange={(o) => !pending && !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{client ? `Edit ${client.name}` : "New client"}</DialogTitle>
          <DialogDescription>What goes in the &ldquo;Bill to&rdquo; part of an invoice.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {!client && profiles.length > 1 && (
            <SelectField
              label="Profile"
              value={profileId}
              onChange={setProfileId}
              options={profiles.map((p) => ({ value: p.id, label: `${p.icon ? `${p.icon} ` : ""}${p.name}` }))}
            />
          )}
          <TextField label="Name" value={name} onChange={setName} maxLength={DOC_FIELD_LIMITS.name} />
          <TextField label="Email (optional)" value={email} onChange={setEmail} maxLength={DOC_FIELD_LIMITS.email} />
          <TextAreaField label="Address (optional)" value={address} onChange={setAddress} maxLength={DOC_FIELD_LIMITS.address} />
          <TextField label="Tax ID (optional)" value={taxId} onChange={setTaxId} maxLength={DOC_FIELD_LIMITS.taxId} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending || !name.trim()}>
            {pending && <Loader2 className="animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

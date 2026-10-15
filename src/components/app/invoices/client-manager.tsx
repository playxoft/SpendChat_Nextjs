"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, Users } from "lucide-react";
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
import { usePlan } from "@/components/app/upgrade-dialog";
import type { InvoiceClientDTO } from "@/lib/invoice-queries";
import { DOC_FIELD_LIMITS } from "@/lib/invoices";
import { cn } from "@/lib/utils";
import { EmailField, PhoneField, contactProblem } from "./contact-inputs";
import { InvoiceLimitMeter } from "./invoice-limits";
import { PanelEmpty, PanelHeader, SplitView } from "./split-view";

type ProfileOption = { id: string; name: string; icon: string | null };

const profileLabel = (p: ProfileOption) => `${p.icon ? `${p.icon} ` : ""}${p.name}`;

/**
 * Saved clients: who you bill, kept per profile so an invoice can be filled
 * in with a pick. The list on the left; picking one opens it on the right to
 * change or delete, and "New client" fills a blank one in there. Editing or
 * deleting one never changes a document that already went out — those keep
 * their own copy.
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
  // The client open on the right: an id, "new", or nothing.
  const [open, setOpen] = useState<string | null>(null);
  // A client just added, until the refreshed list has it.
  const [added, setAdded] = useState<InvoiceClientDTO | null>(null);
  const canAdd = writable.length > 0 && !limit?.reached;
  const profileName = (id: string) => {
    const p = profiles.find((x) => x.id === id);
    return p ? profileLabel(p) : "";
  };
  const current =
    open && open !== "new" ? (clients.find((c) => c.id === open) ?? (added?.id === open ? added : null)) : null;

  const list = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
          <span>{clients.length === 1 ? "1 client" : `${clients.length} clients`}</span>
          {limit && (
            <>
              <span aria-hidden>·</span>
              <InvoiceLimitMeter kind="clients" used={limit.used} max={limit.max} />
            </>
          )}
        </p>
        {writable.length > 0 &&
          (canAdd ? (
            <Button size="sm" onClick={() => setOpen("new")}>
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
        <ul className="divide-y overflow-hidden rounded-xl border">
          {clients.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setOpen(c.id)}
                aria-current={open === c.id ? "true" : undefined}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none",
                  open === c.id && "bg-muted",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {[
                      c.contactPerson && `Attn: ${c.contactPerson}`,
                      c.email,
                      c.phone,
                      c.taxId && `Tax ID ${c.taxId}`,
                      profiles.length > 1 && profileName(c.profileId),
                    ]
                      .filter(Boolean)
                      .join(" · ") || "No details yet"}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const panel =
    open === "new" ? (
      <ClientForm
        key="new"
        client={null}
        profiles={profiles.filter((p) => writable.includes(p.id))}
        canEdit
        onClose={() => setOpen(null)}
        onSaved={(saved) => {
          setAdded(saved);
          setOpen(saved.id);
        }}
      />
    ) : current ? (
      <ClientForm
        key={current.id}
        client={current}
        profiles={profiles.filter((p) => writable.includes(p.id))}
        canEdit={writable.includes(current.profileId)}
        onClose={() => setOpen(null)}
        onSaved={() => {}}
      />
    ) : (
      <PanelEmpty
        icon={<Users className="size-5" />}
        action={
          canAdd ? (
            <Button size="sm" variant="outline" onClick={() => setOpen("new")}>
              <Plus /> New client
            </Button>
          ) : null
        }
      >
        Pick a client to see or change their details{canAdd ? ", or add a new one" : ""}.
      </PanelEmpty>
    );

  return <SplitView list={list} panel={panel} open={open !== null} label="Client" />;
}

/** A client's details, editable in the panel: a new one, or the one picked in the list. */
function ClientForm({
  client,
  profiles,
  canEdit,
  onClose,
  onSaved,
}: {
  client: InvoiceClientDTO | null;
  /** Where a new client can go (the person's writable profiles). */
  profiles: ProfileOption[];
  canEdit: boolean;
  onClose: () => void;
  onSaved: (client: InvoiceClientDTO) => void;
}) {
  const router = useRouter();
  const { reportFailure } = usePlan();
  const [pending, startTransition] = useTransition();
  const [deleting, setDeleting] = useState(false);
  const [profileId, setProfileId] = useState(client?.profileId ?? profiles[0]?.id ?? "");
  const [name, setName] = useState(client?.name ?? "");
  const [email, setEmail] = useState(client?.email ?? "");
  const [address, setAddress] = useState(client?.address ?? "");
  const [taxId, setTaxId] = useState(client?.taxId ?? "");
  const [phone, setPhone] = useState(client?.phone ?? "");
  const [contactPerson, setContactPerson] = useState(client?.contactPerson ?? "");
  const [notes, setNotes] = useState(client?.notes ?? "");
  // Save is offered once something differs from what's saved (a new client: once it has a name).
  const changed =
    !client ||
    name !== client.name ||
    email !== (client.email ?? "") ||
    address !== (client.address ?? "") ||
    taxId !== (client.taxId ?? "") ||
    phone !== (client.phone ?? "") ||
    contactPerson !== (client.contactPerson ?? "") ||
    notes !== (client.notes ?? "");
  const invalid = contactProblem({ email: [email], phone: [phone] }) !== null;

  const save = () =>
    startTransition(async () => {
      const fields = {
        name,
        email: email || null,
        address: address || null,
        taxId: taxId || null,
        phone: phone || null,
        contactPerson: contactPerson || null,
        notes: notes || null,
      };
      const res = client ? await updateInvoiceClient(client.id, fields) : await saveInvoiceClient({ profileId, ...fields });
      if (!res.ok) {
        reportFailure(res);
        return;
      }
      toast.success(client ? "Client saved." : `Added ${res.client.name}.`);
      onSaved(res.client);
      router.refresh();
    });

  const remove = () =>
    client &&
    startTransition(async () => {
      const res = await deleteInvoiceClient(client.id);
      if (!res.ok) {
        reportFailure(res);
        return;
      }
      toast.success("Client deleted.");
      setDeleting(false);
      onClose();
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <PanelHeader title={client ? client.name : "New client"} onClose={onClose} />
      <p className="-mt-3 text-sm text-muted-foreground">What goes in the &ldquo;Bill to&rdquo; part of an invoice.</p>
      <fieldset disabled={!canEdit || pending} className="space-y-4">
        {!client && profiles.length > 1 && (
          <SelectField
            label="Profile"
            value={profileId}
            onChange={setProfileId}
            options={profiles.map((p) => ({ value: p.id, label: profileLabel(p) }))}
          />
        )}
        <TextField label="Name" placeholder="Person or company" value={name} onChange={setName} maxLength={DOC_FIELD_LIMITS.name} />
        <TextField
          label="Contact person (optional)"
          hint="Printed as “Attn:” under the name."
          value={contactPerson}
          onChange={setContactPerson}
          maxLength={DOC_FIELD_LIMITS.contactPerson}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <EmailField label="Email (optional)" value={email} onChange={setEmail} maxLength={DOC_FIELD_LIMITS.email} />
          <PhoneField label="Phone (optional)" value={phone} onChange={setPhone} maxLength={DOC_FIELD_LIMITS.phone} />
        </div>
        <TextAreaField label="Address (optional)" value={address} onChange={setAddress} maxLength={DOC_FIELD_LIMITS.address} />
        <TextField
          label="Tax ID (optional)"
          placeholder="VAT, GST or EIN number"
          value={taxId}
          onChange={setTaxId}
          maxLength={DOC_FIELD_LIMITS.taxId}
        />
        <TextAreaField
          label="Private notes (optional)"
          placeholder="Payment habits, who approves invoices…"
          hint="Only people in this workspace see these — they never go on a document."
          value={notes}
          onChange={setNotes}
          maxLength={DOC_FIELD_LIMITS.clientNotes}
        />
      </fieldset>

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={save} disabled={pending || !changed || !name.trim() || invalid}>
            {pending && !deleting && <Loader2 className="animate-spin" />} {client ? "Save changes" : "Save client"}
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {client && !changed ? "Close" : "Cancel"}
          </Button>
          {client && (
            <Button variant="ghost" className="ml-auto text-muted-foreground" onClick={() => setDeleting(true)} disabled={pending}>
              <Trash2 /> Delete
            </Button>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">You can view this client; changing it needs edit access to its profile.</p>
      )}

      <AlertDialog open={deleting} onOpenChange={(o) => !pending && setDeleting(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {client?.name}?</AlertDialogTitle>
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
                remove();
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

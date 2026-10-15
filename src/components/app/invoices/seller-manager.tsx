"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, ImagePlus, Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  deleteInvoiceSeller,
  removeInvoiceSellerLogo,
  saveInvoiceSeller,
  setInvoiceSellerLogo,
  updateInvoiceSeller,
} from "@/actions/invoices";
import { redrawLogo } from "@/components/business-doc/logo-image";
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
import { sellerLogoUrl } from "@/lib/invoice-doc";
import { cn } from "@/lib/utils";
import type { InvoiceSellerDTO } from "@/lib/invoice-queries";
import { DOC_FIELD_LIMITS, INVOICE_LOGO_MAX_BYTES, UPI_ID_MAX, isValidUpiId } from "@/lib/invoices";
import { EmailField, PhoneField, contactProblem } from "./contact-inputs";
import { InvoiceLimitMeter } from "./invoice-limits";
import { PanelEmpty, PanelHeader, SplitView } from "./split-view";

type ProfileOption = { id: string; name: string; icon: string | null };

const LOGO_TYPES = /^image\/(?:png|jpeg|gif|webp|svg\+xml)$/;

const profileLabel = (p: ProfileOption) => `${p.icon ? `${p.icon} ` : ""}${p.name}`;

/**
 * "Your details" — the businesses invoices are from. Any number of sets, up to
 * the invoice tier's `sellerDetails`, each saved in a profile with its own logo
 * (stored once and drawn on every document from it). The invoice editor picks
 * among a profile's sets. Editing or deleting a set never changes a document
 * already made — those keep their own copy.
 */
export function SellerManager({
  profiles,
  sellers,
  writable,
  limit,
}: {
  /** Every profile in view, for the labels. */
  profiles: ProfileOption[];
  sellers: InvoiceSellerDTO[];
  /** Profiles the person can add to and edit in. */
  writable: string[];
  /** The tier's cap and use. */
  limit: { used: number; max: number; reached: boolean };
}) {
  const router = useRouter();
  const { reportFailure } = usePlan();
  const [pending, startTransition] = useTransition();
  // The set open on the right: an id, "new", or nothing.
  const [open, setOpen] = useState<string | null>(null);
  // A set just added, until the refreshed list has it.
  const [added, setAdded] = useState<InvoiceSellerDTO | null>(null);
  const [deleting, setDeleting] = useState<InvoiceSellerDTO | null>(null);
  const writableProfiles = profiles.filter((p) => writable.includes(p.id));
  const canAdd = writableProfiles.length > 0 && !limit.reached;
  const profileName = (id: string) => {
    const p = profiles.find((x) => x.id === id);
    return p ? profileLabel(p) : "";
  };
  const current =
    open && open !== "new" ? (sellers.find((s) => s.id === open) ?? (added?.id === open ? added : null)) : null;

  const list = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
          <span>{sellers.length === 1 ? "1 set of details" : `${sellers.length} sets of details`}</span>
          <span aria-hidden>·</span>
          <InvoiceLimitMeter kind="sellers" used={limit.used} max={limit.max} />
        </p>
        {writableProfiles.length > 0 &&
          (canAdd ? (
            <Button size="sm" onClick={() => setOpen("new")}>
              <Plus /> Add details
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              All {limit.max} places are used — delete a set you don&apos;t need to add another.
            </p>
          ))}
      </div>

      {sellers.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-muted">
            <Building2 className="size-5 text-muted-foreground" />
          </span>
          <p className="max-w-sm text-sm text-muted-foreground">
            Save your business name, address, tax ID, UPI ID and logo once, and every invoice starts with them. Run
            more than one business? Save a set for each.
          </p>
        </div>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border">
          {sellers.map((s) => {
            const logo = sellerLogoUrl(s);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setOpen(s.id)}
                  aria-current={open === s.id ? "true" : undefined}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none",
                    open === s.id && "bg-muted",
                  )}
                >
                  {logo ? (
                    // Our own same-origin route; next/image has nothing to optimise.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logo} alt="" className="size-10 shrink-0 rounded-lg border bg-white object-contain p-1" />
                  ) : (
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <Building2 className="size-4 text-muted-foreground" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{s.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {[
                        profiles.length > 1 && profileName(s.profileId),
                        s.address?.split("\n")[0],
                        s.contact,
                        s.phone,
                        s.taxId && `Tax ID ${s.taxId}`,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "No address yet"}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  const panel =
    open === "new" ? (
      <SellerForm
        key="new"
        seller={null}
        profiles={writableProfiles}
        canEdit
        onClose={() => setOpen(null)}
        onSaved={(saved) => {
          // Straight into its own view, where the logo can be added.
          setAdded(saved);
          setOpen(saved.id);
        }}
      />
    ) : current ? (
      <SellerForm
        // Not keyed on the saved copy: a logo change refreshes it, and that
        // mustn't throw away fields still being typed.
        key={current.id}
        seller={current}
        profiles={writableProfiles}
        canEdit={writable.includes(current.profileId)}
        onClose={() => setOpen(null)}
        onSaved={() => {}}
        onDelete={() => setDeleting(current)}
      />
    ) : (
      <PanelEmpty
        icon={<Building2 className="size-5" />}
        action={
          canAdd ? (
            <Button size="sm" variant="outline" onClick={() => setOpen("new")}>
              <Plus /> Add details
            </Button>
          ) : null
        }
      >
        Pick a set of details to see or change it{canAdd ? ", or add one" : ""}.
      </PanelEmpty>
    );

  return (
    <>
      <SplitView list={list} panel={panel} open={open !== null} label="Business details" />
      <AlertDialog open={deleting !== null} onOpenChange={(o) => !pending && !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Invoices and quotes already made keep these details — only the saved set and its logo go.
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
                  const res = await deleteInvoiceSeller(deleting.id);
                  if (!res.ok) {
                    reportFailure(res);
                    return;
                  }
                  toast.success("Details deleted. Documents already made keep theirs.");
                  if (open === deleting.id) setOpen(null);
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
    </>
  );
}

/** The saved copy's value of a field, as the form compares it. */
const saved = (v: string | null | undefined) => v ?? "";

function SellerForm({
  seller,
  profiles,
  canEdit,
  onClose,
  onSaved,
  onDelete,
}: {
  /** null = a new set. */
  seller: InvoiceSellerDTO | null;
  /** Where a new set can go (the person's writable profiles). */
  profiles: ProfileOption[];
  canEdit: boolean;
  onClose: () => void;
  onSaved: (seller: InvoiceSellerDTO) => void;
  /** Ask to delete it (a saved set). */
  onDelete?: () => void;
}) {
  const router = useRouter();
  const { reportFailure } = usePlan();
  const [pending, startTransition] = useTransition();
  const [profileId, setProfileId] = useState(seller?.profileId ?? profiles[0]?.id ?? "");
  const [name, setName] = useState(seller?.name ?? "");
  const [address, setAddress] = useState(saved(seller?.address));
  const [contact, setContact] = useState(saved(seller?.contact));
  const [taxId, setTaxId] = useState(saved(seller?.taxId));
  const [upiId, setUpiId] = useState(saved(seller?.upiId));
  const [phone, setPhone] = useState(saved(seller?.phone));
  const [website, setWebsite] = useState(saved(seller?.website));
  const [registrationNumber, setRegistrationNumber] = useState(saved(seller?.registrationNumber));
  const [bankDetails, setBankDetails] = useState(saved(seller?.bankDetails));
  const fileInput = useRef<HTMLInputElement>(null);
  const upiError = upiId.trim() && !isValidUpiId(upiId.trim()) ? "Enter a UPI ID like name@bank" : null;
  // Shown under the fields themselves; here it only holds the Save back.
  const contactError = contactProblem({ email: [contact], phone: [phone] });
  const logo = seller ? sellerLogoUrl(seller) : null;
  // Save is offered once something differs from what's saved (a new set: once it has a name).
  const changed =
    !seller ||
    name !== seller.name ||
    address !== saved(seller.address) ||
    contact !== saved(seller.contact) ||
    taxId !== saved(seller.taxId) ||
    upiId.trim() !== saved(seller.upiId) ||
    phone !== saved(seller.phone) ||
    website !== saved(seller.website) ||
    registrationNumber !== saved(seller.registrationNumber) ||
    bankDetails !== saved(seller.bankDetails);

  const save = () =>
    startTransition(async () => {
      const fields = {
        name,
        address: address || null,
        contact: contact || null,
        taxId: taxId || null,
        upiId: upiId.trim() || null,
        phone: phone || null,
        website: website || null,
        registrationNumber: registrationNumber || null,
        bankDetails: bankDetails || null,
      };
      const res = seller ? await updateInvoiceSeller(seller.id, fields) : await saveInvoiceSeller({ profileId, ...fields });
      if (!res.ok) {
        reportFailure(res);
        return;
      }
      toast.success(seller ? "Your details are saved." : "Saved — add a logo if you like.");
      onSaved(res.seller);
      router.refresh();
    });

  const pickLogo = (file: File | undefined) => {
    if (!file || !seller) return;
    if (!LOGO_TYPES.test(file.type)) {
      toast.error("Choose a PNG, JPG, WebP, GIF or SVG image for your logo.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("That image is over 2 MB — try a smaller one.");
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => toast.error("Couldn't read that image — try saving it as a PNG.");
    reader.onload = () =>
      startTransition(async () => {
        // Redrawn in the browser to a PNG or JPEG of a sensible size — what the PDF can embed.
        const drawn = typeof reader.result === "string" ? await redrawLogo(reader.result).catch(() => null) : null;
        if (!drawn) {
          toast.error("Couldn't read that image — try saving it as a PNG.");
          return;
        }
        if (drawn.bytes.byteLength > INVOICE_LOGO_MAX_BYTES) {
          toast.error("That logo is still over 300 KB once resized — try a simpler image.");
          return;
        }
        let bin = "";
        for (const b of drawn.bytes) bin += String.fromCharCode(b);
        const res = await setInvoiceSellerLogo(seller.id, btoa(bin));
        if (!res.ok) {
          reportFailure(res);
          return;
        }
        toast.success("Logo saved.");
        router.refresh();
      });
    reader.readAsDataURL(file);
  };

  const removeLogo = () =>
    seller &&
    startTransition(async () => {
      const res = await removeInvoiceSellerLogo(seller.id);
      if (!res.ok) {
        reportFailure(res);
        return;
      }
      toast.success("Logo removed.");
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <PanelHeader title={seller ? seller.name : "New business details"} onClose={onClose} />
      <fieldset disabled={!canEdit || pending} className="space-y-4">
        {!seller && profiles.length > 1 && (
          <SelectField
            label="Profile"
            value={profileId}
            onChange={setProfileId}
            options={profiles.map((p) => ({ value: p.id, label: profileLabel(p) }))}
            hint="Invoices from this profile can use these details."
          />
        )}
        <TextField label="Business or your name" value={name} onChange={setName} maxLength={DOC_FIELD_LIMITS.name} />
        <TextAreaField label="Address (optional)" value={address} onChange={setAddress} maxLength={DOC_FIELD_LIMITS.address} />
        <div className="grid gap-3 sm:grid-cols-2">
          <EmailField
            label="Email (optional)"
            placeholder="billing@yourstudio.com"
            value={contact}
            onChange={setContact}
            maxLength={DOC_FIELD_LIMITS.contact}
          />
          <PhoneField label="Phone (optional)" value={phone} onChange={setPhone} maxLength={DOC_FIELD_LIMITS.phone} />
        </div>
        <TextField
          label="Website (optional)"
          placeholder="yourstudio.com"
          value={website}
          onChange={setWebsite}
          maxLength={DOC_FIELD_LIMITS.website}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Tax ID (optional)"
            placeholder="VAT, GST or EIN number"
            value={taxId}
            onChange={setTaxId}
            maxLength={DOC_FIELD_LIMITS.taxId}
          />
          <TextField
            label="Registration no. (optional)"
            placeholder="CIN, CRN or ABN"
            value={registrationNumber}
            onChange={setRegistrationNumber}
            maxLength={DOC_FIELD_LIMITS.registration}
          />
        </div>
        <TextField
          label="UPI ID (optional)"
          placeholder="name@bank"
          value={upiId}
          onChange={setUpiId}
          maxLength={UPI_ID_MAX}
          error={upiError}
          hint="Rupee invoices get a pay-by-UPI QR code for their total."
        />
        <TextAreaField
          label="Bank details (optional)"
          placeholder="Account name, account number, bank, IFSC / SWIFT / IBAN"
          value={bankDetails}
          onChange={setBankDetails}
          maxLength={DOC_FIELD_LIMITS.bankDetails}
          hint="Printed on invoices under “Bank details”."
        />
      </fieldset>

      {seller && (
        <div>
          <p className="text-sm font-medium">Logo</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="Your logo" className="h-11 max-w-32 rounded-lg border bg-white object-contain p-1" />
            )}
            {canEdit && (
              <>
                <Button type="button" variant="outline" onClick={() => fileInput.current?.click()} disabled={pending}>
                  <ImagePlus /> {logo ? "Change logo" : "Add logo"}
                </Button>
                {logo && (
                  <Button type="button" variant="ghost" className="text-muted-foreground" onClick={removeLogo} disabled={pending}>
                    <X /> Remove
                  </Button>
                )}
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden
                  onChange={(e) => {
                    pickLogo(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </>
            )}
            {!canEdit && !logo && <span className="text-sm text-muted-foreground">No logo</span>}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Stored once and drawn on every document from these details. It counts toward your storage.
          </p>
        </div>
      )}

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={save} disabled={pending || !changed || !name.trim() || Boolean(upiError || contactError)}>
            {pending && <Loader2 className="animate-spin" />} {seller ? "Save changes" : "Save details"}
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {seller && !changed ? "Close" : "Cancel"}
          </Button>
          {seller && onDelete && (
            <Button variant="ghost" className="ml-auto text-muted-foreground" onClick={onDelete} disabled={pending}>
              <Trash2 /> Delete
            </Button>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">You can view these details; changing them needs edit access to their profile.</p>
      )}
    </div>
  );
}

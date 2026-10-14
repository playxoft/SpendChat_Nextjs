"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, ImagePlus, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  deleteInvoiceSeller,
  removeInvoiceSellerLogo,
  saveInvoiceSeller,
  setInvoiceSellerLogo,
  updateInvoiceSeller,
} from "@/actions/invoices";
import { redrawLogo } from "@/components/business-doc/logo-image";
import { TextAreaField, TextField } from "@/components/tools/fields";
import { Button } from "@/components/ui/button";
import { usePlan } from "@/components/app/upgrade-dialog";
import { sellerLogoUrl } from "@/lib/invoice-doc";
import type { InvoiceSellerDTO } from "@/lib/invoice-queries";
import { DOC_FIELD_LIMITS, INVOICE_LOGO_MAX_BYTES, UPI_ID_MAX, isValidUpiId } from "@/lib/invoices";

type ProfileOption = { id: string; name: string; icon: string | null };

const LOGO_TYPES = /^image\/(?:png|jpeg|gif|webp|svg\+xml)$/;

/**
 * "Your details" — the business an invoice is from, saved per profile, with
 * its logo (stored once and drawn on every document from it). One set on the
 * free tier.
 */
export function SellerManager({
  profiles,
  sellers,
  writable,
  limitReached,
}: {
  profiles: ProfileOption[];
  sellers: InvoiceSellerDTO[];
  writable: string[];
  /** No more sets can be added in this workspace. */
  limitReached: boolean;
}) {
  return (
    <div className="space-y-4">
      {profiles.map((p) => {
        const seller = sellers.find((s) => s.profileId === p.id) ?? null;
        const canEdit = writable.includes(p.id);
        if (!seller && !canEdit) return null;
        return (
          <section key={p.id} className="space-y-3 rounded-xl border p-4">
            {profiles.length > 1 && (
              <h2 className="text-sm font-medium text-muted-foreground">
                {p.icon ? `${p.icon} ` : ""}
                {p.name}
              </h2>
            )}
            {seller ? (
              <SellerForm key={seller.id + seller.updatedAt} seller={seller} profileId={p.id} canEdit={canEdit} />
            ) : limitReached ? (
              <p className="text-sm text-muted-foreground">
                This workspace&apos;s invoicing includes one set of business details, and it&apos;s used in another
                profile. Invoices here can still have their details typed in.
              </p>
            ) : (
              <SellerForm seller={null} profileId={p.id} canEdit={canEdit} />
            )}
          </section>
        );
      })}
    </div>
  );
}

function SellerForm({
  seller,
  profileId,
  canEdit,
}: {
  seller: InvoiceSellerDTO | null;
  profileId: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { reportFailure } = usePlan();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(seller?.name ?? "");
  const [address, setAddress] = useState(seller?.address ?? "");
  const [contact, setContact] = useState(seller?.contact ?? "");
  const [taxId, setTaxId] = useState(seller?.taxId ?? "");
  const [upiId, setUpiId] = useState(seller?.upiId ?? "");
  const [open, setOpen] = useState(seller !== null);
  const fileInput = useRef<HTMLInputElement>(null);
  const upiError = upiId.trim() && !isValidUpiId(upiId.trim()) ? "Enter a UPI ID like name@bank" : null;
  const logo = seller ? sellerLogoUrl(seller) : null;

  if (!open) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-muted">
          <Building2 className="size-5 text-muted-foreground" />
        </span>
        <p className="max-w-sm text-sm text-muted-foreground">
          Save your business name, address, tax ID, UPI ID and logo once, and every invoice from this profile
          starts with them.
        </p>
        {canEdit && (
          <Button variant="outline" onClick={() => setOpen(true)}>
            Add your details
          </Button>
        )}
      </div>
    );
  }

  const save = () =>
    startTransition(async () => {
      const fields = {
        name,
        address: address || null,
        contact: contact || null,
        taxId: taxId || null,
        upiId: upiId.trim() || null,
      };
      const res = seller ? await updateInvoiceSeller(seller.id, fields) : await saveInvoiceSeller({ profileId, ...fields });
      if (!res.ok) {
        reportFailure(res);
        return;
      }
      toast.success("Your details are saved.");
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

  const remove = () =>
    seller &&
    startTransition(async () => {
      const res = await deleteInvoiceSeller(seller.id);
      if (!res.ok) {
        reportFailure(res);
        return;
      }
      toast.success("Details deleted. Documents already made keep theirs.");
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <fieldset disabled={!canEdit || pending} className="space-y-4">
        <TextField label="Business or your name" value={name} onChange={setName} maxLength={DOC_FIELD_LIMITS.name} />
        <TextAreaField label="Address" value={address} onChange={setAddress} maxLength={DOC_FIELD_LIMITS.address} />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Email or phone" value={contact} onChange={setContact} maxLength={DOC_FIELD_LIMITS.contact} />
          <TextField
            label="Tax ID (optional)"
            placeholder="VAT, GST or EIN number"
            value={taxId}
            onChange={setTaxId}
            maxLength={DOC_FIELD_LIMITS.taxId}
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
      </fieldset>

      {seller && (
        <div>
          <p className="text-sm font-medium">Logo</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {logo && (
              // Our own same-origin route; next/image has nothing to optimise.
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
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Stored once and drawn on every document from these details. It counts toward your storage.
          </p>
        </div>
      )}

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={save} disabled={pending || !name.trim() || Boolean(upiError)}>
            {pending && <Loader2 className="animate-spin" />} {seller ? "Save changes" : "Save details"}
          </Button>
          {seller ? (
            <Button variant="ghost" className="text-muted-foreground" onClick={remove} disabled={pending}>
              <Trash2 /> Delete
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

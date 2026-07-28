"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateWorkspaceCurrency } from "@/actions/workspaces";
import { CurrencyCombobox } from "./currency-combobox";

const LOCALES = [
  { value: "en-US", label: "English (US) · 1,234.56" },
  { value: "en-GB", label: "English (UK) · 1,234.56" },
  { value: "en-IN", label: "English (India) · 1,23,456" },
  { value: "de-DE", label: "German · 1.234,56" },
  { value: "fr-FR", label: "French · 1 234,56" },
  { value: "es-ES", label: "Spanish · 1.234,56" },
  { value: "pt-BR", label: "Portuguese (BR) · 1.234,56" },
  { value: "ja-JP", label: "Japanese · 1,234" },
];

/**
 * Currency + number format for the current workspace. Shared by everyone in the
 * workspace; only admins can change it (`canEdit`) — others see it read-only.
 */
export function WorkspaceCurrencyForm({
  workspaceId,
  currency,
  locale,
  canEdit,
}: {
  workspaceId: string;
  currency: string;
  locale: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [cur, setCur] = useState(currency);
  const [loc, setLoc] = useState(locale);
  const [pending, startTransition] = useTransition();

  // Re-baseline (and reset edits) whenever the saved workspace settings change.
  const [baseline, setBaseline] = useState({ currency, locale });
  if (baseline.currency !== currency || baseline.locale !== locale) {
    setBaseline({ currency, locale });
    setCur(currency);
    setLoc(locale);
  }

  const dirty = cur !== baseline.currency || loc !== baseline.locale;
  const disabled = !canEdit || pending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    startTransition(async () => {
      const res = await updateWorkspaceCurrency(workspaceId, { currency: cur, locale: loc });
      if (res.ok) {
        toast.success("Workspace currency saved");
        // Re-render the app tree so every amount picks up the new currency /
        // number format immediately, without a full reload.
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleCancel() {
    setCur(baseline.currency);
    setLoc(baseline.locale);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="workspace-currency">Currency</Label>
          <CurrencyCombobox
            id="workspace-currency"
            value={cur}
            onValueChange={setCur}
            disabled={disabled}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Number format</Label>
          <Select value={loc} onValueChange={setLoc} disabled={disabled}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOCALES.map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {canEdit
          ? "Everyone in this workspace sees amounts in this currency. Existing amounts keep their stored value; only how they're displayed changes."
          : "Everyone in this workspace sees amounts in this currency. Only workspace admins can change it."}
      </p>

      {canEdit && (
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={handleCancel} disabled={!dirty || pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={!dirty || pending}>
            Save changes
          </Button>
        </div>
      )}
    </form>
  );
}

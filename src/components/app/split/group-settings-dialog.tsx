"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import { CurrencyCombobox } from "@/components/app/currency-combobox";
import { updateSplitGroup } from "@/actions/split";
import { SPLIT_GROUP_NAME_MAX } from "@/lib/validation";

/** Rename / re-icon a group, and change its currency while it's still empty (creator). */
export function GroupSettingsDialog({
  open,
  onOpenChange,
  group,
  currencyLocked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: { id: string; name: string; icon: string | null; currency: string };
  currencyLocked: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [name, setName] = React.useState(group.name);
  const [icon, setIcon] = React.useState(group.icon ?? "🧾");
  const [currency, setCurrency] = React.useState(group.currency);

  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(group.name);
      setIcon(group.icon ?? "🧾");
      setCurrency(group.currency);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const res = await updateSplitGroup(group.id, {
      name: name.trim(),
      icon,
      ...(currencyLocked ? {} : { currency }),
    }).finally(() => setPending(false));
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Group updated");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Group settings</DialogTitle>
          <DialogDescription>Only you, as the person who created it, can change these.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="split-settings-name">Name & icon</Label>
            <div className="flex items-center gap-2">
              <EmojiPicker
                onSelect={setIcon}
                trigger={
                  <Button type="button" variant="outline" size="icon" aria-label="Pick an icon">
                    <span className="text-base">{icon}</span>
                  </Button>
                }
              />
              <Input
                id="split-settings-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={SPLIT_GROUP_NAME_MAX}
                className="flex-1"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="split-settings-currency">Currency</Label>
            <CurrencyCombobox
              id="split-settings-currency"
              value={currency}
              onValueChange={setCurrency}
              disabled={currencyLocked}
            />
            {currencyLocked && (
              <p className="text-xs text-muted-foreground">
                Fixed once the group has expenses or payments.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

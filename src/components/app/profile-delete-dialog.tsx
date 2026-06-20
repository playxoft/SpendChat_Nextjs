"use client";

import * as React from "react";
import { useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { deleteProfile, moveProfileTransactions } from "@/actions/profiles";
import type { Profile } from "@/db/schema";

export function ProfileDeleteDialog({
  profile,
  others,
  open,
  onOpenChange,
}: {
  profile: Pick<Profile, "id" | "name" | "icon">;
  others: Pick<Profile, "id" | "name" | "icon">[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [target, setTarget] = React.useState(others[0]?.id ?? "");
  const [pending, startTransition] = useTransition();

  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setTarget(others[0]?.id ?? "");
  }

  function handleDelete() {
    startTransition(async () => {
      // Move any transactions to the chosen profile first, then delete.
      if (target) {
        const moved = await moveProfileTransactions(profile.id, target);
        if (!moved.ok) {
          toast.error(moved.error);
          return;
        }
      }
      const res = await deleteProfile(profile.id);
      if (res.ok) {
        toast.success("Profile deleted");
        onOpenChange(false);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete “{profile.name}”?</DialogTitle>
          <DialogDescription>
            Its transactions will be moved to another profile so nothing is lost.
          </DialogDescription>
        </DialogHeader>

        {others.length > 0 ? (
          <div className="space-y-1.5">
            <Label>Move transactions to</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a profile" />
              </SelectTrigger>
              <SelectContent>
                {others.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.icon ? `${p.icon} ` : ""}
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            This is your only profile, so it can’t be deleted.
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={pending || others.length === 0}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

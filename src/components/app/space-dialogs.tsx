"use client";

import * as React from "react";
import { useTransition } from "react";
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
import { EmojiPicker, EmojiPickerPanel } from "@/components/ui/emoji-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createSpace, deleteSpace, moveProfileToSpace, updateSpace } from "@/actions/spaces";
import { DEFAULT_SPACE_ICON, SPACE_NAME_MAX } from "@/lib/validation";
import { usePlan } from "./upgrade-dialog";

/**
 * The sidebar's space dialogs (admin only — the server checks too): create or
 * rename a space, change its icon, delete it (moving its profiles somewhere
 * first), and move one profile into another space. Every plan-limit refusal
 * (too many spaces, a full target space) opens the upgrade dialog instead of a
 * toast.
 */

export type SpaceOption = { id: string; name: string; icon: string | null };

function spaceLabel(s: SpaceOption): string {
  return `${s.icon ? `${s.icon} ` : ""}${s.name}`;
}

export function SpaceFormDialog({
  mode,
  space,
  open,
  onOpenChange,
  onCreated,
}: {
  mode: "create" | "edit";
  space?: SpaceOption;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (id: string) => void;
}) {
  const { reportFailure } = usePlan();
  const [pending, startTransition] = useTransition();
  const [name, setName] = React.useState(space?.name ?? "");
  const [icon, setIcon] = React.useState(space?.icon ?? DEFAULT_SPACE_ICON);

  // Reset each time it opens.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(space?.name ?? "");
      setIcon(space?.icon ?? DEFAULT_SPACE_ICON);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Enter a space name");
      return;
    }
    startTransition(async () => {
      if (mode === "edit" && space) {
        const res = await updateSpace(space.id, { name: trimmed, icon });
        if (!res.ok) return reportFailure(res);
        toast.success("Space updated");
      } else {
        const res = await createSpace({ name: trimmed, icon });
        if (!res.ok) {
          // A plan limit closes this form so the upgrade dialog isn't stacked on it.
          if (res.code === "plan_limit") onOpenChange(false);
          return reportFailure(res);
        }
        toast.success("Space created");
        onCreated?.(res.id);
      }
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Rename space" : "New space"}</DialogTitle>
          <DialogDescription>
            A space groups profiles — Home, Business, Travel… — and decides who sees them.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="space-name">Name & icon</Label>
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
                id="space-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Space name"
                maxLength={SPACE_NAME_MAX}
                autoFocus
                className="flex-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {mode === "edit" ? "Save" : "Create space"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Pick a new emoji for a space (or clear it). */
export function SpaceIconDialog({
  space,
  open,
  onOpenChange,
}: {
  space: SpaceOption;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { reportFailure } = usePlan();
  const [pending, startTransition] = useTransition();

  function save(icon: string | null) {
    startTransition(async () => {
      const res = await updateSpace(space.id, { icon });
      if (!res.ok) return reportFailure(res);
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-auto sm:max-w-fit" closeOnOutsideClick>
        <DialogHeader>
          <DialogTitle>Change icon</DialogTitle>
          <DialogDescription>For the {space.name} space.</DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border">
          <EmojiPickerPanel onSelect={(v) => save(v)} />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            disabled={pending || !space.icon}
            onClick={() => save(null)}
          >
            Remove icon
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Delete a space. An empty one just goes (after a confirm); one with profiles
 * asks where they should move first — profiles are never deleted with a space.
 */
export function SpaceDeleteDialog({
  space,
  profileCount,
  others,
  open,
  onOpenChange,
}: {
  space: SpaceOption;
  /** Profiles in the space (all of them — the server moves every one). */
  profileCount: number;
  /** The workspace's other spaces — where profiles can move. */
  others: SpaceOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { reportFailure } = usePlan();
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = React.useState(others[0]?.id ?? "");

  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setTarget(others[0]?.id ?? "");
  }

  const hasProfiles = profileCount > 0;
  const lastSpace = others.length === 0;

  function handleDelete() {
    if (hasProfiles && !target) {
      toast.error("Pick a space for its profiles");
      return;
    }
    startTransition(async () => {
      const res = await deleteSpace(space.id, hasProfiles ? { moveProfilesTo: target } : {});
      if (!res.ok) {
        if (res.code === "plan_limit") onOpenChange(false);
        return reportFailure(res);
      }
      toast.success("Space deleted");
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete “{space.name}”?</DialogTitle>
          <DialogDescription>
            {lastSpace
              ? "A workspace needs at least one space, so this one can't be deleted."
              : hasProfiles
                ? `Its ${profileCount === 1 ? "profile moves" : `${profileCount} profiles move`} to the space you pick, with all their transactions. People in this space lose access to them unless they're in that space too.`
                : "The space is empty. People in it are taken out; nothing else changes."}
          </DialogDescription>
        </DialogHeader>
        {!lastSpace && hasProfiles && (
          <div className="space-y-1.5">
            <Label htmlFor="space-delete-target">Move profiles to</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger id="space-delete-target" className="w-full">
                <SelectValue placeholder="Pick a space" />
              </SelectTrigger>
              <SelectContent>
                {others.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {spaceLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {!lastSpace && (
            <Button type="button" variant="destructive" disabled={pending} onClick={handleDelete}>
              {hasProfiles ? "Move profiles and delete" : "Delete space"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Move one profile into another space of the workspace (admin). */
export function MoveProfileDialog({
  profile,
  spaces,
  open,
  onOpenChange,
}: {
  profile: { id: string; name: string; spaceId: string };
  /** Every space in the workspace (admins see them all). */
  spaces: SpaceOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { reportFailure } = usePlan();
  const [pending, startTransition] = useTransition();
  const others = spaces.filter((s) => s.id !== profile.spaceId);
  const [target, setTarget] = React.useState(others[0]?.id ?? "");

  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setTarget(others[0]?.id ?? "");
  }

  function handleMove() {
    if (!target) return;
    startTransition(async () => {
      const res = await moveProfileToSpace(profile.id, target);
      if (!res.ok) {
        if (res.code === "plan_limit") onOpenChange(false);
        return reportFailure(res);
      }
      const to = spaces.find((s) => s.id === target);
      toast.success(to ? `Moved to ${to.name}` : "Profile moved");
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Move “{profile.name}”</DialogTitle>
          <DialogDescription>
            Its transactions and files move with it. Who can see it follows the new space —
            plus anyone with their own access setting on this profile.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="move-profile-target">Move to</Label>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger id="move-profile-target" className="w-full">
              <SelectValue placeholder="Pick a space" />
            </SelectTrigger>
            <SelectContent>
              {others.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {spaceLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={pending || !target} onClick={handleMove}>
            Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addProfile, updateProfile } from "@/actions/profiles";
import { usePlan } from "./upgrade-dialog";
import type { Profile } from "@/db/schema";

type SpaceOption = { id: string; name: string; icon: string | null };

export function ProfileFormDialog({
  mode,
  profile,
  open,
  onOpenChange,
  spaces = [],
  defaultSpaceId,
}: {
  mode: "add" | "edit";
  profile?: Pick<Profile, "id" | "name" | "icon">;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Add mode: the spaces it can go in, in sidebar order. A picker shows when there's a choice. */
  spaces?: SpaceOption[];
  /** Add mode: the space whose "+" was clicked; else the first space. */
  defaultSpaceId?: string;
}) {
  const { reportFailure } = usePlan();
  const [name, setName] = React.useState(profile?.name ?? "");
  const [icon, setIcon] = React.useState(profile?.icon ?? "👤");
  const initialSpace = () =>
    (defaultSpaceId && spaces.some((s) => s.id === defaultSpaceId) ? defaultSpaceId : spaces[0]?.id) ?? "";
  const [spaceId, setSpaceId] = React.useState(initialSpace);
  const [pending, startTransition] = useTransition();

  // Reset fields each time the dialog opens.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(profile?.name ?? "");
      setIcon(profile?.icon ?? "👤");
      setSpaceId(initialSpace());
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Enter a profile name");
      return;
    }
    startTransition(async () => {
      const res =
        mode === "edit" && profile
          ? await updateProfile({ id: profile.id, name: trimmed, icon })
          : await addProfile({ name: trimmed, icon, ...(spaceId ? { spaceId } : {}) });
      if (res.ok) {
        toast.success(mode === "edit" ? "Profile updated" : "Profile added");
        onOpenChange(false);
      } else {
        // A full space (plan limit) opens the upgrade dialog; keep this form
        // open underneath so another space can be picked.
        reportFailure(res);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Edit profile" : "New profile"}</DialogTitle>
          <DialogDescription>
            Profiles group transactions like separate chats (Personal, Company, Home…).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name & icon</Label>
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
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Profile name"
                maxLength={20}
                autoFocus
                className="flex-1"
              />
            </div>
          </div>
          {mode === "add" && spaces.length > 1 && (
            <div className="space-y-1.5">
              <Label htmlFor="profile-space">Space</Label>
              <Select value={spaceId} onValueChange={setSpaceId}>
                <SelectTrigger id="profile-space" className="w-full">
                  <SelectValue placeholder="Pick a space" />
                </SelectTrigger>
                <SelectContent>
                  {spaces.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.icon ? `${s.icon} ` : ""}
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {mode === "edit" ? "Save changes" : "Add profile"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

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
import { useLoadingOverlay } from "./loading-overlay";
import { usePlan } from "./upgrade-dialog";
import { LimitPanel, LockedButton, useAddLimits, useAddLock } from "./limit-lock";
import { createWorkspace } from "@/actions/workspaces";
import { DEFAULT_WORKSPACE_ICON, WORKSPACE_NAME_MAX } from "@/lib/validation";
import { newWorkspaceLock } from "@/lib/add-limits";
import { planLimitOf } from "@/lib/plan-limit";

/**
 * Modal for creating a new workspace. Reused by the sidebar workspace switcher,
 * the workspace settings page and the organisation page. An outside click never
 * dismisses it (the dialog's app-wide default), so a stray click can't lose a
 * half-typed name. Someone who already owns a free workspace sees why up front
 * (one free workspace per person) and can't submit.
 */
export function CreateWorkspaceDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Runs after a successful create (e.g. to close a parent menu). */
  onCreated?: () => void;
}) {
  const router = useRouter();
  const { run, pending } = useLoadingOverlay();
  const { handlePlanLimit, showUpgrade, plan } = usePlan();
  const limits = useAddLimits();
  const lock = useAddLock("workspaces");
  const [name, setName] = React.useState("");
  const [icon, setIcon] = React.useState(DEFAULT_WORKSPACE_ICON);

  // Reset fields each time the dialog opens.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName("");
      setIcon(DEFAULT_WORKSPACE_ICON);
    }
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (lock) return showUpgrade(lock.info);
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Enter a workspace name");
      return;
    }
    // Full-screen loader covers the create + switch into the new workspace.
    run(async () => {
      const res = await createWorkspace(trimmed, icon);
      if (res.ok) {
        toast.success("Workspace created");
        onOpenChange(false);
        setName("");
        setIcon(DEFAULT_WORKSPACE_ICON);
        onCreated?.();
        router.push("/app");
        router.refresh();
      } else if (res.code === "plan_limit") {
        // One free workspace per person: explain it in the upgrade dialog
        // rather than leaving this form up with an error toast. The server
        // calls it `freeWorkspaces` (as it does a view-only workspace); here
        // it's about creating one, so it gets the "New workspace" words.
        onOpenChange(false);
        const refused = planLimitOf(res);
        if (refused?.limit === "freeWorkspaces") {
          showUpgrade(
            limits
              ? newWorkspaceLock(limits).info
              : { ...refused, limit: "newWorkspace", plan },
          );
        } else if (!handlePlanLimit(res)) {
          toast.error(res.error);
        }
      } else {
        toast.error(res.error);
      }
    }, "Creating workspace…");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New workspace</DialogTitle>
          <DialogDescription>
            A workspace has its own profiles and members — handy for a company,
            a family, or a side project.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleCreate} className="space-y-4">
          <LimitPanel lock={lock} />
          <div className="space-y-1.5">
            <Label htmlFor="workspace-name">Name & icon</Label>
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
                id="workspace-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Acme Inc."
                maxLength={WORKSPACE_NAME_MAX}
                autoFocus
                className="flex-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <LockedButton type="submit" lock={lock} disabled={pending}>
              Create
            </LockedButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

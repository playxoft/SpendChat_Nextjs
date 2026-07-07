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
import { useLoadingOverlay } from "./loading-overlay";
import { createWorkspace } from "@/actions/workspaces";

/**
 * Modal for creating a new workspace. Reused by the sidebar workspace switcher
 * and the workspace settings page. An outside click never dismisses it (the
 * dialog's app-wide default), so a stray click can't lose a half-typed name.
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
  const [name, setName] = React.useState("");

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Enter a workspace name");
      return;
    }
    // Full-screen loader covers the create + switch into the new workspace.
    run(async () => {
      const res = await createWorkspace(trimmed);
      if (res.ok) {
        toast.success("Workspace created");
        onOpenChange(false);
        setName("");
        onCreated?.();
        router.push("/app");
        router.refresh();
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
          <div className="space-y-1.5">
            <Label htmlFor="workspace-name">Name</Label>
            <Input
              id="workspace-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Inc."
              maxLength={60}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

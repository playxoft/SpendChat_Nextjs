"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, Check, ChevronsUpDown, Plus, Settings2 } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createWorkspace, switchWorkspace } from "@/actions/workspaces";
import type { WorkspaceRole } from "@/db/schema";

export type WorkspaceOption = {
  id: string;
  name: string;
  /** Workspace-wide role; null = access via shared profiles only. */
  role: WorkspaceRole | null;
};

/**
 * The workspace dropdown at the top of the left nav: switch between
 * workspaces, jump to workspace settings, or create a new one.
 */
export function WorkspaceSwitcher({
  workspaces,
  currentId,
  onNavigate,
}: {
  workspaces: WorkspaceOption[];
  currentId: string;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [name, setName] = React.useState("");

  const current = workspaces.find((w) => w.id === currentId) ?? workspaces[0];

  function handleSwitch(id: string) {
    if (id === currentId) return;
    startTransition(async () => {
      const res = await switchWorkspace(id);
      if (res.ok) {
        onNavigate?.();
        router.push("/app");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Enter a workspace name");
      return;
    }
    startTransition(async () => {
      const res = await createWorkspace(trimmed);
      if (res.ok) {
        toast.success("Workspace created");
        setCreateOpen(false);
        setName("");
        onNavigate?.();
        router.push("/app");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            disabled={pending}
            className="h-auto w-full justify-start gap-2 px-2 py-1.5"
            aria-label="Switch workspace"
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-accent">
              <Building2 className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1 truncate text-left text-sm font-medium">
              {current?.name ?? "Workspace"}
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Workspaces
          </DropdownMenuLabel>
          {workspaces.map((w) => (
            <DropdownMenuItem
              key={w.id}
              onSelect={() => handleSwitch(w.id)}
              className="gap-2"
            >
              <span className="min-w-0 flex-1 truncate">{w.name}</span>
              {w.role === null && (
                <span className="text-[10px] text-muted-foreground">shared</span>
              )}
              <Check className={cn("size-4", w.id === currentId ? "opacity-100" : "opacity-0")} />
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/settings/workspace" onClick={() => onNavigate?.()}>
              <Settings2 className="size-4" />
              Workspace settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            New workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
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
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

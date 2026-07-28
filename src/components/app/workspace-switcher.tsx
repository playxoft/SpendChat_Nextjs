"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, Check, ChevronsUpDown, Plus, Settings2 } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { comboFor } from "@/lib/shortcuts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CreateWorkspaceDialog } from "./create-workspace-dialog";
import { useLoadingOverlay } from "./loading-overlay";
import { usePermissions } from "./permissions";
import { switchWorkspace } from "@/actions/workspaces";
import type { WorkspaceRole } from "@/db/schema";

/** Label for a workspace-wide role; grant-only access (null) reads as "shared". */
function roleLabel(role: WorkspaceRole | null): string {
  return role ?? "shared";
}

export type WorkspaceOption = {
  id: string;
  name: string;
  /** Emoji shown beside the name; null falls back to a neutral glyph. */
  icon: string | null;
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
  showShortcut = false,
}: {
  workspaces: WorkspaceOption[];
  currentId: string;
  onNavigate?: () => void;
  /** Show the `g` hint on the trigger — the sidebar does, the mobile sheet doesn't. */
  showShortcut?: boolean;
}) {
  const router = useRouter();
  const { run, pending } = useLoadingOverlay();
  const { canWrite } = usePermissions();
  const [createOpen, setCreateOpen] = React.useState(false);

  const current = workspaces.find((w) => w.id === currentId) ?? workspaces[0];

  function handleSwitch(id: string) {
    if (id === currentId) return;
    // Run through the overlay provider so a full-screen loader covers the whole
    // switch (and survives the mobile sheet unmounting) instead of hanging.
    run(
      async () => {
        const res = await switchWorkspace(id);
        if (res.ok) {
          onNavigate?.();
          router.push("/app");
          router.refresh();
        } else {
          toast.error(res.error);
        }
      },
      "Switching workspace…",
      { variant: "spinner" },
    );
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
              {current?.icon ? (
                <span className="text-sm leading-none">{current.icon}</span>
              ) : (
                <Building2 className="size-3.5" />
              )}
            </span>
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-sm leading-tight font-medium">
                {current?.name ?? "Workspace"}
              </span>
              {current && (
                <span className="block truncate text-xs leading-tight text-muted-foreground capitalize">
                  {roleLabel(current.role)}
                </span>
              )}
            </span>
            {/* Teaches the `g` picker (WorkspaceSwitchDialog) from the place
                people already go to switch. Desktop only — no keyboard on
                mobile — and only when there's more than one workspace, which is
                the same condition that binds the key. */}
            {showShortcut && workspaces.length > 1 && (
              <Kbd combo={comboFor("workspace.switch")} className="hidden shrink-0 sm:inline-flex" />
            )}
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
              <span aria-hidden className="w-5 shrink-0 text-center text-sm leading-none">
                {w.icon ?? ""}
              </span>
              <span className="min-w-0 flex-1 truncate">{w.name}</span>
              <span className="shrink-0 text-sm text-muted-foreground capitalize">
                {roleLabel(w.role)}
              </span>
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
          {canWrite && (
            <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              New workspace
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateWorkspaceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={onNavigate}
      />
    </>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronRight, Plus, Settings2 } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
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
import { DEFAULT_WORKSPACE_ICON } from "@/lib/validation";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useAccount } from "./account-controls";
import { CreateWorkspaceDialog } from "./create-workspace-dialog";
import { useLoadingOverlay } from "./loading-overlay";
import { usePermissions } from "./permissions";
import { PlanBadge } from "./plan-badge";
import { LimitTooltip, LockGlyph, useAddLock } from "./limit-lock";
import { switchWorkspace } from "@/actions/workspaces";
import type { WorkspaceRole } from "@/db/schema";
import type { PersonalPlan } from "@/lib/plans";

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
  /** The workspace's plan — shown as a small badge beside it. */
  plan: PersonalPlan;
};

/**
 * The workspace's name at the top of the left nav, with a `>` after it: a click
 * (or Enter) opens every workspace — the current one ticked, picking another
 * switches to it — then New workspace and Workspace settings. It opens beside
 * the sidebar, the way the `>` points; in the phone's profile sheet, below the
 * name, where there's room. It sits with the spaces and profiles it holds, so
 * "which workspace am I in" and "change it" are the same place; the account
 * menu (top right) is only about you.
 *
 * `workspace` is what the server labelled the sidebar with, so the name shows
 * even outside the app layout's account context — there it's a plain label.
 * `onNavigate` closes a containing sheet when the menu sends you somewhere.
 */
export function WorkspaceMenu({
  workspace,
  onNavigate,
}: {
  workspace: { name: string; icon: string | null };
  onNavigate?: () => void;
}) {
  const account = useAccount();
  const router = useRouter();
  const { run, pending } = useLoadingOverlay();
  const { canWrite } = usePermissions();
  // One free workspace per person: the item still opens the form, which explains.
  const createLock = useAddLock("workspaces");
  const isMobile = useIsMobile();
  const [createOpen, setCreateOpen] = useState(false);

  const label = (
    <>
      <span aria-hidden className="shrink-0 text-base leading-none">
        {workspace.icon ?? DEFAULT_WORKSPACE_ICON}
      </span>
      <span className="min-w-0 flex-1 truncate">
        <span className="sr-only">Workspace: </span>
        {workspace.name}
      </span>
    </>
  );

  if (!account) {
    return (
      <span className="flex min-w-0 items-center gap-2 px-1.5 py-1.5 text-sm font-medium text-foreground">
        {label}
      </span>
    );
  }

  const { workspaces, currentWorkspaceId: currentId } = account;

  function handleSwitch(id: string) {
    if (id === currentId) return;
    // Through the overlay provider, so a full-screen loader covers the whole
    // switch — and outlives the phone's sheet closing under it.
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
          <button
            type="button"
            disabled={pending}
            className="group flex w-full min-w-0 items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-sm font-medium text-foreground outline-none hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60 data-[state=open]:bg-accent"
          >
            {label}
            <span className="sr-only">, switch workspace</span>
            <ChevronRight
              aria-hidden
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform group-hover:text-foreground",
                // Below the name on a phone, so the `>` turns to point at it.
                isMobile && "group-data-[state=open]:rotate-90",
              )}
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side={isMobile ? "bottom" : "right"}
          align="start"
          sideOffset={isMobile ? 4 : 10}
          className="min-w-64 max-w-[min(20rem,calc(100vw-1rem))] p-1.5"
        >
          <DropdownMenuLabel className="flex items-center justify-between gap-2 px-2 text-xs font-normal text-muted-foreground">
            Workspaces
            {/* Teaches the `g` picker (WorkspaceSwitchDialog) where people come
                to switch. Bound only with more than one workspace, so shown
                only then; keyboards only. */}
            {workspaces.length > 1 && (
              <Kbd combo={comboFor("workspace.switch")} className="opacity-70 pointer-coarse:hidden" />
            )}
          </DropdownMenuLabel>
          {workspaces.map((w) => (
            <DropdownMenuItem
              key={w.id}
              onSelect={() => handleSwitch(w.id)}
              aria-current={w.id === currentId ? "true" : undefined}
              className="cursor-pointer gap-2 px-2 py-2"
            >
              <span aria-hidden className="w-5 shrink-0 text-center text-sm leading-none">
                {w.icon ?? DEFAULT_WORKSPACE_ICON}
              </span>
              <span className="min-w-0 flex-1 truncate">{w.name}</span>
              <PlanBadge plan={w.plan} />
              <span className="shrink-0 text-xs text-muted-foreground capitalize">{roleLabel(w.role)}</span>
              <Check className={cn("size-4", w.id === currentId ? "opacity-100" : "opacity-0")} />
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          {canWrite && (
            <LimitTooltip lock={createLock} side={isMobile ? "bottom" : "right"}>
              <DropdownMenuItem onSelect={() => setCreateOpen(true)} className="cursor-pointer px-2 py-2">
                <Plus className="size-4" />
                New workspace
                {createLock && <LockGlyph className="ml-auto" />}
              </DropdownMenuItem>
            </LimitTooltip>
          )}
          <DropdownMenuItem asChild className="px-2 py-2">
            <Link href="/app/settings/workspace" onClick={() => onNavigate?.()} className="cursor-pointer">
              <Settings2 className="size-4" />
              Workspace settings
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Outside the menu: its content unmounts the moment it closes. */}
      <CreateWorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={onNavigate} />
    </>
  );
}

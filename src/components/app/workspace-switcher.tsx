"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Plus, Settings2 } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Kbd } from "@/components/ui/kbd";
import { comboFor } from "@/lib/shortcuts";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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
 * The workspace section of the account menu (top right): every workspace with
 * the current one ticked, then Workspace settings and New workspace. It used to
 * be its own dropdown at the top of the left nav; switching workspace is rare
 * next to switching profile, so it moved in with the rest of "you and your
 * account", and the sidebar starts with the spaces.
 *
 * Renders bare menu items — the caller's `DropdownMenuContent` holds them. The
 * create dialog (`CreateWorkspaceDialog`) is rendered by the caller, outside the menu,
 * because the menu's content unmounts the moment it closes.
 */
export function WorkspaceMenuItems({
  workspaces,
  currentId,
  onCreate,
}: {
  workspaces: WorkspaceOption[];
  currentId: string;
  /** Open the "New workspace" form (rendered by the caller, outside the menu). */
  onCreate: () => void;
}) {
  const router = useRouter();
  const { run } = useLoadingOverlay();
  const { canWrite } = usePermissions();
  // One free workspace per person: the item still opens the form, which explains.
  const createLock = useAddLock("workspaces");

  function handleSwitch(id: string) {
    if (id === currentId) return;
    // Through the overlay provider, so a full-screen loader covers the whole
    // switch instead of the closed menu leaving nothing on screen.
    run(
      async () => {
        const res = await switchWorkspace(id);
        if (res.ok) {
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
      <DropdownMenuLabel className="flex items-center justify-between gap-2 px-2 text-xs font-normal text-muted-foreground">
        Workspaces
        {/* Teaches the `g` picker (WorkspaceSwitchDialog) where people come to
            switch. Bound only with more than one workspace, so shown only then;
            no keyboard on a phone. */}
        {workspaces.length > 1 && (
          <Kbd combo={comboFor("workspace.switch")} className="hidden opacity-70 sm:inline-flex" />
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
            {w.icon ?? ""}
          </span>
          <span className="min-w-0 flex-1 truncate">{w.name}</span>
          <PlanBadge plan={w.plan} />
          <span className="shrink-0 text-xs text-muted-foreground capitalize">{roleLabel(w.role)}</span>
          <Check className={cn("size-4", w.id === currentId ? "opacity-100" : "opacity-0")} />
        </DropdownMenuItem>
      ))}
      <DropdownMenuItem asChild className="px-2 py-2">
        <Link href="/app/settings/workspace" className="cursor-pointer">
          <Settings2 className="size-4" />
          Workspace settings
        </Link>
      </DropdownMenuItem>
      {canWrite && (
        <LimitTooltip lock={createLock} side="left">
          <DropdownMenuItem onSelect={onCreate} className="cursor-pointer px-2 py-2">
            <Plus className="size-4" />
            New workspace
            {createLock && <LockGlyph className="ml-auto" />}
          </DropdownMenuItem>
        </LimitTooltip>
      )}
      <DropdownMenuSeparator />
    </>
  );
}

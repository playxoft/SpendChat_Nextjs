"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronDown, Plus, Settings2 } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Kbd } from "@/components/ui/kbd";
import { comboFor } from "@/lib/shortcuts";
import {
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { DEFAULT_WORKSPACE_ICON } from "@/lib/validation";
import { useIsMobile } from "@/hooks/use-is-mobile";
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
 * The workspace row of the account menu (top right): one submenu trigger
 * naming the current workspace — its icon, its name and the `g` hint — that
 * opens, on hover, a tap, → or Enter, onto every workspace (the current one
 * ticked; picking another switches to it), then New workspace and Workspace
 * settings. On a phone the row unfolds that list in place instead. The account
 * menu stays short however many workspaces someone is in, and the list is one
 * step away. It used to be its own dropdown at the top
 * of the left nav; switching workspace is rare next to switching profile, so it
 * moved in with the rest of "you and your account" — the sidebar only labels
 * the current one (`ProfileList`).
 *
 * Renders a `DropdownMenuSub` (a phone: a row and its list) — the caller's
 * `DropdownMenuContent` holds it.
 * The create dialog (`CreateWorkspaceDialog`) is rendered by the caller,
 * outside the menu, because the menu's content unmounts the moment it closes.
 */
export function WorkspaceSubmenu({
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
  const current = workspaces.find((w) => w.id === currentId) ?? workspaces[0];
  const isMobile = useIsMobile();
  const [unfolded, setUnfolded] = useState(false);

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

  if (!current) return null;

  const items = (
    <>
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
        <LimitTooltip lock={createLock} side="left">
          <DropdownMenuItem onSelect={onCreate} className="cursor-pointer px-2 py-2">
            <Plus className="size-4" />
            New workspace
            {createLock && <LockGlyph className="ml-auto" />}
          </DropdownMenuItem>
        </LimitTooltip>
      )}
      <DropdownMenuItem asChild className="px-2 py-2">
        <Link href="/app/settings/workspace" className="cursor-pointer">
          <Settings2 className="size-4" />
          Workspace settings
        </Link>
      </DropdownMenuItem>
    </>
  );

  const name = (
    <>
      <span aria-hidden className="w-5 shrink-0 text-center text-sm leading-none">
        {current.icon ?? DEFAULT_WORKSPACE_ICON}
      </span>
      <span className="min-w-0 flex-1 truncate">
        <span className="sr-only">Workspace: </span>
        {current.name}
      </span>
    </>
  );

  // A phone has no room beside a menu pinned to its right edge — a side
  // submenu would open off-screen — so there the row unfolds the list in place.
  if (isMobile) {
    return (
      <>
        <DropdownMenuItem
          aria-expanded={unfolded}
          // Keep the menu open: the row only shows or hides the list under it.
          onSelect={(e) => {
            e.preventDefault();
            setUnfolded((u) => !u);
          }}
          className="cursor-pointer gap-2 px-2 py-2"
        >
          {name}
          <ChevronDown
            aria-hidden
            className={cn("size-4 text-muted-foreground transition-transform", unfolded && "rotate-180")}
          />
        </DropdownMenuItem>
        {unfolded && <div className="mx-1 mb-1 rounded-md border bg-muted/30 p-1">{items}</div>}
      </>
    );
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="cursor-pointer gap-2 px-2 py-2">
        {name}
        {/* Teaches the `g` picker (WorkspaceSwitchDialog) where people come to
            switch. Bound only with more than one workspace, so shown only then. */}
        {workspaces.length > 1 && <Kbd combo={comboFor("workspace.switch")} className="opacity-70" />}
      </DropdownMenuSubTrigger>
      {/* Portalled, as Radix documents for submenus, so the account menu's own
          scroll box can't clip it. Capped to the room on screen, scrolling past
          it; names are truncated rather than stretching it. */}
      <DropdownMenuPortal>
        <DropdownMenuSubContent
          sideOffset={8}
          alignOffset={-6}
          className="max-h-(--radix-dropdown-menu-content-available-height) min-w-64 max-w-[min(20rem,calc(100vw-1rem))] overflow-x-hidden overflow-y-auto p-1.5"
        >
          {items}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}

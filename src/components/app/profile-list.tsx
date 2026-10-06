"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  FolderInput,
  FolderPlus,
  GripVertical,
  LayoutGrid,
  MoreHorizontal,
  MoreVertical,
  Pencil,
  Plus,
  Smile,
  Trash2,
  Users,
} from "lucide-react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProfileFormDialog } from "./profile-form-dialog";
import { ProfileDeleteDialog } from "./profile-delete-dialog";
import { SpaceAccessDialog } from "./space-access-dialog";
import {
  MoveProfileDialog,
  SpaceDeleteDialog,
  SpaceFormDialog,
  SpaceIconDialog,
} from "./space-dialogs";
import { useLoadingOverlay } from "./loading-overlay";
import { usePermissions } from "./permissions";
import { usePlan } from "./upgrade-dialog";
import { LimitTooltip, LockBadge, useAddLimits } from "./limit-lock";
import { Kbd } from "@/components/ui/kbd";
import { reorderProfiles } from "@/actions/profiles";
import { reorderSpaces } from "@/actions/spaces";
import { useCollapsedSpaces } from "@/hooks/use-collapsed-spaces";
import { useShortcut } from "@/hooks/use-shortcut";
import { comboFor } from "@/lib/shortcuts";
import {
  flattenGroups,
  groupProfilesBySpace,
  moveSpace,
  profileOrderAfterReorder,
  profileShortcut,
} from "@/lib/sidebar-spaces";
import { DEFAULT_SPACE_ICON } from "@/lib/validation";
import { addLock, type AddLock } from "@/lib/add-limits";
import { cn } from "@/lib/utils";
import type { Profile, WorkspaceRole } from "@/db/schema";

export type SidebarProfile = Pick<Profile, "id" | "name" | "icon" | "spaceId">;

/** A space as the sidebar shows it — what `listSpaces` returns. */
export type SidebarSpace = {
  id: string;
  name: string;
  icon: string | null;
  position: number;
  /** Every profile in it (what the per-space cap counts), not just the visible ones. */
  profileCount: number;
  /** The caller's role here: "admin" for workspace admins, else their space role or null. */
  role: WorkspaceRole | null;
};

type P = SidebarProfile;

// Hover-revealed controls on a mouse; always shown on touch, where there's no hover.
const REVEAL =
  "pointer-fine:opacity-0 pointer-fine:transition-opacity pointer-fine:duration-200 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100 pointer-fine:aria-expanded:opacity-100 pointer-fine:has-[[aria-expanded=true]]:opacity-100";

/**
 * The sidebar's profile tree: the workspace's spaces as collapsible groups
 * (Notion-style), each holding its profiles, then "All profiles". Members see
 * only the spaces `listSpaces` gives them; workspace admins see every space and
 * get the create / rename / reorder / access / delete controls.
 *
 * Shift+1…0 count through the profiles in sidebar order — spaces top to bottom,
 * profiles within each — and keep working when a space is folded, so folding
 * one never renumbers the rest.
 */
export function ProfileList({
  profiles,
  spaces,
  collapsedSpaces,
  onNavigate,
  enableShortcuts = false,
}: {
  profiles: P[];
  spaces: SidebarSpace[];
  /** `ui_prefs.sidebar.collapsedSpaces` — folded spaces, across every workspace. */
  collapsedSpaces: string[];
  onNavigate?: () => void;
  /** Bind + show Shift+1…0 shortcuts (desktop sidebar only, to avoid double-binding). */
  enableShortcuts?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const { runQuiet } = useLoadingOverlay();
  const { canManage } = usePermissions();
  const { reportFailure } = usePlan();
  const addLimits = useAddLimits();
  const [, startTransition] = useTransition();

  const [items, setItems] = React.useState<P[]>(profiles);
  const [spaceItems, setSpaceItems] = React.useState<SidebarSpace[]>(spaces);
  // Re-sync from the server after revalidation.
  const [synced, setSynced] = React.useState({ profiles, spaces });
  if (profiles !== synced.profiles || spaces !== synced.spaces) {
    setSynced({ profiles, spaces });
    setItems(profiles);
    setSpaceItems(spaces);
  }

  const { collapsed, setCollapsed } = useCollapsedSpaces(collapsedSpaces);
  const collapsedSet = React.useMemo(() => new Set(collapsed), [collapsed]);

  const { groups, orphans } = React.useMemo(
    () => groupProfilesBySpace(spaceItems, items),
    [spaceItems, items],
  );
  const ordered = React.useMemo(() => flattenGroups(groups, orphans), [groups, orphans]);
  const shortcutOf = React.useMemo(
    () => new Map(ordered.map((p, i) => [p.id, enableShortcuts ? profileShortcut(i) : ""])),
    [ordered, enableShortcuts],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Dialogs.
  const [adding, setAdding] = React.useState<{ spaceId?: string } | null>(null);
  const [editing, setEditing] = React.useState<P | null>(null);
  const [deleting, setDeleting] = React.useState<P | null>(null);
  const [moving, setMoving] = React.useState<P | null>(null);
  const [newSpaceOpen, setNewSpaceOpen] = React.useState(false);
  const [renamingSpace, setRenamingSpace] = React.useState<SidebarSpace | null>(null);
  const [iconSpace, setIconSpace] = React.useState<SidebarSpace | null>(null);
  const [accessSpace, setAccessSpace] = React.useState<SidebarSpace | null>(null);
  const [deletingSpace, setDeletingSpace] = React.useState<SidebarSpace | null>(null);

  // Selection: no `?profile=` defaults to the first profile; "all" is explicit.
  // `shownActive` is "all" or a profile id (never the empty/no-param state).
  // "First" is the server's order (`profiles`), which is what the page resolves
  // the bare URL to.
  const firstId = items[0]?.id ?? null;
  const param = sp.get("profile");
  const resolved: string | null = param === "all" ? "all" : param || firstId;
  // Optimistic selection so the highlight flips instantly on click, before the
  // navigation (and the chat skeleton) settles.
  const [optimistic, setOptimistic] = React.useState<string | null | undefined>(undefined);
  if (optimistic !== undefined && optimistic === resolved) {
    setOptimistic(undefined);
  }
  const shownActive = optimistic !== undefined ? optimistic : resolved;
  // Shift+` jumps to "All profiles" (desktop sidebar only); profiles get Shift+1…0.
  const allShortcut = enableShortcuts ? comboFor("profiles.all") : "";

  // `target` is a profile id or "all" — both are set explicitly on the URL so
  // the default (no param) can mean "first profile" without ambiguity.
  function go(target: string) {
    setOptimistic(target);
    // Settings is deliberately excluded: it has no profile-scoped data, so
    // switching profiles there jumps back to the tracker.
    const dataPage =
      pathname === "/app" ||
      pathname.startsWith("/app/transactions") ||
      pathname.startsWith("/app/analytics") ||
      pathname.startsWith("/app/files");
    const targetPath = dataPage ? pathname : "/app";
    const params = new URLSearchParams(sp.toString());
    params.set("profile", target);
    params.delete("page");
    // Folders are per-profile: switching profiles reopens the vault at its root.
    params.delete("folder");
    const qs = params.toString();
    // Route through the shared (quiet) transition so `pending` gates the
    // composer until the new profile loads — no full-screen overlay, since the
    // feed streams its own skeletons. Survives the mobile sheet unmounting.
    runQuiet(() => router.push(qs ? `${targetPath}?${qs}` : targetPath));
    onNavigate?.();
  }

  // No-op when `allShortcut` is "" (e.g. the mobile sheet).
  useShortcut(allShortcut, () => go("all"));

  /** Reorder within one space; the server gets the whole workspace order. */
  function handleDragEnd(spaceId: string, list: P[], e: DragEndEvent) {
    const { active: a, over } = e;
    if (!over || a.id === over.id) return;
    const oldIndex = list.findIndex((p) => p.id === a.id);
    const newIndex = list.findIndex((p) => p.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(list, oldIndex, newIndex);
    const ids = profileOrderAfterReorder(groups, orphans, spaceId, reordered);
    const byId = new Map(items.map((p) => [p.id, p]));
    setItems(ids.map((id) => byId.get(id)).filter((p): p is P => !!p));
    startTransition(async () => {
      const res = await reorderProfiles(ids);
      if (!res.ok) {
        reportFailure(res);
        setItems(profiles);
      }
    });
  }

  function handleMoveSpace(id: string, direction: -1 | 1) {
    const next = moveSpace(
      groups.map((g) => g.space),
      id,
      direction,
    );
    if (!next) return;
    setSpaceItems(next.map((s, i) => ({ ...s, position: i })));
    startTransition(async () => {
      const res = await reorderSpaces(next.map((s) => s.id));
      if (!res.ok) {
        reportFailure(res);
        setSpaceItems(spaces);
      }
    });
  }

  const spaceOptions = groups.map((g) => ({
    id: g.space.id,
    name: g.space.name,
    icon: g.space.icon,
    profileCount: g.space.profileCount,
  }));

  // Plan limits, shown on the buttons before a form is opened (the forms lock
  // too). "Add profile" locks only when no space has room.
  const spaceLock = addLock(addLimits, "spaces");
  const profileLock = addLock(addLimits, "profiles", {
    profileCount: spaceOptions.length ? Math.min(...spaceOptions.map((s) => s.profileCount)) : 0,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Shortcuts are bound here, not on the rows, so a profile inside a
          folded space still answers to its Shift+number. */}
      {enableShortcuts &&
        ordered
          .slice(0, 10)
          .map((p, i) => (
            <ProfileShortcutBinding key={p.id} combo={profileShortcut(i)} onFire={() => go(p.id)} />
          ))}

      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Profiles
        </span>
        {/* Only workspace admins can create spaces and profiles. */}
        {canManage && (
          <div className="flex items-center gap-0.5">
            <LimitTooltip lock={spaceLock}>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={spaceLock ? `New space (${spaceLock.title.toLowerCase()})` : "New space"}
                title={spaceLock ? undefined : "New space"}
                className="relative"
                onClick={() => setNewSpaceOpen(true)}
              >
                <FolderPlus className="size-3.5" />
                {spaceLock && <LockBadge />}
              </Button>
            </LimitTooltip>
            <LimitTooltip lock={profileLock}>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={
                  profileLock ? `Add profile (${profileLock.title.toLowerCase()})` : "Add profile"
                }
                title={profileLock ? undefined : "Add profile"}
                className="relative"
                onClick={() => setAdding({})}
              >
                <Plus className="size-3.5" />
                {profileLock && <LockBadge />}
              </Button>
            </LimitTooltip>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-2">
        {groups.map(({ space, profiles: list }, index) => {
          const isCollapsed = collapsedSet.has(space.id);
          const listId = `space-${space.id}-profiles`;
          return (
            <section key={space.id} aria-label={space.name}>
              <SpaceHeader
                space={space}
                collapsed={isCollapsed}
                holdsActive={isCollapsed && list.some((p) => p.id === shownActive)}
                listId={listId}
                canManage={canManage}
                addLock={addLock(addLimits, "profiles", { profileCount: space.profileCount })}
                isFirst={index === 0}
                isLast={index === groups.length - 1}
                onToggle={() => setCollapsed(space.id, !isCollapsed)}
                onAdd={() => setAdding({ spaceId: space.id })}
                onRename={() => setRenamingSpace(space)}
                onChangeIcon={() => setIconSpace(space)}
                onMove={(d) => handleMoveSpace(space.id, d)}
                onAccess={() => setAccessSpace(space)}
                onDelete={() => setDeletingSpace(space)}
              />
              {!isCollapsed && (
                <div id={listId} className="mt-0.5 space-y-0.5 pl-3">
                  {list.length === 0 ? (
                    <p className="px-2.5 py-1.5 text-xs text-muted-foreground">
                      {canManage ? "No profiles yet — use + to add one." : "No profiles yet."}
                    </p>
                  ) : (
                    // One DndContext per space: profiles reorder inside their
                    // space; "Move to space…" moves them between spaces. An
                    // explicit, stable id, as every DndContext needs: without
                    // one dnd-kit numbers its aria-describedby from a
                    // module-wide counter that the server and the browser
                    // don't share — a hydration mismatch on every load.
                    <DndContext
                      id={`sidebar-space-${space.id}`}
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={(e) => handleDragEnd(space.id, list, e)}
                    >
                      <SortableContext
                        items={list.map((p) => p.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {list.map((p) => (
                          <ProfileRow
                            key={p.id}
                            profile={p}
                            active={shownActive === p.id}
                            shortcut={shortcutOf.get(p.id) ?? ""}
                            canManage={canManage}
                            canMove={spaceOptions.length > 1}
                            onSelect={() => go(p.id)}
                            onEdit={() => setEditing(p)}
                            onMove={() => setMoving(p)}
                            onDelete={() => setDeleting(p)}
                          />
                        ))}
                      </SortableContext>
                    </DndContext>
                  )}
                </div>
              )}
            </section>
          );
        })}

        {groups.length === 0 && orphans.length === 0 && (
          <p className="px-2.5 py-1.5 text-xs text-muted-foreground">
            You&apos;re not in any space yet — ask an admin to add you to one.
          </p>
        )}

        {/* Defensive: a profile whose space isn't listed still shows (no menu). */}
        {orphans.map((p) => (
          <StaticProfileRow
            key={p.id}
            profile={p}
            active={shownActive === p.id}
            shortcut={shortcutOf.get(p.id) ?? ""}
            onSelect={() => go(p.id)}
          />
        ))}

        {/* "All profiles" is the aggregate view — kept last, below the spaces. */}
        <button
          type="button"
          onClick={() => go("all")}
          aria-current={shownActive === "all" ? "true" : undefined}
          className={cn(
            // Matches the profile rows' resting padding so every shortcut hint
            // lines up flush on the right (this row has no hover menu to reveal).
            "mt-1 flex w-full items-center gap-2.5 rounded-lg border-t border-border/50 px-2.5 pt-2.5 pb-2 text-sm transition-colors",
            shownActive === "all"
              ? "bg-accent font-medium text-accent-foreground"
              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
          )}
        >
          <LayoutGrid className="size-4" />
          All profiles
          {allShortcut ? <Kbd combo={allShortcut} className="ml-auto opacity-60" /> : null}
        </button>
      </div>

      <ProfileFormDialog
        mode="add"
        open={adding !== null}
        onOpenChange={(v) => !v && setAdding(null)}
        spaces={spaceOptions}
        defaultSpaceId={adding?.spaceId}
      />
      {editing && (
        <ProfileFormDialog
          mode="edit"
          profile={editing}
          open={!!editing}
          onOpenChange={(v) => !v && setEditing(null)}
        />
      )}
      {deleting && (
        <ProfileDeleteDialog
          profile={deleting}
          others={items.filter((p) => p.id !== deleting.id)}
          open={!!deleting}
          onOpenChange={(v) => !v && setDeleting(null)}
        />
      )}
      {moving && (
        <MoveProfileDialog
          profile={moving}
          spaces={spaceOptions}
          open={!!moving}
          onOpenChange={(v) => !v && setMoving(null)}
        />
      )}
      <SpaceFormDialog mode="create" open={newSpaceOpen} onOpenChange={setNewSpaceOpen} />
      {renamingSpace && (
        <SpaceFormDialog
          mode="edit"
          space={renamingSpace}
          open={!!renamingSpace}
          onOpenChange={(v) => !v && setRenamingSpace(null)}
        />
      )}
      {iconSpace && (
        <SpaceIconDialog
          space={iconSpace}
          open={!!iconSpace}
          onOpenChange={(v) => !v && setIconSpace(null)}
        />
      )}
      {accessSpace && (
        <SpaceAccessDialog
          spaceId={accessSpace.id}
          spaceName={accessSpace.name}
          open={!!accessSpace}
          onOpenChange={(v) => !v && setAccessSpace(null)}
        />
      )}
      {deletingSpace && (
        <SpaceDeleteDialog
          space={deletingSpace}
          profileCount={deletingSpace.profileCount}
          others={spaceOptions.filter((s) => s.id !== deletingSpace.id)}
          open={!!deletingSpace}
          onOpenChange={(v) => !v && setDeletingSpace(null)}
        />
      )}
    </div>
  );
}

/** Binds one profile's Shift+number; renders nothing. */
function ProfileShortcutBinding({ combo, onFire }: { combo: string; onFire: () => void }) {
  useShortcut(combo, onFire);
  return null;
}

function SpaceHeader({
  space,
  collapsed,
  holdsActive,
  listId,
  canManage,
  addLock: lock,
  isFirst,
  isLast,
  onToggle,
  onAdd,
  onRename,
  onChangeIcon,
  onMove,
  onAccess,
  onDelete,
}: {
  space: SidebarSpace;
  collapsed: boolean;
  /** Folded with the selected profile inside — so the selection isn't lost from view. */
  holdsActive: boolean;
  listId: string;
  canManage: boolean;
  /** Why this space can't take another profile (full, or a view-only workspace). */
  addLock: AddLock | null;
  isFirst: boolean;
  isLast: boolean;
  onToggle: () => void;
  onAdd: () => void;
  onRename: () => void;
  onChangeIcon: () => void;
  onMove: (direction: -1 | 1) => void;
  onAccess: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "group relative flex items-center rounded-lg transition-colors hover:bg-accent/50",
        holdsActive && "bg-accent/60",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-controls={collapsed ? undefined : listId}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-1.5 rounded-lg py-1.5 pr-1 pl-1.5 text-left text-sm transition-colors",
          holdsActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <ChevronRight
          aria-hidden
          className={cn(
            "size-3.5 shrink-0 transition-transform duration-150",
            !collapsed && "rotate-90",
          )}
        />
        <span aria-hidden className="text-sm leading-none">
          {space.icon ?? DEFAULT_SPACE_ICON}
        </span>
        <span className="truncate font-medium">{space.name}</span>
      </button>
      {canManage && (
        <div className={cn("flex shrink-0 items-center gap-0.5 pr-1", REVEAL)}>
          <LimitTooltip lock={lock}>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={
                lock
                  ? `Add a profile to ${space.name} (${lock.title.toLowerCase()})`
                  : `Add a profile to ${space.name}`
              }
              title={lock ? undefined : "Add a profile here"}
              className="relative"
              onClick={onAdd}
            >
              <Plus className="size-3.5" />
              {lock && <LockBadge />}
            </Button>
          </LimitTooltip>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label={`${space.name} space options`}>
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={onRename}>
                <Pencil className="size-4" /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onChangeIcon}>
                <Smile className="size-4" /> Change icon
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onAccess}>
                <Users className="size-4" /> Members & access
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={isFirst} onSelect={() => onMove(-1)}>
                <ArrowUp className="size-4" /> Move up
              </DropdownMenuItem>
              <DropdownMenuItem disabled={isLast} onSelect={() => onMove(1)}>
                <ArrowDown className="size-4" /> Move down
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={onDelete}
              >
                <Trash2 className="size-4" /> Delete space
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}

/** Row content shared by the sortable and the static rows. */
function ProfileButton({
  profile,
  active,
  shortcut,
  shiftForMenu,
  onSelect,
}: {
  profile: P;
  active: boolean;
  shortcut: string;
  /** Slide the shortcut hint left on hover, to make room for the menu button. */
  shiftForMenu: boolean;
  onSelect: () => void;
}) {
  return (
    // The shortcut hint lives *inside* the select button (like the "All
    // profiles" row), so the whole row switches profile — clicking the ⇧1 chip
    // beside a name used to land on dead space.
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex min-w-0 flex-1 items-center gap-2.5 py-2 text-sm transition-colors",
        active
          ? "font-medium text-accent-foreground"
          : "text-muted-foreground group-hover:text-foreground",
      )}
    >
      <span aria-hidden className="text-base">
        {profile.icon ?? "👤"}
      </span>
      <span className="truncate">{profile.name}</span>
      {shortcut ? (
        <Kbd
          combo={shortcut}
          className={cn(
            "ml-auto shrink-0 opacity-60 transition-transform duration-200",
            shiftForMenu && "group-hover:-translate-x-7 pointer-coarse:-translate-x-7",
          )}
        />
      ) : null}
    </button>
  );
}

function StaticProfileRow({
  profile,
  active,
  shortcut,
  onSelect,
}: {
  profile: P;
  active: boolean;
  shortcut: string;
  onSelect: () => void;
}) {
  return (
    <div
      className={cn(
        "group relative flex items-center gap-1 rounded-lg pr-2.5 pl-2.5 transition-colors",
        active ? "bg-accent" : "hover:bg-accent/50",
      )}
    >
      <ProfileButton
        profile={profile}
        active={active}
        shortcut={shortcut}
        shiftForMenu={false}
        onSelect={onSelect}
      />
    </div>
  );
}

function ProfileRow({
  profile,
  active,
  shortcut,
  canManage,
  canMove,
  onSelect,
  onEdit,
  onMove,
  onDelete,
}: {
  profile: P;
  active: boolean;
  /** Display only — the binding lives on the list (`ProfileShortcutBinding`). */
  shortcut: string;
  canManage: boolean;
  canMove: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: profile.id,
    disabled: !canManage,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  } as React.CSSProperties;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        // Resting: the shortcut hint sits flush right. On hover it slides left to
        // make room for the menu button, which fades in on the right edge.
        "group relative flex items-center gap-1 rounded-lg pr-2.5 transition-colors",
        active ? "bg-accent" : "hover:bg-accent/50",
        isDragging && "bg-accent shadow-sm",
      )}
    >
      {/* Reordering is admin-only — no drag handle for viewers/editors. */}
      {canManage ? (
        <button
          type="button"
          aria-label={`Drag to reorder ${profile.name}`}
          className="cursor-grab touch-none px-1 py-2 text-muted-foreground/50 hover:text-muted-foreground"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5" />
        </button>
      ) : (
        <span className="w-2.5 shrink-0" aria-hidden />
      )}
      <ProfileButton
        profile={profile}
        active={active}
        shortcut={shortcut}
        shiftForMenu={canManage}
        onSelect={onSelect}
      />
      {/* Edit / move / delete a profile is admin-only. */}
      {canManage && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`${profile.name} options`}
              className={cn("absolute top-1/2 right-1.5 -translate-y-1/2", REVEAL)}
            >
              <MoreVertical className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="cursor-pointer" onSelect={onEdit}>
              <Pencil className="size-4" /> Edit
            </DropdownMenuItem>
            {canMove && (
              <DropdownMenuItem className="cursor-pointer" onSelect={onMove}>
                <FolderInput className="size-4" /> Move to space…
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              className="cursor-pointer text-destructive focus:text-destructive"
              onSelect={onDelete}
            >
              <Trash2 className="size-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

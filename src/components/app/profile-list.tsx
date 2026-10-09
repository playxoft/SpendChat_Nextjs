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
  X,
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
import { useShiftHeld } from "@/hooks/use-shift-held";
import { comboFor } from "@/lib/shortcuts";
import {
  canonicalProfileParam,
  formatProfileScope,
  isMultiScope,
  parseProfileScope,
  resolveProfileScope,
  scopeMembership,
  scopeOf,
  toggleScopeItem,
  type ProfileScope,
  type ScopeItem,
} from "@/lib/profile-scope";
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
  /** Every live profile in it (what the per-space cap counts), not just the visible ones. */
  profileCount: number;
  /** Its profiles in the trash (admins; 0 otherwise) — deleting the space needs a home for them. */
  trashedProfileCount?: number;
  /** The caller's role here: "admin" for workspace admins, else their space role or null. */
  role: WorkspaceRole | null;
};

type P = SidebarProfile;

// Hover-revealed controls on a mouse; always shown on touch, where there's no hover.
const REVEAL =
  "pointer-fine:opacity-0 pointer-fine:transition-opacity pointer-fine:duration-200 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100 pointer-fine:aria-expanded:opacity-100 pointer-fine:has-[[aria-expanded=true]]:opacity-100";

/**
 * How a row looks while multi-select is armed (Shift held over the list, or
 * Select mode on touch): a dashed outline on every row that can join the
 * selection, solid on the ones already in it. Inset, so nothing shifts.
 */
const SELECTABLE = "outline-1 -outline-offset-1 outline-dashed outline-muted-foreground/40";
const SELECTABLE_IN = "outline-1 -outline-offset-1 outline-solid outline-foreground/25";
/** A row in a multi-selection: a slim bar on the left edge, on top of the fill. */
const IN_SELECTION =
  "before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-foreground/60";

/** Which look a selectable row takes. */
type RowMark = {
  /** In the current view — the single profile, or part of a selection. */
  selected: boolean;
  /** Part of a multi-selection (a space, or several items). */
  multi: boolean;
  /** Multi-select is armed: show the outlines. */
  armed: boolean;
};

function markClasses({ selected, multi, armed }: RowMark): string {
  return cn(
    armed && (selected ? SELECTABLE_IN : SELECTABLE),
    selected && multi && IN_SELECTION,
  );
}

/**
 * The sidebar's profile tree: the workspace's spaces as collapsible groups
 * (Notion-style), each holding its profiles, then "All profiles". Members see
 * only the spaces `listSpaces` gives them; workspace admins see every space and
 * get the create / rename / reorder / access / delete controls.
 *
 * Shift+1…0 count through the profiles in sidebar order — spaces top to bottom,
 * profiles within each — and keep working when a space is folded, so folding
 * one never renumbers the rest.
 *
 * **Multi-select.** A click shows one profile, or one space (all of its
 * profiles); the chevron folds a space. Shift+click — or Shift+Enter /
 * Shift+Space on a focused row — adds a profile or space to what is shown, or
 * takes it out. Holding Shift over the list outlines every row that can join;
 * on touch, "Select" turns taps into the same toggle. The selection lives in
 * `?profile=` like a single profile does (`lib/profile-scope.ts`), so it rides
 * along between pages and the server, not this list, decides what it covers.
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

  // Selection: no `?profile=` defaults to the first profile; "all" is explicit;
  // anything else is a pick of profiles and spaces (see `lib/profile-scope.ts`).
  // "First" is the server's order (`profiles`), which is what the page resolves
  // the bare URL to — so the highlight and the data agree.
  const urlValue = canonicalProfileParam(sp.get("profile"));
  // Optimistic selection so the highlight flips instantly on click, before the
  // navigation (and the chat skeleton) settles. Holds the canonical parameter
  // the click navigates to (null = the default view).
  const [optimistic, setOptimistic] = React.useState<string | null | undefined>(undefined);
  if (optimistic !== undefined && optimistic === urlValue) {
    setOptimistic(undefined);
  }
  const shownValue = optimistic !== undefined ? optimistic : urlValue;
  const scope = React.useMemo(() => parseProfileScope(shownValue), [shownValue]);
  const view = React.useMemo(() => resolveProfileScope(scope, items), [scope, items]);
  const member = React.useMemo(() => scopeMembership(scope, items), [scope, items]);
  const multi = isMultiScope(scope);
  const allActive = scope.kind === "all";
  // Shift+` jumps to "All profiles" (desktop sidebar only); profiles get Shift+1…0.
  const allShortcut = enableShortcuts ? comboFor("profiles.all") : "";

  // Multi-select is "armed" — rows outlined — while Shift is held with the
  // pointer or focus in the list (not app-wide: a capital letter typed in the
  // composer shouldn't light up the sidebar), or in touch Select mode.
  const shiftHeld = useShiftHeld();
  const [hovering, setHovering] = React.useState(false);
  const [focusWithin, setFocusWithin] = React.useState(false);
  const [selectMode, setSelectMode] = React.useState(false);
  const armed = selectMode || (shiftHeld && (hovering || focusWithin));
  // Explains the Shift keys to screen readers, once per list (the mobile sheet
  // can mount a second list beside the sidebar's, so the id is per instance).
  const hintId = React.useId();
  // A keyboard toggle (Shift+Enter / Shift+Space) is handled on keydown; the
  // click the browser may still synthesize for that very key, on that very row,
  // is swallowed once — and nothing else is.
  const keyToggle = React.useRef<{ key: string; at: number } | null>(null);

  /** Navigate to a selection. A toggle keeps the mobile sheet open. */
  function navigate(next: ProfileScope, { keepOpen = false } = {}) {
    const value = formatProfileScope(next);
    setOptimistic(value);
    // Settings is deliberately excluded: it has no profile-scoped data, so
    // switching profiles there jumps back to the tracker.
    const dataPage =
      pathname === "/app" ||
      pathname.startsWith("/app/transactions") ||
      pathname.startsWith("/app/analytics") ||
      pathname.startsWith("/app/files");
    const targetPath = dataPage ? pathname : "/app";
    const params = new URLSearchParams(sp.toString());
    if (value) params.set("profile", value);
    else params.delete("profile");
    params.delete("page");
    // Folders are per-profile: switching profiles reopens the vault at its root.
    params.delete("folder");
    // A selection's ids are URL-safe as they are; only `URLSearchParams` would
    // escape its commas, so put them back for a shorter, readable address.
    const qs = params.toString().replace(/%2C/gi, ",");
    // Route through the shared (quiet) transition so `pending` gates the
    // composer until the new profile loads — no full-screen overlay, since the
    // feed streams its own skeletons. Survives the mobile sheet unmounting.
    runQuiet(() => router.push(qs ? `${targetPath}?${qs}` : targetPath));
    if (!keepOpen) onNavigate?.();
  }

  // `target` is a profile id or "all" — both are set explicitly on the URL so
  // the default (no param) can mean "first profile" without ambiguity.
  function go(target: string) {
    navigate(target === "all" ? { kind: "all" } : scopeOf({ kind: "profile", id: target }));
  }

  /** Add `item` to the selection or take it out; a no-op when that would empty it. */
  function toggle(item: ScopeItem) {
    const next = toggleScopeItem(
      scope,
      item,
      items,
      spaceItems.map((x) => x.id),
    );
    if (next) navigate(next, { keepOpen: true });
  }

  /** A row was activated: plain = show just it; Shift (or Select mode) = toggle. */
  function pick(item: ScopeItem, e: React.MouseEvent) {
    // The click a browser may synthesize for a Shift+Enter we already handled.
    const pending = keyToggle.current;
    keyToggle.current = null;
    if (
      pending &&
      e.detail === 0 &&
      pending.key === `${item.kind}:${item.id}` &&
      e.timeStamp - pending.at < 1000
    ) {
      return;
    }
    if (e.shiftKey || selectMode) toggle(item);
    else navigate(scopeOf(item));
  }

  /** Shift+Enter / Shift+Space on a focused row: the keyboard's Shift+click. */
  function pickKey(item: ScopeItem, e: React.KeyboardEvent) {
    if (e.key !== "Enter" && e.key !== " ") return;
    if (!e.shiftKey) {
      // A plain Enter/Space is a plain click: never one to swallow.
      keyToggle.current = null;
      return;
    }
    e.preventDefault();
    keyToggle.current = { key: `${item.kind}:${item.id}`, at: e.timeStamp };
    toggle(item);
  }

  /** Back to one profile: the selection's first (where it started), else the default. */
  function clearSelection() {
    const first = view.profileIds?.[0];
    navigate(first ? scopeOf({ kind: "profile", id: first }) : { kind: "default" }, {
      keepOpen: selectMode,
    });
  }

  /** Everything a selectable row needs. */
  const rowProps = (item: ScopeItem, selected: boolean) => ({
    mark: { selected, multi, armed },
    onPick: (e: React.MouseEvent) => pick(item, e),
    onPickKey: (e: React.KeyboardEvent) => pickKey(item, e),
  });

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
        <div className="flex items-center gap-0.5">
          {/* Touch has no Shift: "Select" turns taps into toggles instead. */}
          <Button
            variant="ghost"
            size="xs"
            className="hidden pointer-coarse:inline-flex"
            onClick={() => {
              if (selectMode) onNavigate?.();
              setSelectMode((v) => !v);
            }}
          >
            {selectMode ? "Done" : "Select"}
          </Button>
          {/* Only workspace admins can create spaces and profiles. */}
          {canManage && (
            <>
              <LimitTooltip lock={spaceLock}>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={
                    spaceLock ? `New space (${spaceLock.title.toLowerCase()})` : "New space"
                  }
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
            </>
          )}
        </div>
      </div>

      {/* The selection, and the way out of it. Shown for a space or several
          items — a single profile is just the highlighted row. */}
      {(multi || selectMode) && (
        <div className="mx-2 mb-1 flex min-h-7 items-center gap-2 rounded-md bg-muted/70 py-0.5 pr-0.5 pl-2.5 text-xs text-muted-foreground">
          <span aria-hidden className="min-w-0 flex-1 truncate">
            {multi ? (
              <>
                <span className="font-medium text-foreground tabular-nums">
                  {view.profileIds?.length ?? 0}
                </span>{" "}
                selected
              </>
            ) : (
              "Tap profiles or spaces to select"
            )}
          </span>
          {multi && (
            <Button
              variant="ghost"
              size="xs"
              className="px-1.5"
              onClick={clearSelection}
              aria-label="Clear selection"
            >
              Clear
              <X aria-hidden className="size-3" />
            </Button>
          )}
        </div>
      )}
      {/* Always mounted, so a change is announced (a live region that mounts
          with its text often isn't): a keyboard toggle is heard as well as seen. */}
      <span role="status" className="sr-only">
        {multi
          ? `${view.profileIds?.length ?? 0} ${view.profileIds?.length === 1 ? "profile" : "profiles"} selected`
          : selectMode
            ? "Select mode: tap profiles or spaces to select"
            : ""}
      </span>
      <p id={hintId} className="sr-only">
        Shift+Enter adds this to what is shown, or takes it out.
      </p>

      <div
        className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-2"
        onPointerEnter={() => setHovering(true)}
        onPointerLeave={() => setHovering(false)}
        onFocus={() => setFocusWithin(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusWithin(false);
        }}
      >
        {groups.map(({ space, profiles: list }, index) => {
          const isCollapsed = collapsedSet.has(space.id);
          const listId = `space-${space.id}-profiles`;
          return (
            <section key={space.id} aria-label={space.name}>
              <SpaceHeader
                space={space}
                collapsed={isCollapsed}
                holdsActive={isCollapsed && list.some((p) => member.profiles.has(p.id))}
                hintId={hintId}
                {...rowProps({ kind: "space", id: space.id }, member.spaces.has(space.id))}
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
                            current={!multi && view.single === p.id}
                            hintId={hintId}
                            {...rowProps({ kind: "profile", id: p.id }, member.profiles.has(p.id))}
                            shortcut={shortcutOf.get(p.id) ?? ""}
                            canManage={canManage}
                            canMove={spaceOptions.length > 1}
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
            current={!multi && view.single === p.id}
            hintId={hintId}
            {...rowProps({ kind: "profile", id: p.id }, member.profiles.has(p.id))}
            shortcut={shortcutOf.get(p.id) ?? ""}
          />
        ))}

        {/* "All profiles" is the aggregate view — kept last, below the spaces. */}
        <button
          type="button"
          onClick={() => {
            setSelectMode(false);
            go("all");
          }}
          aria-current={allActive ? "true" : undefined}
          className={cn(
            // Matches the profile rows' resting padding so every shortcut hint
            // lines up flush on the right (this row has no hover menu to reveal).
            "mt-1 flex w-full items-center gap-2.5 rounded-lg border-t border-border/50 px-2.5 pt-2.5 pb-2 text-sm transition-colors",
            allActive
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
          trashedCount={deletingSpace.trashedProfileCount ?? 0}
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

/** What every selectable row takes from the list. */
type SelectableRowProps = {
  mark: RowMark;
  /** A click on the row: plain shows just it, Shift toggles it (see `pick`). */
  onPick: (e: React.MouseEvent) => void;
  /** Shift+Enter / Shift+Space: the keyboard toggle. */
  onPickKey: (e: React.KeyboardEvent) => void;
  /** The list's explanation of the Shift keys, for `aria-describedby`. */
  hintId: string;
};

/**
 * What a screen reader hears for a row in a multi-selection. The rows are
 * plain buttons — Enter shows just that row, which a toggle state would
 * misdescribe — so the one profile on screen is `aria-current`, and membership
 * of a selection is part of the name ("Work, selected"); the list's live
 * region says how many, and its hint says Shift+Enter changes it.
 */
function SelectedNote({ mark }: { mark: RowMark }) {
  return mark.selected && mark.multi ? <span className="sr-only">, selected</span> : null;
}

/** Shift+click would extend the page's text selection; keep it a click. */
function noShiftSelect(e: React.MouseEvent) {
  if (e.shiftKey) e.preventDefault();
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
  mark,
  onPick,
  onPickKey,
  hintId,
  onToggle,
  onAdd,
  onRename,
  onChangeIcon,
  onMove,
  onAccess,
  onDelete,
}: SelectableRowProps & {
  space: SidebarSpace;
  collapsed: boolean;
  /** Folded with a selected profile inside — so the selection isn't lost from view. */
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
        "group relative flex items-center rounded-lg transition-colors",
        mark.selected ? "bg-accent" : holdsActive ? "bg-accent/60" : "hover:bg-accent/50",
        markClasses(mark),
      )}
    >
      {/* The chevron folds; the name shows the space (all of its profiles). */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-controls={collapsed ? undefined : listId}
        aria-label={`${collapsed ? "Expand" : "Collapse"} ${space.name}`}
        // On touch the chevron is the only way to fold a space: a 40px target there.
        className="flex shrink-0 items-center self-stretch rounded-lg py-1.5 pr-0.5 pl-1.5 text-muted-foreground transition-colors hover:text-foreground pointer-coarse:min-h-10 pointer-coarse:min-w-10 pointer-coarse:justify-center pointer-coarse:px-0"
      >
        <ChevronRight
          aria-hidden
          className={cn(
            "size-3.5 shrink-0 transition-transform duration-150",
            !collapsed && "rotate-90",
          )}
        />
      </button>
      <button
        type="button"
        onClick={onPick}
        onKeyDown={onPickKey}
        onMouseDown={noShiftSelect}
        aria-describedby={hintId}
        title="Shift+click to select several"
        className={cn(
          "flex min-w-0 flex-1 items-center gap-1.5 rounded-lg py-1.5 pr-1 pl-1 text-left text-sm transition-colors",
          mark.selected || holdsActive
            ? "text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <span aria-hidden className="text-sm leading-none">
          {space.icon ?? DEFAULT_SPACE_ICON}
        </span>
        <span className="truncate font-medium">{space.name}</span>
        <SelectedNote mark={mark} />
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
            <DropdownMenuContent align="end" className="min-w-48">
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
  current,
  mark,
  onPick,
  onPickKey,
  hintId,
  shortcut,
  shiftForMenu,
}: SelectableRowProps & {
  profile: P;
  /** The one profile in view (not part of a multi-selection). */
  current: boolean;
  shortcut: string;
  /** Slide the shortcut hint left on hover, to make room for the menu button. */
  shiftForMenu: boolean;
}) {
  return (
    // The shortcut hint lives *inside* the select button (like the "All
    // profiles" row), so the whole row switches profile — clicking the ⇧1 chip
    // beside a name used to land on dead space.
    <button
      type="button"
      onClick={onPick}
      onKeyDown={onPickKey}
      onMouseDown={noShiftSelect}
      aria-current={current ? "true" : undefined}
      aria-describedby={hintId}
      title="Shift+click to select several"
      className={cn(
        "flex min-w-0 flex-1 items-center gap-2.5 py-2 text-sm transition-colors",
        mark.selected
          ? "font-medium text-accent-foreground"
          : "text-muted-foreground group-hover:text-foreground",
      )}
    >
      <span aria-hidden className="text-base">
        {profile.icon ?? "👤"}
      </span>
      <span className="truncate">{profile.name}</span>
      <SelectedNote mark={mark} />
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
  current,
  shortcut,
  ...select
}: SelectableRowProps & {
  profile: P;
  current: boolean;
  shortcut: string;
}) {
  return (
    <div
      className={cn(
        "group relative flex items-center gap-1 rounded-lg pr-2.5 pl-2.5 transition-colors",
        select.mark.selected ? "bg-accent" : "hover:bg-accent/50",
        markClasses(select.mark),
      )}
    >
      <ProfileButton
        profile={profile}
        current={current}
        shortcut={shortcut}
        shiftForMenu={false}
        {...select}
      />
    </div>
  );
}

function ProfileRow({
  profile,
  current,
  shortcut,
  canManage,
  canMove,
  onEdit,
  onMove,
  onDelete,
  ...select
}: SelectableRowProps & {
  profile: P;
  current: boolean;
  /** Display only — the binding lives on the list (`ProfileShortcutBinding`). */
  shortcut: string;
  canManage: boolean;
  canMove: boolean;
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
        select.mark.selected ? "bg-accent" : "hover:bg-accent/50",
        markClasses(select.mark),
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
        current={current}
        shortcut={shortcut}
        shiftForMenu={canManage}
        {...select}
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

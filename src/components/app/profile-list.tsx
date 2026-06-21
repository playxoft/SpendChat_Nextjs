"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { GripVertical, LayoutGrid, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProfileFormDialog } from "./profile-form-dialog";
import { ProfileDeleteDialog } from "./profile-delete-dialog";
import { Kbd } from "@/components/ui/kbd";
import { reorderProfiles } from "@/actions/profiles";
import { useShortcut } from "@/hooks/use-shortcut";
import { comboFor } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import type { Profile } from "@/db/schema";

type P = Pick<Profile, "id" | "name" | "icon">;

/** Shift + 1…9 (and 0 for the 10th) jump to a profile by position. */
function profileShortcut(index: number): string {
  return index < 10 ? `shift+${(index + 1) % 10}` : "";
}

export function ProfileList({
  profiles,
  onNavigate,
  enableShortcuts = false,
}: {
  profiles: P[];
  onNavigate?: () => void;
  /** Bind + show Shift+1…0 shortcuts (desktop sidebar only, to avoid double-binding). */
  enableShortcuts?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [, startTransition] = useTransition();

  const [items, setItems] = React.useState<P[]>(profiles);
  // Re-sync from the server after revalidation.
  const [synced, setSynced] = React.useState(profiles);
  if (profiles !== synced) {
    setSynced(profiles);
    setItems(profiles);
  }

  const [addOpen, setAddOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<P | null>(null);
  const [deleting, setDeleting] = React.useState<P | null>(null);

  const active = sp.get("profile");
  // Optimistic selection so the highlight flips instantly on click, before the
  // navigation (and the chat skeleton) settles.
  const [optimistic, setOptimistic] = React.useState<string | null | undefined>(undefined);
  if (optimistic !== undefined && optimistic === (active ?? null)) {
    setOptimistic(undefined);
  }
  const shownActive = optimistic !== undefined ? optimistic : active;
  // Shift+` jumps to "All profiles" (desktop sidebar only); profiles get Shift+1…0.
  const allShortcut = enableShortcuts ? comboFor("profiles.all") : "";

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function go(id: string | null) {
    setOptimistic(id);
    const dataPage =
      pathname.startsWith("/app") ||
      pathname.startsWith("/transactions") ||
      pathname.startsWith("/analytics");
    const targetPath = dataPage ? pathname : "/app";
    const params = new URLSearchParams(sp.toString());
    if (id) params.set("profile", id);
    else params.delete("profile");
    params.delete("page");
    const qs = params.toString();
    startTransition(() => router.push(qs ? `${targetPath}?${qs}` : targetPath));
    onNavigate?.();
  }

  // No-op when `allShortcut` is "" (e.g. the mobile sheet).
  useShortcut(allShortcut, () => go(null));

  function handleDragEnd(e: DragEndEvent) {
    const { active: a, over } = e;
    if (!over || a.id === over.id) return;
    const oldIndex = items.findIndex((p) => p.id === a.id);
    const newIndex = items.findIndex((p) => p.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);
    startTransition(() => {
      reorderProfiles(next.map((p) => p.id));
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Profiles
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Add profile"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="size-3.5" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
        <button
          type="button"
          onClick={() => go(null)}
          aria-current={!shownActive ? "true" : undefined}
          className={cn(
            // Matches the profile rows' resting padding so every shortcut hint
            // lines up flush on the right (this row has no hover menu to reveal).
            "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
            !shownActive
              ? "bg-accent font-medium text-accent-foreground"
              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
          )}
        >
          <LayoutGrid className="size-4" />
          All profiles
          {allShortcut ? (
            <Kbd combo={allShortcut} className="ml-auto opacity-60" />
          ) : null}
        </button>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            {items.map((p, index) => (
              <ProfileRow
                key={p.id}
                profile={p}
                active={shownActive === p.id}
                shortcut={enableShortcuts ? profileShortcut(index) : ""}
                onSelect={() => go(p.id)}
                onEdit={() => setEditing(p)}
                onDelete={() => setDeleting(p)}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      <ProfileFormDialog mode="add" open={addOpen} onOpenChange={setAddOpen} />
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
    </div>
  );
}

function ProfileRow({
  profile,
  active,
  shortcut,
  onSelect,
  onEdit,
  onDelete,
}: {
  profile: P;
  active: boolean;
  shortcut: string;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  // No-op when `shortcut` is "" (e.g. the mobile sheet or profiles past the 10th).
  useShortcut(shortcut, onSelect);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: profile.id,
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
      <button
        type="button"
        aria-label="Drag to reorder"
        className="cursor-grab touch-none px-1 py-2 text-muted-foreground/50 hover:text-muted-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "true" : undefined}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2.5 py-2 text-sm transition-colors",
          active ? "font-medium text-accent-foreground" : "text-muted-foreground group-hover:text-foreground",
        )}
      >
        <span aria-hidden className="text-base">{profile.icon ?? "👤"}</span>
        <span className="truncate">{profile.name}</span>
      </button>
      {shortcut ? (
        <Kbd
          combo={shortcut}
          className="ml-auto shrink-0 opacity-60 transition-transform duration-200 group-hover:-translate-x-7"
        />
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`${profile.name} options`}
            className="absolute top-1/2 right-1.5 -translate-y-1/2 opacity-0 transition-opacity duration-200 group-hover:opacity-100 aria-expanded:opacity-100"
          >
            <MoreVertical className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem className="cursor-pointer" onClick={onEdit}>
            <Pencil className="size-4" /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer text-destructive focus:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="size-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

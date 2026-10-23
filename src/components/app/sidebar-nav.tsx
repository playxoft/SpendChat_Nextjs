"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Ellipsis, GripVertical } from "lucide-react";
import {
  DndContext,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { setSidebarNav } from "@/actions/settings";
import { requestAskFocus } from "./ask/ask-paths";
import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { navTourTarget } from "@/lib/product-tour";
import { MORE_ID, type SidebarNavEntry, type SidebarNavId, type SidebarNavLayout } from "@/lib/sidebar-nav";
import { cn } from "@/lib/utils";
import { hrefWithProfile, isActive, navItems, splitNavItem } from "./nav-items";

/** More's row as a drop target: a section dropped on it goes in. */
const MORE_TARGET = "more-target";
/** The drop target an empty More panel offers. */
const MORE_DROP = "more-drop";
/** How long the pointer can be off both More's row and its panel before the panel closes. */
const CLOSE_DELAY_MS = 250;
const OPEN_DELAY_MS = 100;

type Section = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact: boolean;
  shortcut: string;
};

// Typed as the sidebar's ids, so a nav item without a place in `SIDEBAR_NAV_IDS` fails to compile.
const ALL_SECTIONS: readonly (Section & { id: SidebarNavId })[] = [...navItems, splitNavItem];
const SECTIONS = {} as Record<SidebarNavId, Section>;
for (const item of ALL_SECTIONS) SECTIONS[item.id] = item;

function rowClass(active: boolean) {
  return cn(
    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
    active ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
  );
}

function sameLayout(a: SidebarNavLayout, b: SidebarNavLayout) {
  return a.main.join() === b.main.join() && a.more.join() === b.more.join();
}

type Box = "main" | "more";

function boxOf(id: string, l: SidebarNavLayout): Box | null {
  if (id === MORE_DROP) return "more";
  if ((l.main as string[]).includes(id)) return "main";
  if ((l.more as string[]).includes(id)) return "more";
  return null;
}

/**
 * The sidebar's sections, in the order the person chose
 * (`ui_prefs.sidebar.nav`). Sections sit in the list or under **More**, whose
 * sections open in a panel beside it — a submenu, like "File → Export → …":
 * hover More (or click it, or press → on it) and the panel opens to the right.
 *
 * Every row has a drag handle that shows on hover:
 *  - drag a section up or down the list, More included;
 *  - drop a section on More to put it in (the panel springs open on the way,
 *    so it can also be dropped at a place among More's sections);
 *  - drag a section out of the panel onto the list to bring it back.
 *
 * Saved best effort after each drop, without revalidating: the list already
 * shows the new order, and the next render of the layout reads it back.
 */
export function SidebarNav({
  initial,
  profile,
  badges,
}: {
  initial: SidebarNavLayout;
  /** The `?profile=` selection, carried to workspace sections. */
  profile: string | null;
  /** Something to show on a section's row (budget alerts, split invitations). */
  badges: Partial<Record<SidebarNavId, React.ReactNode>>;
}) {
  const pathname = usePathname();
  const [layout, setLayout] = React.useState(initial);
  const [open, setOpen] = React.useState(false);
  const [dragging, setDragging] = React.useState<string | null>(null);
  // The layout when the drag began: compared on drop, restored on cancel.
  const before = React.useRef<SidebarNavLayout>(initial);
  // What the drag handlers read: they can run before a re-render hands them the new layout.
  const latest = React.useRef(layout);
  const draggingRef = React.useRef<string | null>(null);
  React.useLayoutEffect(() => {
    latest.current = layout;
    draggingRef.current = dragging;
  }, [layout, dragging]);
  // The panel opened itself for a drag (and closes again on the drop).
  const sprung = React.useRef(false);
  // Opened from the keyboard: focus goes into the panel.
  const focusPanel = React.useRef(false);
  // Closed with Escape: focus goes back to More's button (the panel has no trigger to return to).
  const refocusMore = React.useRef(false);
  const moreRowRef = React.useRef<HTMLDivElement>(null);
  const moreButtonRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const timer = React.useRef<number | undefined>(undefined);
  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  const openSoon = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), OPEN_DELAY_MS);
  };
  const keepOpen = () => window.clearTimeout(timer.current);
  const closeSoon = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      // Never mid-drag: the pointer leaves the panel on its way to the list.
      if (!draggingRef.current) setOpen(false);
    }, CLOSE_DELAY_MS);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activeHere = (id: SidebarNavId) => isActive(pathname, SECTIONS[id].href, SECTIONS[id].exact);
  const hrefOf = (id: SidebarNavId) =>
    id === "split" ? SECTIONS[id].href : hrefWithProfile(SECTIONS[id].href, profile);

  // More moves within the list only. A section aims at More through its row's
  // drop target, never as a slot beside it, and prefers the row under the
  // pointer; between rows it stays where it is rather than jumping across.
  const collision: CollisionDetection = (args) => {
    const dragged = String(args.active.id);
    const l = latest.current;
    const pool = args.droppableContainers.filter((c) => {
      const id = String(c.id);
      return dragged === MORE_ID ? boxOf(id, l) === "main" : id !== MORE_ID;
    });
    // A keyboard drag has no pointer: the nearest row anywhere — More's row and
    // its panel included — so the keyboard can move a section in and out too.
    if (!args.pointerCoordinates) return closestCenter({ ...args, droppableContainers: pool });
    const within = pointerWithin({ ...args, droppableContainers: pool });
    if (within.length > 0) return [within[0]];
    const home = boxOf(dragged, l);
    return closestCenter({
      ...args,
      droppableContainers: pool.filter((c) => String(c.id) !== MORE_TARGET && boxOf(String(c.id), l) === home),
    });
  };

  function onDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    before.current = latest.current;
    setDragging(id);
    if (id === MORE_ID) setOpen(false);
  }

  // Crossing between the list and the panel moves the section as it goes, so
  // the rows make room where it would land.
  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const id = String(active.id);
    const target = String(over.id);
    if (id === MORE_ID || id === target) return;
    if (target === MORE_TARGET) {
      window.clearTimeout(timer.current);
      if (!open) {
        sprung.current = true;
        setOpen(true);
      }
      return;
    }
    setLayout((prev) => {
      const from = boxOf(id, prev);
      const to = boxOf(target, prev);
      if (!from || !to || from === to) return prev;
      const section = id as SidebarNavId;
      if (to === "more") {
        const more = [...prev.more];
        const at = more.indexOf(target as SidebarNavId);
        more.splice(at < 0 ? more.length : at, 0, section);
        return { main: prev.main.filter((x) => x !== section), more };
      }
      const main = [...prev.main];
      const at = main.indexOf(target as SidebarNavEntry);
      main.splice(at < 0 ? main.length : at, 0, section);
      return { main, more: prev.more.filter((x) => x !== section) };
    });
  }

  function onDragEnd({ active, over, activatorEvent, delta }: DragEndEvent) {
    setDragging(null);
    // A panel opened by hover or a click stays open through a drag; once the
    // drop lands away from More's row and its panel, it closes.
    if (open && !sprung.current && activatorEvent instanceof PointerEvent) {
      const x = activatorEvent.clientX + delta.x;
      const y = activatorEvent.clientY + delta.y;
      const inside = (el: HTMLElement | null) => {
        const r = el?.getBoundingClientRect();
        return !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      };
      if (!inside(moreRowRef.current) && !inside(panelRef.current)) setOpen(false);
    }
    let next = latest.current;
    if (over) {
      const id = String(active.id);
      const target = String(over.id);
      const box = boxOf(id, next);
      if (target === MORE_TARGET && box === "main" && id !== MORE_ID) {
        // Dropped on More's row: in it goes, at the end.
        next = { main: next.main.filter((x) => x !== id), more: [...next.more, id as SidebarNavId] };
      } else if (box && box === boxOf(target, next) && id !== target && target !== MORE_DROP) {
        if (box === "main") {
          next = { ...next, main: arrayMove(next.main, next.main.indexOf(id as SidebarNavEntry), next.main.indexOf(target as SidebarNavEntry)) };
        } else {
          next = { ...next, more: arrayMove(next.more, next.more.indexOf(id as SidebarNavId), next.more.indexOf(target as SidebarNavId)) };
        }
      }
    }
    setLayout(next);
    if (sprung.current) {
      sprung.current = false;
      setOpen(false);
    }
    if (sameLayout(next, before.current)) return;
    // Best effort: a lost write only means the old order comes back next visit.
    void setSidebarNav(next).catch(() => {});
  }

  function onDragCancel() {
    setDragging(null);
    setLayout(before.current);
    if (sprung.current) {
      sprung.current = false;
      setOpen(false);
    }
  }

  const dragSection = dragging !== null && dragging !== MORE_ID ? dragging : null;
  const holdsActive = layout.more.some(activeHere);

  return (
    // An explicit, stable id, as every DndContext needs (see the profile list).
    <DndContext
      id="sidebar-nav"
      sensors={sensors}
      collisionDetection={collision}
      // Rows move while dragging (the panel opening, sections crossing over).
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      {/* The product tour's "other pages" stop (the bottom bar on a phone). */}
      <nav aria-label="Sections" data-tour="nav" className="shrink-0 space-y-1 px-3 py-2">
        <SortableContext items={layout.main} strategy={verticalListSortingStrategy}>
          {layout.main.map((id) =>
            id === MORE_ID ? (
              <Popover key={MORE_ID} open={open} onOpenChange={(next) => !next && setOpen(false)}>
                <MoreRow
                  open={open}
                  holdsActive={holdsActive}
                  // A section in the panel still says it wants attention — every
                  // one of them (a badge with nothing to say renders nothing).
                  badge={layout.more.map((s) => (badges[s] ? <React.Fragment key={s}>{badges[s]}</React.Fragment> : null))}
                  rowRef={moreRowRef}
                  buttonRef={moreButtonRef}
                  dropping={dragSection !== null && boxOf(dragSection, layout) === "main"}
                  onPointerEnter={openSoon}
                  onPointerLeave={closeSoon}
                  onOpen={(fromKeyboard) => {
                    window.clearTimeout(timer.current);
                    focusPanel.current = fromKeyboard;
                    setOpen(true);
                  }}
                />
                <PopoverContent
                  ref={panelRef}
                  side="right"
                  align="start"
                  sideOffset={10}
                  // Not clipped: a row dragged out of it must stay visible on its way to the list.
                  className="w-60 gap-0.5 overflow-visible p-1.5"
                  aria-label="More sections"
                  onPointerEnter={keepOpen}
                  onPointerLeave={closeSoon}
                  // A hover opens it without taking focus; the keyboard goes to
                  // its first section (not the first drag handle).
                  onOpenAutoFocus={(e) => {
                    e.preventDefault();
                    if (focusPanel.current) (e.currentTarget as HTMLElement).querySelector<HTMLElement>("a")?.focus();
                    focusPanel.current = false;
                  }}
                  onEscapeKeyDown={() => {
                    refocusMore.current = true;
                  }}
                  onCloseAutoFocus={(e) => {
                    e.preventDefault();
                    if (refocusMore.current) moreButtonRef.current?.focus();
                    refocusMore.current = false;
                  }}
                >
                  <SortableContext items={layout.more} strategy={verticalListSortingStrategy}>
                    {layout.more.map((s) => (
                      <PanelRow
                        key={s}
                        id={s}
                        href={hrefOf(s)}
                        active={activeHere(s)}
                        badge={badges[s]}
                        onPick={() => setOpen(false)}
                      />
                    ))}
                    {layout.more.length === 0 && <EmptyMore />}
                  </SortableContext>
                </PopoverContent>
              </Popover>
            ) : (
              <NavRow key={id} id={id} href={hrefOf(id)} active={activeHere(id)} badge={badges[id]} />
            ),
          )}
        </SortableContext>
      </nav>
    </DndContext>
  );
}

function DragHandle({
  label,
  dragging,
  className,
  ...props
}: React.ComponentProps<"button"> & { label: string; dragging: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "absolute top-1/2 z-10 flex h-6 w-3.5 -translate-y-1/2 cursor-grab touch-none items-center justify-center rounded text-muted-foreground/60 outline-none transition-opacity hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50 active:cursor-grabbing",
        dragging ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
        className,
      )}
      {...props}
    >
      <GripVertical className="size-3.5" />
    </button>
  );
}

function useRowSortable(id: string) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return {
    setNodeRef,
    isDragging,
    style: { transform: CSS.Transform.toString(transform), transition } as React.CSSProperties,
    handle: { ...attributes, ...listeners },
  };
}

function NavRow({
  id,
  href,
  active,
  badge,
}: {
  id: SidebarNavId;
  href: string;
  active: boolean;
  badge?: React.ReactNode;
}) {
  const section = SECTIONS[id];
  const { setNodeRef, isDragging, style, handle } = useRowSortable(id);
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("group relative", isDragging && "z-20 rounded-lg bg-background shadow-sm")}
    >
      {/* In the gutter left of the row, so showing it moves nothing. */}
      <DragHandle label={`Drag to move ${section.label}`} dragging={isDragging} className="-left-2.5" {...handle} />
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        onClick={id === "ask" ? requestAskFocus : undefined}
        // Product-tour anchors (the bottom bar's slots on a phone). A section
        // under More has no row here, which is how the tour knows it's there.
        data-tour={navTourTarget(id)}
        className={rowClass(active)}
      >
        <section.icon className="size-4" />
        {section.label}
        {badge}
        <Kbd combo={section.shortcut} className="ml-auto opacity-70" />
      </Link>
    </div>
  );
}

/**
 * More's row: the panel's anchor, a row of the list (sortable like the
 * others) and, while a section is dragged, a place to drop it.
 */
function MoreRow({
  open,
  holdsActive,
  badge,
  dropping,
  onPointerEnter,
  onPointerLeave,
  onOpen,
  rowRef,
  buttonRef,
}: {
  open: boolean;
  /** The page on view is one of its sections. */
  holdsActive: boolean;
  badge?: React.ReactNode;
  /** A section from the list is being dragged — say it can go in. */
  dropping: boolean;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onOpen: (fromKeyboard: boolean) => void;
  /** The row — where a drop counts as "at More" (see `onDragEnd`). */
  rowRef: React.RefObject<HTMLDivElement | null>;
  /** More's button, for focus to come back to when the panel closes. */
  buttonRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const { setNodeRef, isDragging, style, handle } = useRowSortable(MORE_ID);
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: MORE_TARGET });
  return (
    <div
      ref={(el) => {
        setNodeRef(el);
        rowRef.current = el;
      }}
      style={style}
      className={cn("group relative", isDragging && "z-20 rounded-lg bg-background shadow-sm")}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <DragHandle label="Drag to move More" dragging={isDragging} className="-left-2.5" {...handle} />
      <PopoverAnchor asChild>
        <button
          ref={(el) => {
            setDropRef(el);
            buttonRef.current = el;
          }}
          type="button"
          aria-haspopup="true"
          aria-expanded={open}
          // A keyboard click (detail 0) or → moves focus into the panel; a mouse click just opens it.
          onClick={(e) => onOpen(e.detail === 0)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") {
              e.preventDefault();
              onOpen(true);
            }
          }}
          className={cn(
            rowClass(holdsActive),
            "w-full",
            open && !holdsActive && "bg-accent/50 text-foreground",
            dropping && "outline-1 -outline-offset-1 outline-dashed outline-muted-foreground/40",
            isOver && "bg-accent text-foreground outline-solid outline-foreground/30",
          )}
        >
          <Ellipsis className="size-4" />
          {isOver ? "Drop to tuck it in More" : "More"}
          {!isOver && badge}
          <ChevronRight className="ml-auto size-4 opacity-70" />
        </button>
      </PopoverAnchor>
    </div>
  );
}

/** A section inside More's panel. */
function PanelRow({
  id,
  href,
  active,
  badge,
  onPick,
}: {
  id: SidebarNavId;
  href: string;
  active: boolean;
  badge?: React.ReactNode;
  onPick: () => void;
}) {
  const section = SECTIONS[id];
  const { setNodeRef, isDragging, style, handle } = useRowSortable(id);
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("group relative", isDragging && "z-20 rounded-lg bg-popover shadow-sm")}
    >
      {/* Inside the row here: the panel's edge leaves no gutter. */}
      <DragHandle label={`Drag to move ${section.label}`} dragging={isDragging} className="left-1" {...handle} />
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        onClick={() => {
          onPick();
          if (id === "ask") requestAskFocus();
        }}
        className={cn(rowClass(active), "pl-6")}
      >
        <section.icon className="size-4" />
        {section.label}
        {badge}
        <Kbd combo={section.shortcut} className="ml-auto opacity-70" />
      </Link>
    </div>
  );
}

function EmptyMore() {
  const { setNodeRef, isOver } = useDroppable({ id: MORE_DROP });
  return (
    <p
      ref={setNodeRef}
      className={cn(
        "rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground transition-colors",
        isOver && "border-foreground/40 bg-accent/50",
      )}
    >
      Nothing here yet — drag a section onto More to tuck it away.
    </p>
  );
}

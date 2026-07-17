"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, GripVertical } from "lucide-react";
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
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TransactionDialog } from "./transaction-dialog";
import { amountToneClass } from "./transaction-bubble";
import {
  COLUMN_LABELS,
  DEFAULT_WIDTHS,
  MIN_COLUMN_WIDTH,
  getVisibleColumns,
  setColumnOrder,
  setColumnWidth,
  useColumnLayout,
  type ColumnId,
} from "./transaction-columns-store";
import { formatMoney, minorToInputString, signedMinor } from "@/lib/money";
import { formatDateLabel } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { Category, Profile } from "@/db/schema";
import type { TransactionRow } from "@/lib/queries";

type SharedProps = {
  currency: string;
  locale: string;
  categories: Pick<Category, "id" | "name" | "kind" | "icon">[];
  profiles: Pick<Profile, "id" | "name" | "icon">[];
  today: string;
};

type CellContext = { currency: string; locale: string };

type ColumnDef = {
  cellClassName?: string | ((row: TransactionRow) => string);
  render: (row: TransactionRow, ctx: CellContext) => ReactNode;
};

/** How each column renders its header/body cell. Order, visibility, and width
 * live in the shared store; this map is purely presentational. `truncate` on
 * every cell keeps content clipped to the (now fixed) column width. */
const COLUMNS: Record<ColumnId, ColumnDef> = {
  date: {
    cellClassName: "truncate text-muted-foreground",
    render: (row, { locale }) => formatDateLabel(row.occurredOn, locale),
  },
  category: {
    cellClassName: "truncate",
    render: (row) => (
      <span className="flex min-w-0 items-center gap-1.5">
        <span aria-hidden className="shrink-0">
          {row.categoryIcon ?? "💸"}
        </span>
        <span className="truncate">{row.categoryName ?? "Uncategorized"}</span>
      </span>
    ),
  },
  title: {
    cellClassName: "truncate",
    render: (row) => row.title ?? "",
  },
  description: {
    cellClassName: "truncate text-muted-foreground",
    render: (row) => row.description ?? "",
  },
  amount: {
    cellClassName: (row) => cn("truncate text-right font-medium tabular-nums", amountToneClass(row.type)),
    render: (row, { currency, locale }) =>
      formatMoney(signedMinor(row.type, row.amountMinor), currency, locale, { signed: true }),
  },
};

export function TransactionsTable({
  rows,
  activeSort,
  activeDir,
  onSort,
  ...shared
}: SharedProps & {
  rows: TransactionRow[];
  activeSort: string | null;
  activeDir: "asc" | "desc";
  onSort: (id: ColumnId) => void;
}) {
  const layout = useColumnLayout();
  const visible = getVisibleColumns(layout);
  const totalWidth = visible.reduce((sum, id) => sum + (layout.widths[id] ?? DEFAULT_WIDTHS[id]), 0);

  // Live width during a resize drag is applied straight to the <col> (and the
  // <table>) elements so the 50 body rows don't re-render on every pointer move;
  // the store is updated once on release.
  const colRefs = useRef<Partial<Record<ColumnId, HTMLTableColElement | null>>>({});
  const tableRef = useRef<HTMLTableElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = layout.order.indexOf(active.id as ColumnId);
    const newIndex = layout.order.indexOf(over.id as ColumnId);
    if (oldIndex < 0 || newIndex < 0) return;
    setColumnOrder(arrayMove(layout.order, oldIndex, newIndex));
  }

  function handleResizeStart(id: ColumnId, startX: number, startWidth: number) {
    const col = colRefs.current[id];
    const table = tableRef.current;
    const baseTableWidth = table?.getBoundingClientRect().width ?? totalWidth;
    const widthAt = (clientX: number) =>
      Math.max(MIN_COLUMN_WIDTH, Math.round(startWidth + (clientX - startX)));
    const onMove = (ev: PointerEvent) => {
      const w = widthAt(ev.clientX);
      // Grow the column and the table by the same amount so the column tracks
      // the cursor exactly and the table scrolls once it outgrows the container.
      if (col) col.style.width = `${w}px`;
      if (table) table.style.width = `${baseTableWidth + (w - startWidth)}px`;
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.userSelect = "";
      setColumnWidth(id, widthAt(ev.clientX));
    };
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border py-16 text-center text-sm text-muted-foreground">
        No transactions match these filters.
      </div>
    );
  }

  return (
    // `w-fit max-w-full` shrink-wraps the border to the table when it's narrower
    // than the page, and caps it at full width (inner scroll) when it's wider.
    <div className="w-fit max-w-full overflow-hidden rounded-xl border print-area">
      <DndContext
        id="transactions-columns"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        {/* Fixed layout + a colgroup makes column widths authoritative; the
            explicit total width lets the table scroll once columns are widened. */}
        <Table ref={tableRef} className="table-fixed w-auto" style={{ width: totalWidth }}>
          <colgroup>
            {visible.map((id) => (
              <col
                key={id}
                ref={(el) => {
                  colRefs.current[id] = el;
                }}
                style={{ width: `${layout.widths[id] ?? DEFAULT_WIDTHS[id]}px` }}
              />
            ))}
          </colgroup>
          <TableHeader>
            <TableRow>
              <SortableContext items={visible} strategy={horizontalListSortingStrategy}>
                {visible.map((id) => (
                  <SortableHeader
                    key={id}
                    id={id}
                    sortDir={activeSort === id ? activeDir : null}
                    onSort={onSort}
                    onResizeStart={handleResizeStart}
                  />
                ))}
              </SortableContext>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <Row key={r.id} row={r} columns={visible} {...shared} />
            ))}
          </TableBody>
        </Table>
      </DndContext>
    </div>
  );
}

/** The sort-direction glyph: a solid arrow when this column is the active sort,
 * else a faint hint that appears on header hover. */
function SortIndicator({ dir }: { dir: "asc" | "desc" | null }) {
  if (dir === "asc") return <ArrowUp className="size-3.5 shrink-0" />;
  if (dir === "desc") return <ArrowDown className="size-3.5 shrink-0" />;
  return (
    <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100" />
  );
}

/** A sortable, draggable, resizable header cell. Three targets: the label button
 * sorts (its pointerdown stops propagation so it never drags); the empty space
 * around it is the reorder grab area (keyboard-operable via dnd-kit `attributes`);
 * the right-edge strip resizes (also stops propagation). */
function SortableHeader({
  id,
  sortDir,
  onSort,
  onResizeStart,
}: {
  id: ColumnId;
  sortDir: "asc" | "desc" | null;
  onSort: (id: ColumnId) => void;
  onResizeStart: (id: ColumnId, startX: number, startWidth: number) => void;
}) {
  const rightAligned = id === "amount";
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const style: React.CSSProperties = {
    // Constrain the drag to the horizontal axis — a column never moves vertically.
    transform: transform ? `translateX(${transform.x}px)` : undefined,
    transition,
    zIndex: isDragging ? 10 : undefined,
  };

  function beginResize(e: ReactPointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const th = (e.currentTarget as HTMLElement).closest("th");
    const startWidth = th?.getBoundingClientRect().width ?? DEFAULT_WIDTHS[id];
    onResizeStart(id, e.clientX, startWidth);
  }

  return (
    <TableHead
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative cursor-grab touch-none overflow-hidden select-none transition-colors hover:bg-muted/50",
        isDragging && "bg-muted",
      )}
      {...attributes}
      {...listeners}
    >
      <div
        className={cn(
          // Reserve room on hover so the grip never sits on top of the label.
          "flex min-w-0 items-center transition-[padding] group-hover:pr-5",
          rightAligned && "justify-end",
        )}
      >
        <button
          type="button"
          onClick={() => onSort(id)}
          // Don't let a click on the label kick off a dnd-kit reorder drag.
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={`Sort by ${COLUMN_LABELS[id]}`}
          className="flex min-w-0 cursor-pointer items-center gap-1 rounded-sm transition-colors hover:text-foreground"
        >
          <span className="truncate">{COLUMN_LABELS[id]}</span>
          <SortIndicator dir={sortDir} />
        </button>
      </div>
      {/* Drag affordance: hints the column can be dragged to reorder. The whole
          header is the grab area, so this is decorative (pointer-events-none) and
          only appears on hover, tucked into the right corner beside the resize
          strip. */}
      <GripVertical
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-1.5 size-3.5 -translate-y-1/2 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100 print:hidden"
      />
      {/* Resize handle — its own cursor, and stops the pointerdown from
          reaching dnd-kit so dragging the edge resizes instead of reordering. */}
      <span
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${COLUMN_LABELS[id]} column`}
        onPointerDown={beginResize}
        onClick={(e) => e.stopPropagation()}
        className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize touch-none bg-transparent transition-colors hover:bg-primary/40 print:hidden"
      />
    </TableHead>
  );
}

function Row({
  row,
  columns,
  currency,
  locale,
  categories,
  profiles,
  today,
}: SharedProps & { row: TransactionRow; columns: ColumnId[] }) {
  const [editing, setEditing] = useState(false);
  const ctx: CellContext = { currency, locale };

  return (
    <>
      <TableRow
        onClick={() => setEditing(true)}
        className="cursor-pointer"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter") setEditing(true);
        }}
      >
        {columns.map((id) => {
          const column = COLUMNS[id];
          const cellClassName =
            typeof column.cellClassName === "function"
              ? column.cellClassName(row)
              : column.cellClassName;
          return (
            <TableCell key={id} className={cellClassName}>
              {column.render(row, ctx)}
            </TableCell>
          );
        })}
      </TableRow>

      <TransactionDialog
        mode="edit"
        open={editing}
        onOpenChange={setEditing}
        categories={categories}
        profiles={profiles}
        currency={currency}
        locale={locale}
        today={today}
        defaultValues={{
          id: row.id,
          type: row.type,
          amount: minorToInputString(row.amountMinor, currency, locale),
          categoryId: row.categoryId,
          profileId: row.profileId,
          title: row.title ?? "",
          description: row.description ?? "",
          occurredOn: row.occurredOn,
        }}
      />
    </>
  );
}

"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { GripVertical } from "lucide-react";
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

type ColumnId = "date" | "category" | "title" | "description" | "amount";

const DEFAULT_ORDER: ColumnId[] = ["date", "category", "title", "description", "amount"];
const STORAGE_KEY = "spendchat:txn-columns";

type CellContext = { currency: string; locale: string };

type ColumnDef = {
  label: string;
  headClassName?: string;
  cellClassName?: string | ((row: TransactionRow) => string);
  render: (row: TransactionRow, ctx: CellContext) => ReactNode;
};

/** Each column renders its own header and body cell, so a reordered `order`
 * array drives both in lockstep. */
const COLUMNS: Record<ColumnId, ColumnDef> = {
  date: {
    label: "Date",
    headClassName: "w-32",
    cellClassName: "whitespace-nowrap text-muted-foreground",
    render: (row, { locale }) => formatDateLabel(row.occurredOn, locale),
  },
  category: {
    label: "Category",
    render: (row) => (
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden>{row.categoryIcon ?? "💸"}</span>
        {row.categoryName ?? "Uncategorized"}
      </span>
    ),
  },
  title: {
    label: "Title",
    cellClassName: "max-w-40 truncate",
    render: (row) => row.title ?? "",
  },
  description: {
    label: "Description",
    headClassName: "hidden md:table-cell",
    cellClassName: "hidden max-w-56 truncate text-muted-foreground md:table-cell",
    render: (row) => row.description ?? "",
  },
  amount: {
    label: "Amount",
    headClassName: "text-right",
    cellClassName: (row) => cn("text-right font-medium tabular-nums", amountToneClass(row.type)),
    render: (row, { currency, locale }) =>
      formatMoney(signedMinor(row.type, row.amountMinor), currency, locale, { signed: true }),
  },
};

/** A stored order is only trusted if it's an exact permutation of the known
 * columns — guards against a stale key after columns are added/renamed. */
function isValidOrder(value: unknown): value is ColumnId[] {
  return (
    Array.isArray(value) &&
    value.length === DEFAULT_ORDER.length &&
    DEFAULT_ORDER.every((id) => value.includes(id))
  );
}

// The column order is a device-local view preference kept in localStorage. It's
// exposed through a tiny external store so `useSyncExternalStore` can read it in
// an SSR-safe way: the server snapshot is always the default (matching the
// rendered HTML), and after hydration React swaps in the stored order. The
// cached snapshot is referentially stable so render never loops.
const orderListeners = new Set<() => void>();
let orderSnapshot: ColumnId[] | null = null;

function readStoredOrder(): ColumnId[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (isValidOrder(saved)) return saved;
  } catch {
    // ignore unreadable/malformed storage
  }
  return DEFAULT_ORDER;
}

function getOrderSnapshot(): ColumnId[] {
  if (orderSnapshot === null) orderSnapshot = readStoredOrder();
  return orderSnapshot;
}

function subscribeOrder(onChange: () => void): () => void {
  orderListeners.add(onChange);
  // Reflect edits made in another tab.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    orderSnapshot = readStoredOrder();
    orderListeners.forEach((l) => l());
  };
  window.addEventListener("storage", onStorage);
  return () => {
    orderListeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function setStoredOrder(next: ColumnId[]) {
  orderSnapshot = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore write failures (private mode / quota)
  }
  orderListeners.forEach((l) => l());
}

export function TransactionsTable({
  rows,
  ...shared
}: SharedProps & { rows: TransactionRow[] }) {
  const order = useSyncExternalStore(subscribeOrder, getOrderSnapshot, () => DEFAULT_ORDER);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(active.id as ColumnId);
    const newIndex = order.indexOf(over.id as ColumnId);
    if (oldIndex < 0 || newIndex < 0) return;
    setStoredOrder(arrayMove(order, oldIndex, newIndex));
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border py-16 text-center text-sm text-muted-foreground">
        No transactions match these filters.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border print-area">
      <DndContext
        id="transactions-columns"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <SortableContext items={order} strategy={horizontalListSortingStrategy}>
                {order.map((id) => (
                  <SortableHeader key={id} id={id} />
                ))}
              </SortableContext>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <Row key={r.id} row={r} order={order} {...shared} />
            ))}
          </TableBody>
        </Table>
      </DndContext>
    </div>
  );
}

/** A draggable header cell. The whole `<th>` is the grab handle; dnd-kit's
 * `attributes` make it keyboard-operable, so reordering works without a mouse. */
function SortableHeader({ id }: { id: ColumnId }) {
  const column = COLUMNS[id];
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const rightAligned = id === "amount";
  const style: React.CSSProperties = {
    // Constrain the drag to the horizontal axis — a column never moves vertically.
    transform: transform ? `translateX(${transform.x}px)` : undefined,
    transition,
    zIndex: isDragging ? 10 : undefined,
  };
  return (
    <TableHead
      ref={setNodeRef}
      style={style}
      className={cn(
        "group cursor-grab touch-none select-none transition-colors hover:bg-muted/50",
        isDragging && "bg-muted",
        column.headClassName,
      )}
      {...attributes}
      {...listeners}
    >
      <span
        className={cn(
          "inline-flex items-center gap-1",
          rightAligned && "flex-row-reverse",
        )}
      >
        {column.label}
        <GripVertical className="size-3.5 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100" />
      </span>
    </TableHead>
  );
}

function Row({
  row,
  order,
  currency,
  locale,
  categories,
  profiles,
  today,
}: SharedProps & { row: TransactionRow; order: ColumnId[] }) {
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
        {order.map((id) => {
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

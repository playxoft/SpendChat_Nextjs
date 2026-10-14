import { STATUS_LABEL, isOverdue, type InvoiceKind, type InvoiceStatus } from "@/lib/invoices";
import { cn } from "@/lib/utils";

/**
 * A document's state as a small pill. Paid uses the app's one income accent
 * (emerald); overdue says so in the destructive tone; the rest stay neutral.
 */
export function InvoiceStatusBadge({
  kind,
  status,
  dueDate,
  today,
  className,
}: {
  kind: InvoiceKind;
  status: InvoiceStatus;
  dueDate: string | null;
  today: string;
  className?: string;
}) {
  const overdue = isOverdue({ kind, status, dueDate }, today);
  const label = overdue ? "Overdue" : STATUS_LABEL[status];
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-full border px-2 text-xs font-medium whitespace-nowrap",
        status === "draft" && "border-dashed text-muted-foreground",
        status === "sent" && !overdue && "bg-muted text-foreground",
        overdue && "border-destructive/30 bg-destructive/10 text-destructive",
        status === "paid" && "border-emerald-600/20 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
        status === "void" && "text-muted-foreground line-through",
        className,
      )}
    >
      {label}
    </span>
  );
}

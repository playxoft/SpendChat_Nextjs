import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/app/invoices", label: "Invoices & quotes", key: "documents" },
  { href: "/app/invoices/clients", label: "Clients", key: "clients" },
  { href: "/app/invoices/details", label: "Your details", key: "details" },
] as const;

/** The invoices section's three pages, as tabs under its header. */
export function InvoicesTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="Invoices" className="flex gap-1 overflow-x-auto border-b">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={active === tab.key ? "page" : undefined}
          className={cn(
            "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            active === tab.key
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

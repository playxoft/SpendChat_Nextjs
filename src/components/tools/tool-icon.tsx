import {
  Cake,
  CalendarDays,
  ClipboardList,
  CreditCard,
  FileText,
  PenLine,
  Percent,
  PiggyBank,
  Receipt,
  TrendingUp,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * Icon names used in `src/lib/tools.ts`, resolved to components here so the
 * registry stays dependency-free (the sitemap imports it).
 */
const ICONS: Record<string, LucideIcon> = {
  Cake,
  CalendarDays,
  ClipboardList,
  CreditCard,
  FileText,
  PenLine,
  Percent,
  PiggyBank,
  Receipt,
  TrendingUp,
  Zap,
};

export function ToolIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Wrench;
  return <Icon className={className} aria-hidden />;
}

import {
  ArrowRightLeft,
  BriefcaseBusiness,
  Cake,
  Calculator,
  CalendarDays,
  ChartLine,
  CreditCard,
  FileText,
  Flame,
  HandCoins,
  Landmark,
  Percent,
  PiggyBank,
  Receipt,
  ReceiptText,
  Scale,
  ShoppingBasket,
  Split,
  Target,
  TrendingUp,
  Type,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { ToolTint } from "@/lib/tools";
import { cn } from "@/lib/utils";

/**
 * Resolves the icon names and tints held in `src/lib/tools.ts` to components
 * and classes — the same split as `marketing/feature-icon.tsx`: the registry
 * stays free of React and `lucide-react`, and this is the one place that pays
 * for the icons.
 */
const ICONS: Record<string, LucideIcon> = {
  ArrowRightLeft,
  BriefcaseBusiness,
  Cake,
  Calculator,
  CalendarDays,
  ChartLine,
  CreditCard,
  FileText,
  Flame,
  HandCoins,
  Landmark,
  Percent,
  PiggyBank,
  Receipt,
  ReceiptText,
  Scale,
  ShoppingBasket,
  Split,
  Target,
  TrendingUp,
  Type,
  Wallet,
  Zap,
};

/** Whether `name` resolves — the registry test checks every tool against it. */
export function hasToolIcon(name: string): boolean {
  return name in ICONS;
}

/**
 * Tile colours per tint: a pale fill and a deep glyph in light mode, a faint
 * wash and a light glyph in dark — each pair clears 3:1 for the glyph, which is
 * what a non-text mark needs. Written out in full so Tailwind sees the classes.
 */
const TINTS: Record<ToolTint, string> = {
  sky: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  lime: "bg-lime-100 text-lime-700 dark:bg-lime-500/15 dark:text-lime-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  rose: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  indigo: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
  teal: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
};

/** A tool's icon on its group's coloured tile. */
export function ToolIconTile({
  name,
  tint,
  className,
}: {
  name: string;
  tint: ToolTint;
  className?: string;
}) {
  // An unknown name means the registry and this map drifted; fall back rather
  // than crash a marketing page over an icon.
  const Icon = ICONS[name] ?? Calculator;
  return (
    <span
      aria-hidden
      className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", TINTS[tint], className)}
    >
      <Icon className="size-4" />
    </span>
  );
}

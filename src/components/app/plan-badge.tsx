import { Badge } from "@/components/ui/badge";
import { PLAN_NAMES, type PersonalPlan } from "@/lib/plans";
import { cn } from "@/lib/utils";

/**
 * A workspace's plan as a small badge — Free / Plus / Pro. Neutral on purpose
 * (no plan colours): Free is outlined, the paid plans are filled, so the
 * difference reads without introducing a palette.
 */
export function PlanBadge({ plan, className }: { plan: PersonalPlan; className?: string }) {
  return (
    <Badge
      variant={plan === "free" ? "outline" : plan === "plus" ? "secondary" : "default"}
      className={cn("h-4.5 px-1.5 text-[11px] leading-none", className)}
    >
      {PLAN_NAMES[plan]}
    </Badge>
  );
}

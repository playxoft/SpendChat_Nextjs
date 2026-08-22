import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The line under a demo that tells the visitor it's real and safe to touch.
 *
 * It earns its place: without it people read an embedded app as a screenshot
 * and never click. Saying "nothing is saved" up front is the other half —
 * hesitation on a money product is about consequence, not curiosity.
 */
export function DemoCaption({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("mt-3 text-center text-xs text-muted-foreground", className)}>
      {children}
    </p>
  );
}

/** The standard caption: what to try, plus the reassurance. */
export function TryItCaption({ action }: { action: string }) {
  return (
    <DemoCaption>
      <span className="font-medium text-foreground">Live demo</span> — {action}.
      Nothing is saved and no account is needed.
    </DemoCaption>
  );
}

"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The control that starts a demo over, in the one place every demo puts it:
 * under the frame, centred.
 *
 * It used to live inside the widget, in the composer's control strip. That
 * strip is a copy of the app's, and the app has no Replay button in it — so a
 * demo that added one was editing the thing it was meant to be showing, and on
 * a narrow screen it was also competing for the width the real controls needed.
 * Outside the frame it reads as what it is: a control belonging to the page,
 * not to the app.
 */
export function DemoReplay({
  onClick,
  label = "Replay",
  className,
}: {
  onClick: () => void;
  /** "Reset" where the demo restores your edits rather than replaying a script. */
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn("mt-3 flex justify-center", className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onClick}
        className="h-8 gap-1.5 rounded-full text-xs text-muted-foreground"
      >
        <RotateCcw className="size-3.5" />
        {label}
      </Button>
    </div>
  );
}

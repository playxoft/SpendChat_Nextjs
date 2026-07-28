import { Eye } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shown in place of the compose / add controls when the current user can't write
 * to any profile in the workspace (a "pure viewer"). Purely cosmetic — the
 * server enforces the same per-profile role on every mutation.
 *
 * `variant="bar"` matches the composer's sticky bottom bar (tracker); the default
 * `"card"` is an inline notice (transactions page).
 */
export function ViewerNotice({
  variant = "card",
  className,
}: {
  variant?: "card" | "bar";
  className?: string;
}) {
  const message = (
    <span className="flex items-center justify-center gap-2 text-center text-sm text-muted-foreground">
      {/* The bottom composer bar reads cleaner as plain text; the icon only helps
          the inline card notice. */}
      {variant === "card" && <Eye className="size-4 shrink-0" />}
      You’re a viewer here — you can browse transactions but can’t add them. Ask an admin for edit
      access.
    </span>
  );

  if (variant === "bar") {
    return (
      <div
        className={cn(
          "sticky bottom-16 z-20 border-t bg-background px-3 py-3 md:bottom-0 md:bg-background/95 md:backdrop-blur-sm",
          className,
        )}
      >
        <div className="mx-auto max-w-3xl">{message}</div>
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg border bg-muted/40 px-3 py-2.5", className)}>{message}</div>
  );
}

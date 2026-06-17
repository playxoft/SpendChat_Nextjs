import { cn } from "@/lib/utils";
import { siteConfig } from "@/lib/site";

export function Logo({
  className,
  showText = true,
}: {
  className?: string;
  showText?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold", className)}>
      <span
        aria-hidden
        className="flex size-7 items-center justify-center rounded-md bg-foreground text-sm font-bold text-background"
      >
        M
      </span>
      {showText && (
        <span className="text-base tracking-tight">{siteConfig.name}</span>
      )}
    </span>
  );
}

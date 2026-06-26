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
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="size-7 text-foreground"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Chat bubble — SpendChat's mark */}
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        {/* Currency symbol inside the bubble */}
        <text
          x="12"
          y="10.4"
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="9"
          fontWeight="600"
          fontFamily="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
          fill="currentColor"
          stroke="none"
        >
          $
        </text>
      </svg>
      {showText && (
        <span className="text-base tracking-tight">{siteConfig.name}</span>
      )}
    </span>
  );
}

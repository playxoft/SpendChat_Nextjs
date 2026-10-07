import { authorColorClass } from "@/lib/author-color";
import { initialsOf } from "@/lib/split-display";
import { cn } from "@/lib/utils";

/**
 * A member as initials in a circle, in their stable chat colour (the same
 * per-id palette the tracker uses for authors). No photos: a group can hold
 * people who have no account yet.
 */
export function MemberAvatar({
  id,
  name,
  size = "md",
  className,
}: {
  id: string;
  name: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      title={name}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-muted font-semibold",
        size === "sm" ? "size-6 text-[10px]" : "size-8 text-xs sm:size-9",
        authorColorClass(id),
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

/** Overlapping avatars for the header: the first few people, then "+N". */
export function AvatarStack({
  people,
  max = 4,
  className,
}: {
  people: { id: string; name: string }[];
  max?: number;
  className?: string;
}) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <span className={cn("flex -space-x-1.5", className)}>
      {shown.map((p) => (
        <MemberAvatar key={p.id} id={p.id} name={p.name} size="sm" className="ring-2 ring-background" />
      ))}
      {rest > 0 && (
        <span className="inline-flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground ring-2 ring-background">
          +{rest}
        </span>
      )}
    </span>
  );
}

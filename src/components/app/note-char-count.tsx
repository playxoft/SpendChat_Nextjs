import { aiNoteMaxChars, aiNoteRoomierPlan } from "@/lib/ai-limits";
import { PLAN_NAMES, type PersonalPlan } from "@/lib/plans";
import { cn } from "@/lib/utils";

/** The share of the cap past which the count turns amber. */
const WARN_AT = 0.9;

const n = (value: number) => value.toLocaleString("en-US");

/**
 * "120 / 1,000" in the AI note's bottom-left corner: how much of this plan's
 * note length (`aiNoteChars`) is used. Quiet until the last tenth, amber
 * there, red at the cap, where it also names the plan that takes a longer
 * note. The textarea's `maxLength` is what actually stops typing; this only
 * shows where that is.
 *
 * Screen readers get it as the field's description ("120 of 1,000
 * characters"), read when the field is focused rather than on every keystroke.
 */
export function NoteCharCount({
  id,
  length,
  plan,
  className,
}: {
  id: string;
  length: number;
  plan: PersonalPlan;
  className?: string;
}) {
  const max = aiNoteMaxChars(plan);
  const full = length >= max;
  const roomier = full ? aiNoteRoomierPlan(plan) : null;
  return (
    <p
      id={id}
      className={cn(
        "pointer-events-none truncate text-[0.6875rem] leading-4 tabular-nums transition-colors",
        full
          ? "text-destructive"
          : length >= max * WARN_AT
            ? "text-amber-600 dark:text-amber-500"
            : "text-muted-foreground/70",
        className,
      )}
    >
      <span aria-hidden>
        {n(length)} / {n(max)}
        {roomier ? ` · ${PLAN_NAMES[roomier]} allows ${n(aiNoteMaxChars(roomier))}` : null}
      </span>
      <span className="sr-only">
        {n(length)} of {n(max)} characters
        {roomier ? `. ${PLAN_NAMES[roomier]} allows ${n(aiNoteMaxChars(roomier))}.` : null}
      </span>
    </p>
  );
}

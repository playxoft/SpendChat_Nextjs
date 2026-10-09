"use client";

import { ShareSliderRow, type SplitPerson } from "@/components/split/split-people-list";
import type { SliderInput } from "@/lib/split-slider-input";
import { cn } from "@/lib/utils";
import { MemberAvatar } from "./member-avatar";
import type { ExpenseEditor } from "./use-expense-editor";

/**
 * With several payers: a slider each for what they paid, evenly to start and
 * always adding up to the amount. Nothing when one person paid.
 */
export function PayerSliders({
  editor,
  people,
  totalMinor,
  format,
  input,
  disabled,
  className,
}: {
  editor: ExpenseEditor;
  people: SplitPerson[];
  totalMinor: number;
  format: (minor: number) => string;
  /** The number box beside each slider (amounts in the group's currency). */
  input: SliderInput;
  /** While saving. */
  disabled?: boolean;
  className?: string;
}) {
  const state = editor.payers;
  if (!state) return null;
  const byId = new Map(people.map((p) => [p.id, p]));
  return (
    <section aria-label="What each payer paid" className={cn("px-3 py-1", className)}>
      <p className="pt-1.5 text-sm font-medium">What each paid</p>
      <div className="divide-y">
        {editor.payerIds.map((id) => {
          const person = byId.get(id) ?? { id, name: "Someone" };
          return (
            <ShareSliderRow
              key={id}
              person={person}
              avatar={<MemberAvatar id={id} name={person.name} size="sm" />}
              what="Paid"
              disabled={disabled || totalMinor === 0}
              binding={{ state, step: editor.moneyStep, format, input, onMove: editor.movePayer }}
            />
          );
        })}
      </div>
      {totalMinor === 0 && (
        <p className="pb-2 text-xs text-muted-foreground">Enter the amount to divide it between them.</p>
      )}
    </section>
  );
}

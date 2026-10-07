"use client";

import { useState, type RefObject } from "react";
import { Mail, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DRAFT_EMAIL_MAX,
  DRAFT_PEOPLE_MAX,
  DRAFT_PERSON_NAME_MAX,
  emailProblems,
  personLabel,
  type DraftPerson,
} from "@/lib/tools/split-bill";
import { cn } from "@/lib/utils";

/**
 * The calculator's people: a name each, and an optional email. With an email,
 * that person is invited automatically when the group is saved to the app
 * (`/app/split/import`); without one, they're asked for there. Emails get a
 * light check here — format and duplicates, shown once a field is left — and
 * the app checks them properly.
 */

const input =
  "h-11 w-full min-w-0 rounded-xl border border-input bg-background px-3 text-base outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30";

export function PeopleEditor({
  people,
  focusId,
  onChange,
  onAdd,
  onRemove,
  onInvite,
}: {
  people: DraftPerson[];
  /** The id of a row that was just added, to focus once it mounts. */
  focusId: RefObject<string | null>;
  onChange: (people: DraftPerson[]) => void;
  onAdd: () => void;
  /** Refuses (with a message) someone who's on an expense. */
  onRemove: (id: string) => void;
  onInvite: () => void;
}) {
  // A field's problem shows once it's been left, not while it's being typed.
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const problems = emailProblems(people);
  const atCap = people.length >= DRAFT_PEOPLE_MAX;

  const patch = (id: string, change: Partial<DraftPerson>) =>
    onChange(people.map((p) => (p.id === id ? { ...p, ...change } : p)));

  return (
    <section aria-labelledby="split-people">
      <div className="flex items-baseline justify-between gap-3 border-b pb-2">
        <h2 id="split-people" className="text-base font-semibold">
          People
        </h2>
        <span className="text-sm text-muted-foreground tabular-nums">
          {people.length} of {DRAFT_PEOPLE_MAX}
        </span>
      </div>
      <ul className="mt-3 space-y-3 sm:space-y-2">
        {people.map((p, i) => {
          const you = i === 0;
          const label = personLabel(people, p.id);
          const problem = touched.has(p.id) ? problems[p.id] : undefined;
          const errorId = `split-person-${p.id}-email-error`;
          return (
            <li key={p.id}>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_auto]">
                <div className="relative min-w-0">
                  <input
                    ref={(el) => {
                      if (el && focusId.current === p.id) {
                        focusId.current = null;
                        el.focus();
                      }
                    }}
                    type="text"
                    value={p.name}
                    maxLength={DRAFT_PERSON_NAME_MAX}
                    placeholder={you ? "Your name" : "Their name"}
                    aria-label={you ? "Your name" : `Person ${i + 1}'s name`}
                    autoComplete="off"
                    enterKeyHint={i === people.length - 1 ? "next" : "done"}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && i === people.length - 1 && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        onAdd();
                      }
                    }}
                    onChange={(e) => patch(p.id, { name: e.target.value })}
                    className={cn(input, you && "pr-14")}
                  />
                  {you && (
                    <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
                      You
                    </span>
                  )}
                </div>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  spellCheck={false}
                  value={p.email ?? ""}
                  maxLength={DRAFT_EMAIL_MAX}
                  placeholder={you ? "Your email (optional)" : "Email (optional)"}
                  aria-label={you ? "Your email (optional)" : `${label}'s email (optional)`}
                  aria-invalid={problem ? true : undefined}
                  aria-describedby={problem ? errorId : undefined}
                  onChange={(e) => patch(p.id, { email: e.target.value })}
                  onBlur={() => !touched.has(p.id) && setTouched(new Set([...touched, p.id]))}
                  className={cn(input, "col-span-2 row-start-2 sm:col-span-1 sm:col-start-2 sm:row-start-1")}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="col-start-2 row-start-1 size-11 shrink-0 rounded-xl text-muted-foreground sm:col-start-3"
                  aria-label={`Remove ${label}`}
                  disabled={people.length <= 1}
                  onClick={() => onRemove(p.id)}
                >
                  <X />
                </Button>
              </div>
              {problem && (
                <p id={errorId} className="mt-1 text-xs text-destructive">
                  {problem}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        Emails are optional. Add them and everyone is invited as soon as you save the group — or leave
        them blank and add them then.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="h-10 rounded-xl" onClick={onAdd} disabled={atCap}>
          <Plus /> Add a person
        </Button>
        <Button type="button" variant="ghost" className="h-10 rounded-xl" onClick={onInvite}>
          <Mail /> Send invites
        </Button>
      </div>
      {atCap && (
        <p className="mt-2 text-xs text-muted-foreground">
          A group holds up to {DRAFT_PEOPLE_MAX} people, you included.
        </p>
      )}
    </section>
  );
}

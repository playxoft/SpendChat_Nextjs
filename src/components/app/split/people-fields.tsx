"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SPLIT_MEMBER_NAME_MAX } from "@/lib/validation";

export type PersonDraft = { name: string; email: string };

export const EMPTY_PERSON: PersonDraft = { name: "", email: "" };

/** Rows that have something typed in them, trimmed, emails lowercased. */
export function filledPeople(rows: PersonDraft[]): PersonDraft[] {
  return rows
    .map((r) => ({ name: r.name.trim(), email: r.email.trim().toLowerCase() }))
    .filter((r) => r.name || r.email);
}

/**
 * Name + email rows for adding people to a split group. The name is what the
 * group sees; the email only the creator sees — it's how the person is invited.
 */
export function PeopleFields({
  rows,
  onChange,
  max,
}: {
  rows: PersonDraft[];
  onChange: (rows: PersonDraft[]) => void;
  /** How many rows fit before the group is full. */
  max: number;
}) {
  function update(i: number, patch: Partial<PersonDraft>) {
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }
  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            aria-label={`Person ${i + 1} name`}
            placeholder="Name"
            value={row.name}
            maxLength={SPLIT_MEMBER_NAME_MAX}
            onChange={(e) => update(i, { name: e.target.value })}
            className="w-2/5"
          />
          <Input
            aria-label={`Person ${i + 1} email`}
            placeholder="Email"
            type="email"
            inputMode="email"
            autoComplete="off"
            value={row.email}
            onChange={(e) => update(i, { email: e.target.value })}
            className="flex-1"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remove person ${i + 1}`}
            onClick={() => onChange(rows.length === 1 ? [EMPTY_PERSON] : rows.filter((_, j) => j !== i))}
          >
            <X />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={rows.length >= max}
        onClick={() => onChange([...rows, EMPTY_PERSON])}
      >
        <Plus /> Add another person
      </Button>
    </div>
  );
}

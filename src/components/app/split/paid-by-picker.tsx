"use client";

import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { payersLabel } from "@/lib/split-display";
import { cn } from "@/lib/utils";
import { AvatarStack, MemberAvatar } from "./member-avatar";

/**
 * "Paid by" — one person or several. Ticking stays open so several can be
 * picked; the last payer can't be unticked. Payers have to be in the split, so
 * anyone not in it is greyed out (a payer already on an older expense who
 * isn't in its split stays ticked until changed).
 */
export function PaidByPicker({
  members,
  meMemberId,
  payerIds,
  included,
  onChange,
  compact = false,
  id,
  className,
}: {
  members: { id: string; name: string }[];
  meMemberId: string;
  payerIds: string[];
  included: ReadonlySet<string>;
  onChange: (ids: string[]) => void;
  /** The composer's chip: avatars and a short label. */
  compact?: boolean;
  id?: string;
  className?: string;
}) {
  const nameOf = (memberId: string) => members.find((m) => m.id === memberId)?.name ?? "Someone";
  const payers = payerIds.map((p) => ({ id: p, name: nameOf(p) }));
  const who = payersLabel(payers.map((p) => ({ name: p.name, isYou: p.id === meMemberId })));
  const label = `${who} paid`;
  const toggle = (memberId: string, on: boolean) => {
    const next = members.map((m) => m.id).filter((m) => (m === memberId ? on : payerIds.includes(m)));
    if (next.length) onChange(next);
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-label={`Paid by: ${who}`}
          className={cn(
            compact
              ? "h-8 w-auto max-w-44 shrink-0 gap-1.5 rounded-full bg-background px-1.5 pr-2.5"
              : "w-full justify-start gap-2 font-normal",
            className,
          )}
        >
          {payerIds.length === 1 ? (
            <MemberAvatar id={payerIds[0]!} name={payers[0]!.name} size="sm" />
          ) : (
            <AvatarStack people={payers} max={2} />
          )}
          <span className="min-w-0 truncate">{label}</span>
          <ChevronDown className="ml-auto size-3.5 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 min-w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Who paid? Pick one or more</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {members.map((m) => {
          const on = payerIds.includes(m.id);
          const out = !included.has(m.id) && !on;
          return (
            <DropdownMenuCheckboxItem
              key={m.id}
              checked={on}
              disabled={out || (on && payerIds.length === 1)}
              // Stay open, so several can be ticked in one go.
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={(v) => toggle(m.id, v === true)}
            >
              <MemberAvatar id={m.id} name={m.name} size="sm" />
              <span className="min-w-0 flex-1 truncate">{m.id === meMemberId ? `${m.name} (you)` : m.name}</span>
              {out && <span className="text-xs text-muted-foreground">Not in the split</span>}
            </DropdownMenuCheckboxItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

"use client";

import Link from "next/link";
import { ArrowRight, BellOff, Mail, RefreshCw, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SPLIT_GROUP_MAX_PEOPLE } from "@/lib/plans";
import { SPLIT_SIGN_IN_HREF, SPLIT_SIGN_UP_HREF } from "@/lib/split-import";

/**
 * The split calculator's sign-up prompts. Everything a visitor needs to work
 * out who owes whom is free and open; what an account adds is the part a
 * browser tab can't do — other people. So the prompt opens only when the
 * visitor asks for exactly that (save, share with the group, invite by email), and
 * it sells the outcome rather than the account.
 *
 * Both buttons carry `?next=/app/split/import`: the draft lives in this
 * browser's storage, so after sign-up (or sign-in) the import page picks the
 * group up and creates it for real — nothing to retype.
 */

export type GateKind = "save" | "share" | "invite";

const COPY: Record<GateKind, { title: string; lead: string }> = {
  save: {
    title: "Keep this group, free",
    lead: "Create a free account and the group comes with you — everyone in it, every expense, every balance.",
  },
  share: {
    title: "Share it with the group",
    lead: "A screenshot is out of date the moment someone pays for the next round. Save the group free and invite everyone — they see the same balances, kept up to date.",
  },
  invite: {
    title: "Invite everyone by email",
    lead: "Save the group free and add each person's email. Each of them gets an invite — by email, or in the app if they already use SpendChat.",
  },
};

const OUTCOMES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Mail,
    title: "Everyone gets an invite",
    body: "By email, or in the app if they already use SpendChat. Joining takes a free account — nothing to install.",
  },
  {
    icon: RefreshCw,
    title: "Everyone sees the balance live",
    body: "Once they've joined, anyone adds an expense and the totals update for the whole group.",
  },
  {
    icon: BellOff,
    title: "Nobody chases anyone",
    body: "Who owes whom is always on screen. Mark a payment as paid and it drops off the list.",
  },
];

export function SignUpGate({
  kind,
  open,
  location,
  onOpenChange,
}: {
  /** Which prompt — kept while it closes, so the copy doesn't change mid-animation. */
  kind: GateKind;
  open: boolean;
  /** The tracking location, e.g. `tool_split-bill-calculator_gate`. */
  location: string;
  onOpenChange: (open: boolean) => void;
}) {
  const copy = COPY[kind];
  const track = (label: string) => JSON.stringify({ location, label: `${kind}_${label}` });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">{copy.title}</DialogTitle>
          <DialogDescription>{copy.lead}</DialogDescription>
        </DialogHeader>

        <ul className="space-y-3">
          {OUTCOMES.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-muted/60 text-muted-foreground">
                <Icon className="size-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">{title}</p>
                <p className="text-sm text-muted-foreground">{body}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-2 pt-1">
          <Button asChild className="h-11 rounded-xl">
            <Link href={SPLIT_SIGN_UP_HREF} data-track-event="cta_click" data-track-params={track("sign_up")}>
              Create my free account <ArrowRight />
            </Link>
          </Button>
          <Button asChild variant="ghost" className="h-10 rounded-xl">
            <Link href={SPLIT_SIGN_IN_HREF} data-track-event="cta_click" data-track-params={track("sign_in")}>
              I already have an account
            </Link>
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Free on every plan, for groups of up to {SPLIT_GROUP_MAX_PEOPLE}. Your group comes with you —
          nothing to type again.
        </p>
      </DialogContent>
    </Dialog>
  );
}

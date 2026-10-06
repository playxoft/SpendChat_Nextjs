"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { addSplitMembers, removeSplitMember, sendSplitInviteEmail } from "@/actions/split";
import { splitInvitePath } from "@/lib/invite-links";
import type { SplitMemberView } from "@/services/split";
import { BalanceText } from "./balance-text";
import { EMPTY_PERSON, filledPeople, PeopleFields, type PersonDraft } from "./people-fields";
import { toastAdded } from "./added-toast";

/**
 * Who's in the group. Everyone sees names and balances; the creator also sees
 * emails, adds people and removes anyone who's settled up.
 */
export function MembersDialog({
  open,
  onOpenChange,
  groupId,
  members,
  isCreator,
  peopleCount,
  maxPeople,
  currency,
  locale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  members: SplitMemberView[];
  isCreator: boolean;
  peopleCount: number;
  maxPeople: number;
  currency: string;
  locale: string;
}) {
  const router = useRouter();
  const [people, setPeople] = React.useState<PersonDraft[]>([EMPTY_PERSON]);
  const [pending, setPending] = React.useState(false);
  const room = maxPeople - peopleCount;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const list = filledPeople(people);
    if (list.length === 0) return;
    if (list.some((p) => !p.name || !p.email)) {
      toast.error("Add a name and an email for everyone");
      return;
    }
    setPending(true);
    const res = await addSplitMembers(groupId, { members: list });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toastAdded(res.added, new Map(list.map((p) => [p.email, p.name])));
    setPeople([EMPTY_PERSON]);
    router.refresh();
  }

  async function copyLink(m: SplitMemberView) {
    if (!m.inviteToken) return;
    const url = `${window.location.origin}${splitInvitePath(m.inviteToken)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(`Invite link copied — it only works for ${m.name}'s email`);
    } catch {
      toast.error("Couldn't copy the link");
    }
  }

  async function sendEmail(m: SplitMemberView) {
    setPending(true);
    const res = await sendSplitInviteEmail(groupId, m.id);
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    if (res.emailed) toast.success(`We emailed ${m.name} an invite`);
    else toast.error("You've sent today's invite emails — share their link instead, or try tomorrow");
    router.refresh();
  }

  async function remove(m: SplitMemberView) {
    setPending(true);
    const res = await removeSplitMember(groupId, m.id);
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`${m.name} was removed`);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>People</DialogTitle>
          <DialogDescription>
            {peopleCount} of {maxPeople} people, you included.
            {isCreator ? " Only you see their emails." : null}
          </DialogDescription>
        </DialogHeader>

        <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-sm font-medium">
                  {m.name}
                  {m.isYou && <span className="text-xs font-normal text-muted-foreground">(you)</span>}
                  {m.isCreator && <Badge variant="secondary">Created it</Badge>}
                  {m.status === "invited" && <Badge variant="outline">Invited</Badge>}
                  {m.status === "left" && <Badge variant="outline">Left</Badge>}
                </p>
                {m.email && <p className="truncate text-xs text-muted-foreground">{m.email}</p>}
                {isCreator && m.status === "invited" && (
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    {m.inviteToken && (
                      <button type="button" className="underline-offset-4 hover:underline" onClick={() => copyLink(m)}>
                        Copy invite link
                      </button>
                    )}
                    {m.canSendInviteEmail ? (
                      <button
                        type="button"
                        className="underline-offset-4 hover:underline disabled:opacity-50"
                        disabled={pending}
                        onClick={() => sendEmail(m)}
                      >
                        Send invite email
                      </button>
                    ) : m.invitedByEmail ? (
                      <span className="text-muted-foreground">Invite emailed</span>
                    ) : (
                      <span className="text-muted-foreground">Sees it in the app</span>
                    )}
                  </div>
                )}
              </div>
              <BalanceText netMinor={m.netMinor} currency={currency} locale={locale} className="text-xs" />
              {isCreator && !m.isYou && m.status !== "left" && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending || m.netMinor !== 0}
                  title={m.netMinor !== 0 ? "Settle up first" : undefined}
                  onClick={() => remove(m)}
                >
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>

        {isCreator &&
          (room > 0 ? (
            <form onSubmit={add} className="space-y-2">
              <p className="text-sm font-medium">Add people</p>
              <PeopleFields rows={people} onChange={setPeople} max={room} />
              <div className="flex justify-end">
                <Button type="submit" disabled={pending}>
                  {pending ? "Adding…" : "Add"}
                </Button>
              </div>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              Groups hold up to {maxPeople} people. Remove someone who&apos;s settled up to make room.
            </p>
          ))}
      </DialogContent>
    </Dialog>
  );
}

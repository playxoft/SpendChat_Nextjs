import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { redactEmail } from "@/lib/email";
import { getSplitInviteByToken } from "@/services/split-invites";
import { SplitInviteCard, SplitInviteGone } from "./split-invite-card";

// Reads the session cookie and the DB — never cached.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Join a split group",
  description: "Accept an invitation to share costs in a SpendChat split group.",
  // Tokenised, per-person URLs; `/invite/` is also disallowed in robots.ts.
  robots: { index: false, follow: false },
};

/**
 * The join page behind a split invite email (or a link the group's creator
 * shared). Decided on the server, like the workspace join page:
 *
 *   signed out          → what's on offer, plus "Create account" / "Sign in",
 *                         each carrying `?next=` back here
 *   signed in, matches  → a Join button bound to the invited email
 *   signed in, other    → refuse, and offer to switch accounts
 *
 * The invited address is shown in full only to that account; anyone else
 * holding the link (it can be pasted into a group chat) sees it masked.
 * Nothing inside the group — amounts, people — is shown before joining.
 */
export default async function SplitInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [invite, user] = await Promise.all([getSplitInviteByToken(token), getCurrentUser()]);

  if (!invite) return <SplitInviteGone signedIn={user !== null} />;

  const state = !user
    ? "anonymous"
    : user.email?.trim().toLowerCase() === invite.email
      ? "match"
      : "mismatch";

  return (
    <SplitInviteCard
      token={token}
      state={state}
      groupName={invite.groupName}
      groupIcon={invite.groupIcon}
      inviterName={invite.inviterName}
      peopleCount={invite.peopleCount}
      currency={invite.currency}
      invitedEmail={state === "match" ? invite.email : redactEmail(invite.email)}
      currentEmail={user?.email ?? null}
    />
  );
}

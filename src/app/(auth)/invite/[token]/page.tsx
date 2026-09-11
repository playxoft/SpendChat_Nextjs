import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { describeScope } from "@/lib/email-templates";
import { getInviteByToken } from "@/services/workspaces";
import { InviteCard, InviteGone } from "./invite-card";

// Reads the session cookie and the DB — never cached.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Join a workspace",
  description: "Accept an invitation to a shared SpendChat workspace.",
  // Tokenised, per-person URLs; also disallowed in robots.ts.
  robots: { index: false, follow: false },
};

/**
 * The join page behind every invite email. Three states, decided here on the
 * server so the client never sees an invite it shouldn't act on:
 *
 *   signed out          → what's on offer, plus "Create account" / "Sign in",
 *                         each carrying `?next=` back here and the invited email
 *   signed in, matches  → a Join button (server action) that accepts and
 *                         switches the current workspace
 *   signed in, other    → refuse, and offer to switch accounts
 *
 * An unknown token — accepted already, withdrawn, or made up — gets a plain
 * explanation rather than a 404, since the most common way to reach it is the
 * invitee clicking the email a second time.
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [invite, user] = await Promise.all([getInviteByToken(token), getCurrentUser()]);

  if (!invite) return <InviteGone signedIn={user !== null} />;

  const state = !user
    ? "anonymous"
    : user.email?.trim().toLowerCase() === invite.email
      ? "match"
      : "mismatch";

  return (
    <InviteCard
      token={token}
      state={state}
      workspaceName={invite.workspaceName}
      workspaceIcon={invite.workspaceIcon}
      inviterName={invite.inviterName}
      scopeText={describeScope(invite.workspaceName, invite.scope)}
      invitedEmail={invite.email}
      currentEmail={user?.email ?? null}
    />
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { signOut } from "firebase/auth";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { acceptSplitInvite } from "@/actions/split";
import { clearSession, getFirebaseAuth } from "@/lib/firebase";
import { splitInvitePath } from "@/lib/invite-links";
import { withNext } from "@/lib/next-path";
import { siteConfig } from "@/lib/site";
import { cn } from "@/lib/utils";

type Props = {
  token: string;
  state: "anonymous" | "match" | "mismatch";
  groupName: string;
  groupIcon: string | null;
  inviterName: string | null;
  peopleCount: number;
  currency: string;
  /** In full for the invited account; masked ("r***@x.com") for anyone else. */
  invitedEmail: string;
  currentEmail: string | null;
};

function Header({ groupName, groupIcon, inviterName, peopleCount, currency }: Props) {
  return (
    <div className="space-y-3 text-center">
      <div
        aria-hidden
        className="mx-auto flex size-14 items-center justify-center rounded-2xl border bg-card text-3xl"
      >
        {groupIcon ?? "🧾"}
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Join {groupName}</h1>
      <p className="text-sm text-muted-foreground">
        {inviterName ? <span className="font-medium text-foreground">{inviterName}</span> : "Someone"}{" "}
        added you to split costs — {peopleCount} {peopleCount === 1 ? "person" : "people"}, in{" "}
        {currency}. Everyone adds what they paid; {siteConfig.name} works out who owes whom.
      </p>
    </div>
  );
}

export function SplitInviteCard(props: Props) {
  const { token, state, invitedEmail, currentEmail } = props;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [switching, setSwitching] = useState(false);
  const next = splitInvitePath(token);

  function join() {
    startTransition(async () => {
      const res = await acceptSplitInvite(token);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`You joined ${props.groupName}`);
      router.push(`/app/split/${res.groupId}`);
      router.refresh();
    });
  }

  async function switchAccount() {
    setSwitching(true);
    try {
      await signOut(getFirebaseAuth());
      await clearSession();
      router.push(withNext("/sign-in", next));
      router.refresh();
    } catch {
      toast.error("Couldn't sign out. Try again.");
      setSwitching(false);
    }
  }

  return (
    <div className="space-y-6">
      <Header {...props} />

      {state === "anonymous" && (
        <div className="space-y-3">
          <Link href={withNext("/sign-up", next)} className={cn(buttonVariants(), "h-10 w-full")}>
            Create a free account
          </Link>
          <Link
            href={withNext("/sign-in", next)}
            className={cn(buttonVariants({ variant: "outline" }), "h-10 w-full")}
          >
            I already have an account
          </Link>
          <p className="text-center text-xs text-muted-foreground">
            The invite is for <span className="font-medium text-foreground">{invitedEmail}</span>.
            Sign in or sign up with that address to join.
          </p>
        </div>
      )}

      {state === "match" && (
        <div className="space-y-3">
          <Button className="h-10 w-full" onClick={join} disabled={pending}>
            {pending ? "Joining…" : "Join group"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Signed in as {currentEmail}. Split groups sit outside your workspaces — find them under
            Split.
          </p>
        </div>
      )}

      {state === "mismatch" && (
        <div className="space-y-3">
          <p className="rounded-lg border bg-card p-3 text-sm text-muted-foreground">
            This invite was sent to{" "}
            <span className="font-medium text-foreground">{invitedEmail}</span>, but you&apos;re
            signed in as <span className="font-medium text-foreground">{currentEmail}</span>.
            Switch to that account to join, or ask {props.inviterName ?? "whoever invited you"} to
            add {currentEmail} instead.
          </p>
          <Button variant="outline" className="h-10 w-full" onClick={switchAccount} disabled={switching}>
            {switching ? "Signing out…" : "Switch account"}
          </Button>
          <Link
            href="/app/split"
            className="block text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Back to {siteConfig.name}
          </Link>
        </div>
      )}
    </div>
  );
}

/** Unknown token: used already, withdrawn, or never real. */
export function SplitInviteGone({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="space-y-6 text-center">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">This invite is no longer active</h1>
        <p className="text-sm text-muted-foreground">
          It has already been used, or the person was removed from the group. If you joined, the
          group is under Split in {siteConfig.name}.
        </p>
      </div>
      <Link href={signedIn ? "/app/split" : "/sign-in"} className={cn(buttonVariants(), "h-10 w-full")}>
        {signedIn ? "Open Split" : "Sign in"}
      </Link>
    </div>
  );
}

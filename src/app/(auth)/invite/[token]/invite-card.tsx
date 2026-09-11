"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { signOut } from "firebase/auth";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { acceptWorkspaceInvite } from "@/actions/workspaces";
import { clearSession, getFirebaseAuth } from "@/lib/firebase";
import { invitePath } from "@/lib/invite-links";
import { withNext } from "@/lib/next-path";
import { siteConfig } from "@/lib/site";
import { cn } from "@/lib/utils";

type Props = {
  token: string;
  state: "anonymous" | "match" | "mismatch";
  workspaceName: string;
  workspaceIcon: string | null;
  inviterName: string | null;
  /** "the workspace “Family” as editor (add and edit transactions)" */
  scopeText: string;
  invitedEmail: string;
  currentEmail: string | null;
};

function Header({
  workspaceName,
  workspaceIcon,
  inviterName,
  scopeText,
}: Pick<Props, "workspaceName" | "workspaceIcon" | "inviterName" | "scopeText">) {
  return (
    <div className="space-y-3 text-center">
      <div
        aria-hidden
        className="mx-auto flex size-14 items-center justify-center rounded-2xl border bg-card text-3xl"
      >
        {workspaceIcon ?? "🏢"}
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Join {workspaceName}</h1>
      <p className="text-sm text-muted-foreground">
        {inviterName ? <span className="font-medium text-foreground">{inviterName}</span> : "Someone"}{" "}
        invited you to {scopeText}.
      </p>
    </div>
  );
}

export function InviteCard(props: Props) {
  const { token, state, invitedEmail, currentEmail } = props;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [switching, setSwitching] = useState(false);
  const next = invitePath(token);

  function accept() {
    startTransition(async () => {
      const res = await acceptWorkspaceInvite(token);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`You've joined ${props.workspaceName}`);
      router.push("/app");
      router.refresh();
    });
  }

  async function switchAccount() {
    setSwitching(true);
    try {
      await signOut(getFirebaseAuth());
      await clearSession();
      router.push(withNext("/sign-in", next, { email: invitedEmail }));
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
          <Link
            href={withNext("/sign-up", next, { email: invitedEmail })}
            className={cn(buttonVariants(), "h-10 w-full")}
          >
            Create a free account
          </Link>
          <Link
            href={withNext("/sign-in", next, { email: invitedEmail })}
            className={cn(buttonVariants({ variant: "outline" }), "h-10 w-full")}
          >
            I already have an account
          </Link>
          <p className="text-center text-xs text-muted-foreground">
            The invite is for <span className="font-medium text-foreground">{invitedEmail}</span>.
            Sign in or sign up with that address to accept it.
          </p>
        </div>
      )}

      {state === "match" && (
        <div className="space-y-3">
          <Button className="h-10 w-full" onClick={accept} disabled={pending}>
            {pending ? "Joining…" : "Join workspace"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Signed in as {currentEmail}. You can leave the workspace any time from
            Settings → Workspace.
          </p>
        </div>
      )}

      {state === "mismatch" && (
        <div className="space-y-3">
          <p className="rounded-lg border bg-card p-3 text-sm text-muted-foreground">
            This invite was sent to{" "}
            <span className="font-medium text-foreground">{invitedEmail}</span>, but
            you&apos;re signed in as{" "}
            <span className="font-medium text-foreground">{currentEmail}</span>. Switch to
            that account to accept it, or ask {props.inviterName ?? "the admin"} to invite{" "}
            {currentEmail} instead.
          </p>
          <Button
            variant="outline"
            className="h-10 w-full"
            onClick={switchAccount}
            disabled={switching}
          >
            {switching ? "Signing out…" : "Switch account"}
          </Button>
          <Link
            href="/app"
            className="block text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Back to {siteConfig.name}
          </Link>
        </div>
      )}
    </div>
  );
}

/** Unknown token: already accepted, withdrawn, or never real. */
export function InviteGone({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="space-y-6 text-center">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">This invite is no longer active</h1>
        <p className="text-sm text-muted-foreground">
          It has already been accepted or was withdrawn. If it was yours, the workspace is
          already in your account — open {siteConfig.name} and pick it from the workspace menu.
        </p>
      </div>
      <Link
        href={signedIn ? "/app" : "/sign-in"}
        className={cn(buttonVariants(), "h-10 w-full")}
      >
        {signedIn ? `Open ${siteConfig.name}` : "Sign in"}
      </Link>
    </div>
  );
}

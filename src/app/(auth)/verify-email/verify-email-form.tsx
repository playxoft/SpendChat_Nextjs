"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged, sendEmailVerification, type User } from "firebase/auth";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getFirebaseAuth, syncSession } from "@/lib/firebase";
import { firebaseAuthErrorMessage } from "@/lib/auth-errors";
import { safeNextPath, withNext } from "@/lib/next-path";

export function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailParam = searchParams.get("email") ?? "";
  // Carried from sign-up so an invitee still lands on the invite they came for.
  const next = safeNextPath(searchParams.get("next"));
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [resending, setResending] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    return onAuthStateChanged(getFirebaseAuth(), (u) => {
      setUser(u);
      setReady(true);
    });
  }, []);

  const email = user?.email ?? emailParam;

  async function handleResend() {
    if (!user) {
      toast.error("Please sign in again to resend the link.");
      return;
    }
    setResending(true);
    try {
      await sendEmailVerification(user);
      toast.success("Verification link sent — check your inbox.");
    } catch (err) {
      toast.error(firebaseAuthErrorMessage(err, "Couldn't resend the link."));
    } finally {
      setResending(false);
    }
  }

  function handleContinue() {
    if (!user) {
      toast.error("Please sign in again to continue.");
      return;
    }
    startTransition(async () => {
      try {
        await user.reload();
        if (!user.emailVerified) {
          toast.error("Not verified yet — click the link in your email first.");
          return;
        }
        await syncSession();
        toast.success("Email verified");
        router.push(next ?? "/app");
        router.refresh();
      } catch (err) {
        toast.error(firebaseAuthErrorMessage(err, "Couldn't confirm verification."));
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Verify your email</h1>
        <p className="text-sm text-muted-foreground">
          We emailed a verification link{email ? ` to ${email}` : ""}. Click it, then come
          back and continue.
        </p>
      </div>

      <div className="space-y-3">
        <Button className="w-full" onClick={handleContinue} disabled={pending || !ready}>
          {pending ? "Checking…" : "I've verified — continue"}
        </Button>
        <Button
          variant="outline"
          className="w-full"
          onClick={handleResend}
          disabled={resending || !ready}
        >
          {resending ? "Sending…" : "Resend link"}
        </Button>
      </div>

      {ready && !user && (
        <p className="text-center text-sm text-muted-foreground">
          Not signed in?{" "}
          <Link
            href={withNext("/sign-in", next, { email })}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Sign in again
          </Link>{" "}
          to resend or continue.
        </p>
      )}

      <div className="text-center">
        <Link
          href={withNext("/sign-in", next)}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          <ArrowLeft className="size-3.5" /> Back to sign in
        </Link>
      </div>
    </div>
  );
}

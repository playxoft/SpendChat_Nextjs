"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  updateProfile,
} from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { getFirebaseAuth } from "@/lib/firebase";
import { firebaseAuthErrorMessage } from "@/lib/auth-errors";
import { safeNextPath, withNext } from "@/lib/next-path";
import { storeTermsAcceptance, type TermsChoices } from "@/lib/legal";
import { TermsConsentDialog } from "@/components/legal/terms-consent";
import { GoogleSignInButton } from "../google-button";

type SignUpDetails = { name: string; email: string; password: string };

export function SignUpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // An invite link pre-fills the address it was sent to and returns there after.
  const initialEmail = searchParams.get("email") ?? "";
  const next = safeNextPath(searchParams.get("next"));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // The form's details wait here while the terms dialog is open: nothing is
  // sent to Firebase until the box is ticked and confirmed.
  const pendingDetails = useRef<SignUpDetails | null>(null);
  const [askingTerms, setAskingTerms] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const data = new FormData(e.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    if (!email || !password) {
      setError("Email and password are required.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    pendingDetails.current = { name, email, password };
    setAskingTerms(true);
  }

  function createAccount(choices: TermsChoices) {
    const details = pendingDetails.current;
    if (!details) return;
    const { name, email, password } = details;
    startTransition(async () => {
      const auth = getFirebaseAuth();
      try {
        const { user } = await createUserWithEmailAndPassword(auth, email, password);
        // The box was ticked for this account; the first session sync after
        // the address is verified records it (see `lib/legal.ts`).
        storeTermsAcceptance(user.uid, choices);
        pendingDetails.current = null;
        setAskingTerms(false);
        if (name) await updateProfile(user, { displayName: name });
        try {
          await sendEmailVerification(user);
        } catch {
          // ignore transient errors sending the verification email
        }
        router.push(withNext("/verify-email", next, { email }));
      } catch (err) {
        setAskingTerms(false);
        setError(
          firebaseAuthErrorMessage(err, "Couldn't create your account. Please try again."),
        );
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="text-sm text-muted-foreground">
          Start tracking your money in seconds — it&apos;s free.
        </p>
      </div>

      <GoogleSignInButton next={next} terms="before" />

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">
            or sign up with email
          </span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            placeholder="Your name"
            className="h-10"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={initialEmail}
            placeholder="you@example.com"
            className="h-10"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={8}
            placeholder="At least 8 characters"
            className="h-10"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" className="h-10 w-full" disabled={pending}>
          {pending ? "Creating account…" : "Create account"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Next, you&apos;ll see a short summary of our terms to agree to before your account
          is created.
        </p>
      </form>

      <TermsConsentDialog
        open={askingTerms}
        title="Before you create your account"
        description="Here's the short, friendly version of our terms. Have a quick read, then tick the box."
        confirmLabel="Create my account"
        pendingLabel="Creating account…"
        pending={pending}
        onConfirm={createAccount}
        onCancel={() => {
          pendingDetails.current = null;
          setAskingTerms(false);
        }}
      />

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href={withNext("/sign-in", next, { email: initialEmail })}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}

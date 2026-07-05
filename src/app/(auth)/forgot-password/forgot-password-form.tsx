"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { sendPasswordResetEmail } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getFirebaseAuth } from "@/lib/firebase";
import { firebaseAuthErrorMessage } from "@/lib/auth-errors";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Enter your email.");
      return;
    }
    startTransition(async () => {
      try {
        await sendPasswordResetEmail(getFirebaseAuth(), trimmed);
      } catch (err) {
        // Don't reveal whether the email exists — treat "user not found" as success.
        const code =
          err && typeof err === "object" && "code" in err
            ? String((err as { code?: unknown }).code)
            : "";
        if (code !== "auth/user-not-found" && code !== "auth/invalid-email") {
          setError(firebaseAuthErrorMessage(err, "Couldn't send a reset email."));
          return;
        }
      }
      setSent(true);
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
        <p className="text-sm text-muted-foreground">
          {sent
            ? "If an account exists for that email, we've sent a password reset link."
            : "Enter your email and we'll send you a reset link."}
        </p>
      </div>

      {sent ? (
        <p className="rounded-lg border bg-muted/40 p-4 text-center text-sm text-muted-foreground">
          Check your inbox and follow the link to choose a new password.
        </p>
      ) : (
        <form onSubmit={handleRequest} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(null);
              }}
              required
              autoFocus
              placeholder="you@example.com"
              className="h-10"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="h-10 w-full" disabled={pending}>
            {pending ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}

      <div className="text-center">
        <Link
          href="/sign-in"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          <ArrowLeft className="size-3.5" /> Back to sign in
        </Link>
      </div>
    </div>
  );
}

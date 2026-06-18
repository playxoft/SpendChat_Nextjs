"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/neon-auth-client";
import { friendlyOtpError, getAuthErrorMessage } from "@/lib/auth-errors";

export function VerifyEmailForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const initialEmail = sp.get("email") ?? "";

  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [resending, setResending] = useState(false);

  function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const trimmedEmail = email.trim();
    const code = otp.trim();
    if (!trimmedEmail) {
      setFormError("Enter your email.");
      return;
    }
    if (code.length < 4) {
      setFormError("Enter the code from your email.");
      return;
    }
    startTransition(async () => {
      try {
        const { error } = await authClient.emailOtp.verifyEmail({
          email: trimmedEmail,
          otp: code,
        });
        if (error) {
          setFormError(friendlyOtpError(getAuthErrorMessage(error)));
          return;
        }
        toast.success("Email verified");
        router.push("/app");
        router.refresh();
      } catch (err) {
        // The client throws on expired/invalid codes — surface it inline.
        setFormError(friendlyOtpError(getAuthErrorMessage(err)));
      }
    });
  }

  async function handleResend() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setFormError("Enter your email first.");
      return;
    }
    setFormError(null);
    setResending(true);
    try {
      const { error } = await authClient.emailOtp.sendVerificationOtp({
        email: trimmedEmail,
        type: "email-verification",
      });
      if (error) setFormError(getAuthErrorMessage(error, "Couldn't resend the code."));
      else toast.success("New code sent — check your inbox.");
    } catch (err) {
      setFormError(getAuthErrorMessage(err, "Couldn't resend the code."));
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Verify your email</h1>
        <p className="text-sm text-muted-foreground">
          Enter the code we emailed{initialEmail ? ` to ${initialEmail}` : ""} to finish
          setting up your account.
        </p>
      </div>

      <form onSubmit={handleVerify} className="space-y-4">
        {!initialEmail && (
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (formError) setFormError(null);
              }}
              required
              placeholder="you@example.com"
            />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="otp">Verification code</Label>
          <Input
            id="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={otp}
            onChange={(e) => {
              setOtp(e.target.value.replace(/\D/g, ""));
              if (formError) setFormError(null);
            }}
            maxLength={8}
            required
            placeholder="123456"
            className="text-center text-lg tracking-[0.3em]"
          />
        </div>

        {formError && <p className="text-sm text-destructive">{formError}</p>}

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Verifying…" : "Verify email"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Didn&apos;t get a code?{" "}
        <button
          type="button"
          onClick={handleResend}
          disabled={resending}
          className="font-medium text-foreground underline-offset-4 hover:underline disabled:opacity-50"
        >
          {resending ? "Sending…" : "Resend code"}
        </button>
      </p>
    </div>
  );
}

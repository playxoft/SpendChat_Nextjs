"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/neon-auth-client";

export function VerifyEmailForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const initialEmail = sp.get("email") ?? "";

  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState("");
  const [pending, startTransition] = useTransition();
  const [resending, setResending] = useState(false);

  function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    const trimmedEmail = email.trim();
    const code = otp.trim();
    if (!trimmedEmail) {
      toast.error("Enter your email");
      return;
    }
    if (code.length < 4) {
      toast.error("Enter the code from your email");
      return;
    }
    startTransition(async () => {
      const { error } = await authClient.emailOtp.verifyEmail({
        email: trimmedEmail,
        otp: code,
      });
      if (error) {
        toast.error(error.message || "That code is invalid or expired.");
        return;
      }
      toast.success("Email verified");
      router.push("/app");
      router.refresh();
    });
  }

  async function handleResend() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      toast.error("Enter your email first");
      return;
    }
    setResending(true);
    const { error } = await authClient.emailOtp.sendVerificationOtp({
      email: trimmedEmail,
      type: "email-verification",
    });
    setResending(false);
    if (error) toast.error(error.message || "Couldn't resend the code.");
    else toast.success("New code sent — check your inbox.");
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
              onChange={(e) => setEmail(e.target.value)}
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
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            maxLength={8}
            required
            placeholder="123456"
            className="text-center text-lg tracking-[0.3em]"
          />
        </div>

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

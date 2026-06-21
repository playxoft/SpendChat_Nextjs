"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/neon-auth-client";
import { friendlyOtpError, getAuthErrorMessage } from "@/lib/auth-errors";

type Step = "request" | "reset";

export function ForgotPasswordForm() {
  const router = useRouter();
  const sp = useSearchParams();

  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState(sp.get("email") ?? "");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [resending, setResending] = useState(false);

  function sendCode(target: string) {
    // Better-auth emailOtp: a "forget-password" OTP is delivered by Neon Auth,
    // the same channel that already sends our email-verification codes.
    return authClient.emailOtp.sendVerificationOtp({
      email: target,
      type: "forget-password",
    });
  }

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
        const { error: err } = await sendCode(trimmed);
        if (err) {
          setError(getAuthErrorMessage(err, "Couldn't send a reset code."));
          return;
        }
        setEmail(trimmed);
        setStep("reset");
        toast.success("Reset code sent — check your inbox.");
      } catch (err) {
        setError(getAuthErrorMessage(err, "Couldn't send a reset code."));
      }
    });
  }

  function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const code = otp.trim();
    if (code.length < 4) {
      setError("Enter the code from your email.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    startTransition(async () => {
      try {
        const { error: err } = await authClient.emailOtp.resetPassword({
          email: email.trim(),
          otp: code,
          password,
        });
        if (err) {
          setError(friendlyOtpError(getAuthErrorMessage(err)));
          return;
        }
        toast.success("Password reset — sign in with your new password.");
        router.push(`/sign-in?email=${encodeURIComponent(email.trim())}`);
      } catch (err) {
        setError(friendlyOtpError(getAuthErrorMessage(err)));
      }
    });
  }

  async function handleResend() {
    const trimmed = email.trim();
    if (!trimmed) return;
    setError(null);
    setResending(true);
    try {
      const { error: err } = await sendCode(trimmed);
      if (err) setError(getAuthErrorMessage(err, "Couldn't resend the code."));
      else toast.success("New code sent — check your inbox.");
    } catch (err) {
      setError(getAuthErrorMessage(err, "Couldn't resend the code."));
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {step === "request" ? "Reset your password" : "Choose a new password"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {step === "request"
            ? "Enter your email and we'll send you a reset code."
            : `Enter the code we sent to ${email} and your new password.`}
        </p>
      </div>

      {step === "request" ? (
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
            {pending ? "Sending…" : "Send reset code"}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleReset} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="otp">Reset code</Label>
            <Input
              id="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otp}
              onChange={(e) => {
                setOtp(e.target.value.replace(/\D/g, ""));
                if (error) setError(null);
              }}
              maxLength={8}
              required
              autoFocus
              placeholder="123456"
              className="h-10 text-center text-lg tracking-[0.3em]"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">New password</Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                minLength={8}
                required
                placeholder="At least 8 characters"
                className="h-10 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="h-10 w-full" disabled={pending}>
            {pending ? "Resetting…" : "Reset password"}
          </Button>

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
        </form>
      )}

      <div className="text-center">
        {step === "reset" ? (
          <button
            type="button"
            onClick={() => {
              setStep("request");
              setError(null);
            }}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <ArrowLeft className="size-3.5" /> Use a different email
          </button>
        ) : (
          <Link
            href="/sign-in"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <ArrowLeft className="size-3.5" /> Back to sign in
          </Link>
        )}
      </div>
    </div>
  );
}

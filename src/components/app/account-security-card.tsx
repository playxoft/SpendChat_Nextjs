"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  EmailAuthProvider,
  linkWithCredential,
  onIdTokenChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  updatePassword,
} from "firebase/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { getFirebaseAuth, googleProvider } from "@/lib/firebase";
import { firebaseAuthErrorMessage } from "@/lib/auth-errors";
import { notifyPasswordChanged } from "@/actions/settings";

const MIN_PASSWORD = 8;

function errorCode(err: unknown): string {
  return err && typeof err === "object" && "code" in err
    ? String((err as { code?: unknown }).code)
    : "";
}

/** Best-effort notification — the password already changed, so never let the
 *  notice email (missing config, rate limit, transient error) surface a failure. */
async function sendChangeNotice(): Promise<void> {
  try {
    await notifyPasswordChanged();
  } catch {
    // ignore
  }
}

/**
 * Sign-in method + password management. Client-only: which providers are linked
 * (Google, email/password) and every password operation live in the Firebase
 * Web SDK, not on our server. `AuthBridge` re-syncs the session cookie when the
 * token rotates after a password change, so nothing here touches cookies.
 */
export function AccountSecurityCard({ email }: { email: string | null }) {
  // null = signed out / not yet restored; otherwise the linked provider ids.
  const [providers, setProviders] = useState<string[] | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsub = onIdTokenChanged(getFirebaseAuth(), (user) => {
      setProviders(user ? user.providerData.map((p) => p.providerId) : null);
      setReady(true);
    });
    return () => unsub();
  }, []);

  const hasPassword = providers?.includes("password") ?? false;
  const hasGoogle = providers?.includes("google.com") ?? false;

  function refreshProviders() {
    const user = getFirebaseAuth().currentUser;
    if (user) setProviders(user.providerData.map((p) => p.providerId));
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          {email ? (
            <>
              Signed in as <span className="font-medium text-foreground">{email}</span>.
            </>
          ) : (
            "You're signed in."
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Sign-in method:</span>
          {!ready ? (
            <Badge variant="secondary">Checking…</Badge>
          ) : (
            <>
              {hasGoogle && <Badge variant="secondary">Google</Badge>}
              {hasPassword && <Badge variant="secondary">Email &amp; password</Badge>}
              {!hasGoogle && !hasPassword && <Badge variant="outline">Unknown</Badge>}
            </>
          )}
        </div>
      </div>

      {ready && providers === null && (
        <p className="text-sm text-muted-foreground">
          For security, sign in again to manage your password.
        </p>
      )}

      {ready &&
        providers !== null &&
        (hasPassword ? (
          <ChangePasswordForm email={email} />
        ) : (
          <CreatePasswordForm email={email} onCreated={refreshProviders} />
        ))}
    </div>
  );
}

/** Hidden username field so password managers associate the new password. */
function UsernameHint({ email }: { email: string | null }) {
  return (
    <input
      type="text"
      name="username"
      autoComplete="username"
      value={email ?? ""}
      readOnly
      aria-hidden="true"
      tabIndex={-1}
      className="hidden"
    />
  );
}

function ChangePasswordForm({ email }: { email: string | null }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < MIN_PASSWORD) {
      setError(`New password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (next !== confirm) {
      setError("New passwords don't match.");
      return;
    }
    start(async () => {
      const user = getFirebaseAuth().currentUser;
      if (!user?.email) {
        setError("You appear to be signed out. Reload the page and try again.");
        return;
      }
      // Re-verify the current password first (also satisfies "recent login").
      try {
        await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
      } catch (err) {
        const code = errorCode(err);
        if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
          setError("Your current password is incorrect.");
        } else {
          setError(firebaseAuthErrorMessage(err, "Couldn't verify your current password."));
        }
        return;
      }
      try {
        await updatePassword(user, next);
      } catch (err) {
        setError(firebaseAuthErrorMessage(err, "Couldn't change your password."));
        return;
      }
      await sendChangeNotice();
      toast.success("Password changed");
      setCurrent("");
      setNext("");
      setConfirm("");
    });
  }

  return (
    <form onSubmit={submit} className="max-w-sm space-y-4">
      <p className="text-sm text-muted-foreground">Change the password you use to sign in.</p>
      <UsernameHint email={email} />
      <div className="space-y-1.5">
        <Label htmlFor="current-password">Current password</Label>
        <PasswordInput
          id="current-password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
          className="h-10"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="new-password">New password</Label>
        <PasswordInput
          id="new-password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
          className="h-10"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm-password">Confirm new password</Label>
        <PasswordInput
          id="confirm-password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          className="h-10"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="h-10" disabled={pending}>
        {pending ? "Saving…" : "Change password"}
      </Button>
    </form>
  );
}

function CreatePasswordForm({
  email,
  onCreated,
}: {
  email: string | null;
  onCreated: () => void;
}) {
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (next !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    start(async () => {
      const user = getFirebaseAuth().currentUser;
      if (!user?.email) {
        setError("You appear to be signed out. Reload the page and try again.");
        return;
      }
      const cred = EmailAuthProvider.credential(user.email, next);
      try {
        try {
          await linkWithCredential(user, cred);
        } catch (err) {
          // Linking a credential can require a fresh sign-in; re-auth with Google
          // (the only provider a password-less account has) and retry once.
          if (errorCode(err) === "auth/requires-recent-login") {
            await reauthenticateWithPopup(user, googleProvider());
            await linkWithCredential(getFirebaseAuth().currentUser ?? user, cred);
          } else {
            throw err;
          }
        }
      } catch (err) {
        setError(firebaseAuthErrorMessage(err, "Couldn't set a password."));
        return;
      }
      await sendChangeNotice();
      toast.success("Password created — you can now sign in with your email and password.");
      setNext("");
      setConfirm("");
      onCreated();
    });
  }

  return (
    <form onSubmit={submit} className="max-w-sm space-y-4">
      <p className="text-sm text-muted-foreground">
        You currently sign in with Google. Add a password to also sign in with your email.
      </p>
      <UsernameHint email={email} />
      <div className="space-y-1.5">
        <Label htmlFor="create-password">New password</Label>
        <PasswordInput
          id="create-password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
          className="h-10"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="create-confirm-password">Confirm password</Label>
        <PasswordInput
          id="create-confirm-password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          className="h-10"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="h-10" disabled={pending}>
        {pending ? "Saving…" : "Create password"}
      </Button>
    </form>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { signOut } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { clearSession, getFirebaseAuth } from "@/lib/firebase";

/** Sign out of this device — clears the Firebase session and the server cookie. */
export function AccountSignOut() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleSignOut() {
    startTransition(async () => {
      await signOut(getFirebaseAuth());
      await clearSession();
      router.push("/sign-in");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <p className="text-sm text-muted-foreground">Sign out of SpendChat on this device.</p>
      <Button variant="outline" onClick={handleSignOut} disabled={pending}>
        <LogOut className="size-4" /> {pending ? "Signing out…" : "Sign out"}
      </Button>
    </div>
  );
}

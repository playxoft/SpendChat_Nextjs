"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { Logo } from "@/components/logo";
import { getFirebaseAuth, syncSession } from "@/lib/firebase";

/**
 * Sign-in landing page. With Firebase's popup flow the popup itself completes
 * sign-in, so this page is now just a safety net for any stray links: once
 * Firebase restores the signed-in user it syncs the session cookie and enters
 * the app; otherwise it sends the visitor to sign in.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const done = useRef(false);

  useEffect(() => {
    return onAuthStateChanged(getFirebaseAuth(), async (user) => {
      if (done.current) return;
      done.current = true;
      if (user) {
        await syncSession();
        router.replace("/app");
      } else {
        router.replace("/sign-in");
      }
    });
  }, [router]);

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 px-4">
      <Logo />
      <p className="text-sm text-muted-foreground">Completing sign-in…</p>
    </div>
  );
}

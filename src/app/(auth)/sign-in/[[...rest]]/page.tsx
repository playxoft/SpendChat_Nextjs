import type { Metadata } from "next";
import { SignIn } from "@stackframe/stack";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your MoneyTracker account.",
  robots: { index: false, follow: false },
};

export default function SignInPage() {
  return <SignIn />;
}

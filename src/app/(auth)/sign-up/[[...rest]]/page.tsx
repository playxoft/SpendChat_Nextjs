import type { Metadata } from "next";
import { SignUp } from "@stackframe/stack";

export const metadata: Metadata = {
  title: "Create your account",
  description: "Create a free MoneyTracker account.",
  robots: { index: false, follow: false },
};

export default function SignUpPage() {
  return <SignUp />;
}

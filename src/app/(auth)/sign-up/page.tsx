import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SignUpForm } from "./sign-up-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Create your account",
  description: "Create a free SpendChat account.",
  robots: { index: false, follow: false },
};

export default async function SignUpPage() {
  // Already signed in? Skip the form and go straight to the app.
  if (await getCurrentUser()) redirect("/app");
  return <SignUpForm />;
}

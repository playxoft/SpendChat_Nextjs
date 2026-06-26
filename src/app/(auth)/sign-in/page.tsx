import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SignInForm } from "./sign-in-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your SpendChat account.",
  robots: { index: false, follow: false },
};

export default async function SignInPage() {
  // Already signed in? Skip the form and go straight to the app.
  if (await getCurrentUser()) redirect("/app");
  return <SignInForm />;
}

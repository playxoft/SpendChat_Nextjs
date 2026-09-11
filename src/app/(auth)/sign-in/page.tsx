import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { safeNextPath } from "@/lib/next-path";
import { SignInForm } from "./sign-in-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your SpendChat account.",
  robots: { index: false, follow: false },
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  // Already signed in? Skip the form and go where they were headed (an
  // invite's join page, say) — or the app.
  if (await getCurrentUser()) {
    const { next } = await searchParams;
    redirect(safeNextPath(Array.isArray(next) ? next[0] : next) ?? "/app");
  }
  return <SignInForm />;
}

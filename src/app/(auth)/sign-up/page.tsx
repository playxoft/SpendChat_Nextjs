import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { safeNextPath } from "@/lib/next-path";
import { SignUpForm } from "./sign-up-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Create your account",
  description: "Create a free SpendChat account.",
  robots: { index: false, follow: false },
};

export default async function SignUpPage({
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
  return <SignUpForm />;
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ForgotPasswordForm } from "./forgot-password-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reset your password",
  description: "Reset the password for your SpendChat account.",
  robots: { index: false, follow: false },
};

export default async function ForgotPasswordPage() {
  if (await getCurrentUser()) redirect("/app");
  return <ForgotPasswordForm />;
}

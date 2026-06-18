"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/neon-auth";

export type AuthFormState = { error: string } | null;

export async function signInWithEmail(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const { error } = await auth.signIn.email({ email, password });
  if (error) {
    const code = (error as { code?: string }).code;
    const unverified =
      code === "EMAIL_NOT_VERIFIED" || /verif/i.test(error.message ?? "");
    if (unverified) {
      redirect(`/verify-email?email=${encodeURIComponent(email)}`);
    }
    return { error: error.message || "Couldn't sign in. Check your details and try again." };
  }

  redirect("/app");
}

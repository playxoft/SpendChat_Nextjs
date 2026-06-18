"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/neon-auth";
import { getAuthErrorMessage } from "@/lib/auth-errors";

export type AuthFormState = { error: string } | null;

const GENERIC = "Couldn't create your account. Please try again.";

export async function signUpWithEmail(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  let errObj: { message?: string } | null = null;
  try {
    const res = await auth.signUp.email({ email, name: name || email, password });
    errObj = (res.error ?? null) as { message?: string } | null;
  } catch (err) {
    return { error: getAuthErrorMessage(err, GENERIC) };
  }

  if (errObj) {
    return { error: errObj.message || GENERIC };
  }

  // Email verification is required — send the user to enter the emailed code.
  redirect(`/verify-email?email=${encodeURIComponent(email)}`);
}

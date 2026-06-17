"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/neon-auth";

export type AuthFormState = { error: string } | null;

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

  const { error } = await auth.signUp.email({
    email,
    name: name || email,
    password,
  });
  if (error) {
    return { error: error.message || "Couldn't create your account. Please try again." };
  }

  redirect("/app");
}

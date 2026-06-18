"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/neon-auth";
import { getAuthErrorMessage } from "@/lib/auth-errors";

export type AuthFormState = { error: string } | null;

const GENERIC = "Couldn't sign in. Check your details and try again.";

export async function signInWithEmail(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  let errObj: { code?: string; message?: string } | null = null;
  try {
    const res = await auth.signIn.email({ email, password });
    errObj = (res.error ?? null) as { code?: string; message?: string } | null;
  } catch (err) {
    const msg = getAuthErrorMessage(err, GENERIC);
    if (/verif/i.test(msg)) {
      redirect(`/verify-email?email=${encodeURIComponent(email)}`);
    }
    return { error: msg };
  }

  if (errObj) {
    if (errObj.code === "EMAIL_NOT_VERIFIED" || /verif/i.test(errObj.message ?? "")) {
      redirect(`/verify-email?email=${encodeURIComponent(email)}`);
    }
    return { error: errObj.message || GENERIC };
  }

  redirect("/app");
}

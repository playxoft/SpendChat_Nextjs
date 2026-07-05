/** Extract a human-readable message from a thrown error or a returned error object. */
export function getAuthErrorMessage(
  err: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  if (typeof err === "string" && err.trim()) return err;
  return fallback;
}

/** Map a Firebase Auth error (with a `code` like "auth/invalid-credential") to a friendly message. */
export function firebaseAuthErrorMessage(
  err: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code?: unknown }).code)
      : "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Incorrect email or password.";
    case "auth/invalid-email":
      return "That doesn't look like a valid email address.";
    case "auth/user-disabled":
      return "This account has been disabled.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a moment and try again.";
    case "auth/email-already-in-use":
      return "An account with that email already exists. Try signing in instead.";
    case "auth/weak-password":
      return "That password is too weak — use at least 6 characters.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "Sign-in was cancelled.";
    case "auth/popup-blocked":
      return "Your browser blocked the sign-in popup. Allow popups and try again.";
    case "auth/network-request-failed":
      return "Network error. Check your connection and try again.";
    case "auth/requires-recent-login":
      return "For security, please sign in again to finish this action.";
    default:
      return getAuthErrorMessage(err, fallback);
  }
}

/** Map a raw OTP/verification error into a friendly, actionable message. */
export function friendlyOtpError(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("expired")) {
    return "That code has expired. Tap “Resend code” below to get a new one.";
  }
  if (
    m.includes("invalid") ||
    m.includes("incorrect") ||
    m.includes("not match") ||
    m.includes("wrong")
  ) {
    return "That code is incorrect. Double-check it and try again.";
  }
  if (m.includes("too many") || m.includes("attempt") || m.includes("rate")) {
    return "Too many attempts. Request a new code and try again in a moment.";
  }
  return raw || "Couldn't verify that code. Please try again.";
}

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

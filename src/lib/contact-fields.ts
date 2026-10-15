import { z } from "zod";

/**
 * Email and phone checks for the contact fields people type into the app's
 * forms (business details, clients, the invoice editor). Pure and client-safe:
 * the server's schemas (`validation.ts`) and the inline errors under the
 * fields ask the same questions, so they never disagree.
 */

/** A phone number's digits, at least and at most (E.164 tops out at 15). */
export const PHONE_MIN_DIGITS = 6;
export const PHONE_MAX_DIGITS = 15;

/** What a phone number may hold: digits, spaces, and + ( ) - . as separators. */
const PHONE_CHARS = /^[\d\s+().-]*$/;

/** True when `text` holds a character a phone number can't (a letter, say). */
export function hasNonPhoneCharacters(text: string): boolean {
  return !PHONE_CHARS.test(text);
}

/** Why `value` isn't a phone number, or null when it is (or is blank). */
export function phoneProblem(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (hasNonPhoneCharacters(v)) return "Use digits, spaces and + ( ) - only";
  if (v.lastIndexOf("+") > 0) return "A + only goes at the start";
  const digits = v.replace(/\D/g, "").length;
  if (digits < PHONE_MIN_DIGITS) return "That's too short for a phone number";
  if (digits > PHONE_MAX_DIGITS) return "That's too long for a phone number";
  return null;
}

const email = z.string().email();

/** Why `value` isn't an email address, or null when it is (or is blank). */
export function emailProblem(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  return email.safeParse(v).success ? null : "Enter a valid email address, like name@example.com";
}

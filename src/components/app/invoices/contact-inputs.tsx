"use client";

import { useState, type ReactNode } from "react";
import { TextField } from "@/components/tools/fields";
import { emailProblem, hasNonPhoneCharacters, phoneProblem } from "@/lib/contact-fields";

/**
 * Email and phone inputs that check themselves, with the error inline under
 * the field. A value that came in filled shows its problem straight away; one
 * being typed from empty waits until the field is left, so nobody is told off
 * mid-word. The forms block saving on the same checks (`emailProblem`,
 * `phoneProblem`), and the server repeats them.
 */

/** A phone number: letters and other stray characters aren't taken at all — the field says why. */
export function PhoneField({
  label,
  value,
  onChange,
  maxLength,
  hint,
}: {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  hint?: ReactNode;
}) {
  const [touched, setTouched] = useState(value.trim() !== "");
  const [refused, setRefused] = useState(false);
  const error = refused
    ? "Phone numbers take digits, spaces and + ( ) - only"
    : touched
      ? phoneProblem(value)
      : null;
  return (
    <TextField
      label={label}
      value={value}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      maxLength={maxLength}
      placeholder="+91 98765 43210"
      hint={hint}
      error={error}
      onBlur={() => {
        setTouched(true);
        setRefused(false);
      }}
      onChange={(next) => {
        if (hasNonPhoneCharacters(next)) {
          setRefused(true);
          return;
        }
        setRefused(false);
        onChange(next);
      }}
    />
  );
}

export function EmailField({
  label,
  value,
  onChange,
  maxLength,
  placeholder,
}: {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  placeholder?: string;
}) {
  const [touched, setTouched] = useState(value.trim() !== "");
  return (
    <TextField
      label={label}
      value={value}
      type="email"
      inputMode="email"
      autoComplete="email"
      maxLength={maxLength}
      placeholder={placeholder}
      error={touched ? emailProblem(value) : null}
      onBlur={() => setTouched(true)}
      onChange={onChange}
    />
  );
}

/** The first problem among a form's email and phone fields, or null. */
export function contactProblem(fields: { email?: string[]; phone?: string[] }): string | null {
  for (const v of fields.email ?? []) {
    const p = emailProblem(v);
    if (p) return p;
  }
  for (const v of fields.phone ?? []) {
    const p = phoneProblem(v);
    if (p) return p;
  }
  return null;
}

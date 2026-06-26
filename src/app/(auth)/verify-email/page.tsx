import type { Metadata } from "next";
import { Suspense } from "react";
import { VerifyEmailForm } from "./verify-email-form";

export const metadata: Metadata = {
  title: "Verify your email",
  description: "Verify your SpendChat email address.",
  robots: { index: false, follow: false },
};

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailForm />
    </Suspense>
  );
}

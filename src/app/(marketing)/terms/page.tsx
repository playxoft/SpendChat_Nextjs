import type { Metadata } from "next";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `The terms for using ${siteConfig.name}.`,
  alternates: { canonical: "/terms" },
};

const LAST_UPDATED = "June 17, 2026";

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-4xl font-semibold tracking-tight">Terms of Service</h1>
      <p className="mt-3 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>

      <div className="mt-10 space-y-8 text-muted-foreground">
        <section className="space-y-3">
          <h2 className="text-xl font-medium text-foreground">Acceptance</h2>
          <p>
            By creating an account or using {siteConfig.name} (the &ldquo;Service&rdquo;),
            you agree to these Terms. If you do not agree, please do not use the Service.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-foreground">The service</h2>
          <p>
            {siteConfig.name} is a free personal money tracker provided on an
            &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis. It is a tool for
            recording your own income and expenses and is not financial, tax, or
            accounting advice.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-foreground">Your account</h2>
          <p>
            You are responsible for keeping your login credentials secure and for the
            activity under your account. You must provide accurate information and be old
            enough to form a binding contract in your jurisdiction.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-foreground">Acceptable use</h2>
          <p>
            You agree not to misuse the Service, including attempting to disrupt it,
            access other users&apos; data, or use it for unlawful purposes.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-foreground">Your data</h2>
          <p>
            You retain ownership of the transactions you record. You can export or delete
            your data at any time. We are not liable for any loss of data, though we take
            reasonable steps to keep it safe.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-foreground">Disclaimer & liability</h2>
          <p>
            To the maximum extent permitted by law, the Service is provided without
            warranties of any kind, and we are not liable for any indirect or
            consequential damages arising from your use of the Service.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-foreground">Changes & termination</h2>
          <p>
            We may modify or discontinue the Service, and may update these Terms. Continued
            use after changes means you accept the updated Terms. You may stop using the
            Service at any time.
          </p>
        </section>
      </div>
    </div>
  );
}

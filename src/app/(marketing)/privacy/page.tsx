import type { Metadata } from "next";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${siteConfig.name} collects, uses, and protects your data.`,
  alternates: { canonical: "/privacy" },
};

const LAST_UPDATED = "June 17, 2026";

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-4xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-3 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>

      <div className="mt-10 space-y-8 text-muted-foreground">
        <section className="space-y-3">
          <h2 className="text-xl font-medium text-foreground">Overview</h2>
          <p>
            {siteConfig.name} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) is a personal money
            tracker. We are committed to keeping your data private. This policy
            explains what we collect, why, and the choices you have.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-foreground">Information we collect</h2>
          <ul className="list-inside list-disc space-y-2">
            <li>
              <span className="text-foreground">Account information</span> — your email
              address, managed by our authentication provider (Neon Auth) to create and
              secure your account.
            </li>
            <li>
              <span className="text-foreground">Your transactions</span> — the amounts,
              categories, notes, and dates you choose to record.
            </li>
            <li>
              <span className="text-foreground">Preferences</span> — settings such as
              your selected currency and theme.
            </li>
          </ul>
          <p>
            We do not connect to your bank, and we do not ask for card numbers or other
            financial account credentials.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-foreground">How we use your data</h2>
          <p>
            Your information is used solely to provide the service: to authenticate you,
            store and display your transactions, and let you filter, export, and print
            them. Your records are scoped to your account and are not shown to other
            users.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-foreground">Data sharing</h2>
          <p>
            We do not sell your personal data or use it for advertising. Data is
            processed by the infrastructure providers required to run the app — our
            database host (Neon) and authentication provider (Neon Auth / Stack Auth) —
            acting on our behalf.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-foreground">Security</h2>
          <p>
            Connections are encrypted in transit, queries are scoped per user, input is
            validated, and the app sends strict security headers. No system is perfectly
            secure, but we take reasonable measures to protect your information.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-foreground">Your choices</h2>
          <p>
            You can edit or delete individual transactions at any time, clear all of your
            transactions from Settings, or stop using the service. To request deletion of
            your account, contact us.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-foreground">Changes</h2>
          <p>
            We may update this policy from time to time. Material changes will be
            reflected by the &ldquo;Last updated&rdquo; date above.
          </p>
        </section>
      </div>
    </div>
  );
}

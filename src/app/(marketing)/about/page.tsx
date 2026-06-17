import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "About",
  description:
    "MoneyTracker is a minimal, privacy-first money tracker built to make logging income and expenses as easy as sending a message.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-4xl font-semibold tracking-tight">About MoneyTracker</h1>
      <div className="mt-8 space-y-6 text-muted-foreground">
        <p>
          Most money apps ask too much. Endless setup, connected bank accounts,
          dashboards crammed with charts you never asked for. We wanted the opposite:
          a tool so simple you actually keep using it.
        </p>
        <p>
          MoneyTracker treats logging a transaction like sending a message. You type
          what you spent or earned, pick a category, and it&apos;s done. Your balance
          updates instantly, your history stays tidy, and when you need your data, it
          exports and prints in a click.
        </p>
        <p>
          We believe your financial records should be{" "}
          <span className="text-foreground">private by default</span>. Your data is
          tied to your account and shown only to you. There are no ads and no selling
          of your information — the app is free to use.
        </p>
        <h2 className="pt-4 text-xl font-medium text-foreground">What we value</h2>
        <ul className="list-inside list-disc space-y-2">
          <li>
            <span className="text-foreground">Simplicity</span> — every feature earns
            its place.
          </li>
          <li>
            <span className="text-foreground">Speed</span> — adding a transaction
            should take seconds.
          </li>
          <li>
            <span className="text-foreground">Privacy</span> — your money is your
            business.
          </li>
          <li>
            <span className="text-foreground">Accessibility</span> — it should work
            well on any device, for everyone.
          </li>
        </ul>
        <p>
          {siteConfig.name} is built and maintained by {siteConfig.author}.
        </p>
      </div>

      <div className="mt-12">
        <Button asChild>
          <Link href="/sign-up">Start tracking free</Link>
        </Button>
      </div>
    </div>
  );
}

import { createMetadata } from "@/lib/seo";
import Link from "next/link";
import {
  ArrowRight,
  Heart,
  Lock,
  Rocket,
  Scale,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { GithubIcon } from "@/components/icons/github";
import { siteConfig } from "@/lib/site";
import { marketingCta } from "@/lib/marketing";

export const metadata = createMetadata({
  title: "About",
  description:
    "SpendChat is a minimal, privacy-first, open-source money tracker built to make logging income and expenses as easy as sending a message.",
  path: "/about",
});

const values = [
  {
    icon: Sparkles,
    title: "Simplicity",
    body: "Every feature earns its place. If it doesn't help you log or understand your money faster, it doesn't ship.",
  },
  {
    icon: Rocket,
    title: "Speed",
    body: "Adding a transaction should take seconds. The interface is keyboard-friendly and gets out of your way.",
  },
  {
    icon: Lock,
    title: "Privacy",
    body: "Your money is your business. Data is scoped to your account, never sold, and never used for ads.",
  },
  {
    icon: Heart,
    title: "Accessibility",
    body: "It should work well on any device, for everyone — responsive, themable, and built on accessible primitives.",
  },
];

const stack = [
  { layer: "Framework", choice: "Next.js (App Router) + TypeScript" },
  { layer: "Interface", choice: "Tailwind CSS + shadcn/ui" },
  { layer: "Database", choice: "Neon Postgres + Drizzle ORM" },
  { layer: "Auth", choice: "Firebase Authentication (Google & email/password)" },
  { layer: "Hosting", choice: "Cloudflare Workers via OpenNext" },
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-10 sm:pt-16">
      {/* Header */}
      <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-muted-foreground">
        <Heart className="size-3.5" /> About
      </span>
      <h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
        A money tracker you&apos;ll actually keep using
      </h1>
      <p className="mt-5 text-pretty text-lg text-muted-foreground">
        {siteConfig.name} is a minimal, fast, and private way to log income and
        expenses — as easy as sending a message.
      </p>

      {/* Story */}
      <div className="mt-12 space-y-6 text-muted-foreground">
        <p>
          Most money apps ask too much. Endless setup, connected bank accounts,
          dashboards crammed with charts you never asked for. We wanted the opposite:
          a tool so simple you actually keep using it past the first week.
        </p>
        <p>
          SpendChat treats logging a transaction like sending a message. You type
          what you spent or earned, pick a category, and it&apos;s done. Your balance
          updates instantly, your history stays tidy, and when you need your data, it
          exports and prints in a click.
        </p>
        <p>
          There&apos;s no growth-hacking, no upsells, and no dark patterns. It&apos;s a
          small, focused product that does one thing well — and stays out of your way
          the rest of the time.
        </p>
      </div>

      {/* Open source */}
      <section className="mt-14 rounded-3xl border bg-card p-7">
        <div className="flex size-11 items-center justify-center rounded-xl border bg-background">
          <Scale className="size-5" />
        </div>
        <h2 className="mt-4 text-2xl font-semibold tracking-tight">
          Proudly open source
        </h2>
        <p className="mt-3 text-muted-foreground">
          SpendChat is open source under the{" "}
          <span className="font-medium text-foreground">{siteConfig.license}</span>{" "}
          license. The entire application — every query, every server action, every
          line of the interface you&apos;re using — is public. You can read exactly how
          your data is handled, self-host it, file an issue, or send a pull request.
          Transparency isn&apos;t a marketing line here; it&apos;s the license.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button asChild className={marketingCta}>
            <a href={siteConfig.links.github} target="_blank" rel="noreferrer">
              <GithubIcon /> View on GitHub
            </a>
          </Button>
          <Button asChild variant="outline" className={marketingCta}>
            <Link href="/docs">Read the docs</Link>
          </Button>
        </div>
      </section>

      {/* Values */}
      <h2 className="mt-16 text-2xl font-semibold tracking-tight">What we value</h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {values.map((v) => (
          <div key={v.title} className="rounded-2xl border bg-card p-5">
            <div className="flex size-10 items-center justify-center rounded-xl bg-muted">
              <v.icon className="size-5" />
            </div>
            <h3 className="mt-4 font-medium">{v.title}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground">{v.body}</p>
          </div>
        ))}
      </div>

      {/* Privacy */}
      <h2 className="mt-16 text-2xl font-semibold tracking-tight">
        Private by default
      </h2>
      <p className="mt-4 text-muted-foreground">
        We believe your financial records should be{" "}
        <span className="text-foreground">private by default</span>. Your data is tied
        to your account and shown only to you. Every database query is scoped to the
        authenticated user, input is validated on the server, and the app ships with
        strict security headers. There are no ads and no selling of your information —
        the app is free to use.
      </p>

      {/* How it's built */}
      <h2 className="mt-16 text-2xl font-semibold tracking-tight">How it&apos;s built</h2>
      <p className="mt-4 text-muted-foreground">
        Nothing about the stack is secret — here&apos;s exactly what runs the app.
      </p>
      <dl className="mt-6 divide-y rounded-2xl border bg-card px-5">
        {stack.map((s) => (
          <div
            key={s.layer}
            className="flex flex-col gap-1 py-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <dt className="text-sm font-medium">{s.layer}</dt>
            <dd className="text-sm text-muted-foreground">{s.choice}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-12 text-center text-muted-foreground">
        {siteConfig.name} is built and maintained by{" "}
        <a
          href={siteConfig.links.playxoft}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          {siteConfig.author}
        </a>
        .
      </p>

      {/* CTA */}
      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <Button asChild className={marketingCta}>
          <Link href="/sign-up">
            Start tracking free <ArrowRight />
          </Link>
        </Button>
        <Button asChild variant="outline" className={marketingCta}>
          <Link href="/features">See features</Link>
        </Button>
      </div>
    </div>
  );
}

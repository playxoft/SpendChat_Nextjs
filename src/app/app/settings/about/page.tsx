import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { GithubIcon } from "@/components/icons/github";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/lib/site";
import { APP_VERSION, API_VERSION } from "@/lib/version";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "About",
  robots: { index: false, follow: false },
};

/**
 * Settings → About: what this is, what licence it carries, and where the source
 * is.
 *
 * This page is where the AGPL's **section 13** offer now lives. That clause
 * asks a hosted copy to offer its users the corresponding source, and the offer
 * used to be a bare link in the profile menu — reachable, but with no room to
 * say what the licence actually grants. Here it can, which is the point of the
 * clause rather than a box ticked.
 *
 * If this link is ever removed, the offer has to move somewhere a signed-in
 * user can still reach — that is a licence obligation, not a design choice.
 */
export default function AboutSettingsPage() {
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "App version", value: APP_VERSION },
    { label: "API contract", value: API_VERSION },
    { label: "Licence", value: siteConfig.license },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>About {siteConfig.name}</CardTitle>
          <CardDescription>{siteConfig.tagline}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {siteConfig.name} is a chat-style money tracker: you type what you
            spent the way you would text it, and it becomes a transaction you can
            filter, tag, export and print. There is no paid tier, and no bank
            connection — nothing is imported from your accounts, so nothing to
            revoke.
          </p>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
            {rows.map((r) => (
              <div key={r.label} className="contents">
                <dt className="text-muted-foreground">{r.label}</dt>
                <dd className="font-medium tabular-nums">{r.value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Open source</CardTitle>
          <CardDescription>
            {siteConfig.name} is free software under the {siteConfig.license}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            You may run it, read it, change it and share it. The licence asks two
            things in return: anything you distribute or host that is built from
            it carries the same licence, and — because this is served over a
            network — whoever uses your copy is offered its source. That is what
            this page is: the offer, for the copy you are using right now.
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            The repository is the whole application, not a sample of it: the
            schema, the migrations, the tests and the deployment config. If you
            would rather host it yourself, everything you need is there.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <a href={siteConfig.links.github} target="_blank" rel="noreferrer">
                <GithubIcon className="size-4" />
                Source code
                <ExternalLink className="size-3.5 opacity-60" />
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href={siteConfig.links.githubIssues} target="_blank" rel="noreferrer">
                Report an issue
                <ExternalLink className="size-3.5 opacity-60" />
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your data</CardTitle>
          <CardDescription>What is stored, and how to take it with you.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Your transactions, profiles, categories, tags and uploaded files are
            stored against your account. Any view of the transactions table
            exports as CSV or prints as a report, with the filters you applied —
            so getting your data out is the same action as looking at it.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/app/transactions">Export transactions</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/privacy">Privacy policy</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

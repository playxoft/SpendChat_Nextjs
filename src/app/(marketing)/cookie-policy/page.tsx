import { createMetadata } from "@/lib/seo";
import Link from "next/link";
import { CookiePreferencesButton } from "@/components/marketing/cookie-preferences-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { siteConfig } from "@/lib/site";

export const metadata = createMetadata({
  title: "Cookie Policy",
  description: `How ${siteConfig.name} uses cookies on its public pages — what we set, why, the third-party analytics providers involved, and how to change your choice at any time.`,
  path: "/cookie-policy",
});

const LAST_UPDATED = "July 25, 2026";

const cookieTable = [
  {
    name: "cookie_consent",
    provider: siteConfig.name,
    purpose:
      "Remembers whether you accepted or declined analytics cookies, so the banner doesn't reappear on every visit.",
    duration: "180 days",
  },
  {
    name: "__session",
    provider: "Firebase Authentication (Google)",
    purpose:
      "Keeps you signed in. Strictly necessary — set only once you sign in, not by the marketing pages themselves, and unaffected by your analytics choice below.",
    duration: "Session, until you sign out",
  },
  {
    name: "_ga, _ga_*",
    provider: "Google Analytics",
    purpose:
      "Distinguishes visitors and sessions so we can see aggregate traffic and how people navigate the site.",
    duration: "Up to 2 years",
  },
  {
    name: "_clck, _clsk",
    provider: "Microsoft Clarity",
    purpose:
      "Groups your pageviews into a session so we can see anonymized click, scroll, and navigation patterns (heatmaps and session recordings).",
    duration: "Up to 1 year",
  },
];

export default function CookiePolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-4xl font-semibold tracking-tight">Cookie Policy</h1>
      <p className="mt-3 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>

      <div className="mt-10 space-y-8 text-muted-foreground">
        <section className="space-y-3">
          <h2 className="text-xl font-medium text-foreground">Overview</h2>
          <p>
            This policy explains how {siteConfig.name} uses cookies on our public pages
            (this site, outside the signed-in app) — what we set, why, and how you can
            change your mind at any time. It should be read alongside our{" "}
            <Link
              href="/privacy"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-foreground">What are cookies?</h2>
          <p>
            Cookies are small text files a website stores in your browser. They let a
            site remember something between page loads or visits — like a preference, a
            login session, or (with your consent) an anonymized visit for analytics.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-foreground">Nothing loads until you decide</h2>
          <p>
            When you first visit, a banner asks you to Accept or Decline analytics
            cookies. Google Analytics and Microsoft Clarity are not loaded, and set no
            cookies, until you click Accept — Decline is a real, working choice, not
            just cosmetic. Analytics also never runs inside the signed-in app; it&apos;s
            scoped to these public marketing pages only.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-foreground">Cookies we use</h2>
          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cookie</TableHead>
                  <TableHead>Set by</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead>Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cookieTable.map((c) => (
                  <TableRow key={c.name}>
                    <TableCell className="whitespace-nowrap font-mono text-xs text-foreground">
                      {c.name}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{c.provider}</TableCell>
                    <TableCell className="min-w-[16rem] whitespace-normal">
                      {c.purpose}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{c.duration}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-sm">
            The first two rows are strictly necessary — the site can&apos;t remember your
            consent choice or keep you signed in without them, so they aren&apos;t
            covered by the Accept/Decline choice below. The Google Analytics and
            Microsoft Clarity rows are only ever set if you click Accept.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-foreground">
            Why we use analytics cookies
          </h2>
          <p>
            Google Analytics and Microsoft Clarity tell us which pages get visited, which
            buttons and links people actually use, and where visitors drop off — so we
            can improve the site instead of guessing. We don&apos;t use this data for
            advertising, we don&apos;t sell it, and we don&apos;t combine it with your
            SpendChat account or transaction data.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-foreground">Third-party providers</h2>
          <p>
            These cookies are set by third parties who process the resulting data under
            their own privacy policies:
          </p>
          <ul className="list-inside list-disc space-y-2">
            <li>
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noreferrer"
                className="text-foreground underline underline-offset-2 hover:no-underline"
              >
                Google Privacy Policy
              </a>{" "}
              — covers Google Analytics.
            </li>
            <li>
              <a
                href="https://clarity.microsoft.com/privacy"
                target="_blank"
                rel="noreferrer"
                className="text-foreground underline underline-offset-2 hover:no-underline"
              >
                Microsoft Clarity Privacy Policy
              </a>{" "}
              — covers Microsoft Clarity.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-foreground">
            Browser controls & Do Not Track
          </h2>
          <p>
            Most browsers let you block or delete cookies in their settings, and we
            don&apos;t currently respond to the &ldquo;Do Not Track&rdquo; browser
            signal — declining the banner below has the same effect and is the more
            reliable choice, since it stops the analytics scripts from loading at all
            rather than asking them to behave differently.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-foreground">Changes</h2>
          <p>
            We may update this policy as our cookie usage changes. Material changes will
            be reflected by the &ldquo;Last updated&rdquo; date above.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-foreground">Contact</h2>
          <p>
            Questions about this policy? Email us at{" "}
            <a
              href={`mailto:${siteConfig.supportEmail}`}
              className="text-foreground underline underline-offset-2 hover:no-underline"
            >
              {siteConfig.supportEmail}
            </a>
            .
          </p>
        </section>
      </div>

      <div className="mt-12 rounded-2xl border bg-card p-7 text-center">
        <h2 className="text-lg font-medium text-foreground">Change your mind?</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          You can accept or decline analytics cookies again at any time — it takes
          effect immediately.
        </p>
        <div className="mt-6 flex justify-center">
          <CookiePreferencesButton />
        </div>
      </div>
    </div>
  );
}

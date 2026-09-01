import Link from "next/link";
import { createMetadata } from "@/lib/seo";
import { siteConfig } from "@/lib/site";

export const metadata = createMetadata({
  title: "Privacy Policy",
  description: `How ${siteConfig.name} collects, uses, and protects your data — what we store, why we store it, who processes it, and the controls you have over it.`,
  path: "/privacy",
});

const LAST_UPDATED = "September 2, 2026";

/**
 * Every claim on this page has to be a statement about code in the repository,
 * because the repository is public and someone will check. When you add a
 * feature that sends data anywhere — a new processor, a new upload target, a
 * new model provider — it belongs in the sub-processor table below **in the
 * same change**, and `LAST_UPDATED` moves with it. A policy that lags the
 * product is worse than no policy: it is a false statement about what happens
 * to people's money data.
 */

/** Third parties that touch user data, and the reason each one is unavoidable. */
const PROCESSORS = [
  {
    name: "Neon",
    role: "Postgres database",
    data: "Everything you record: transactions, categories, profiles, workspaces, settings.",
  },
  {
    name: "Cloudflare",
    role: "Application hosting + file storage (R2)",
    data: "Every request to the app, and the files you upload — receipts, attachments, and vault documents.",
  },
  {
    name: "Google (Firebase Authentication)",
    role: "Sign-in and session security",
    data: "Your email address, and — if you sign in with Google — your Google profile name and picture.",
  },
  {
    name: "The AI provider configured for this deployment",
    role: "AI entry and voice entry, only when you use them",
    data: "The note you type or the recording you make, plus your workspace's category names and currency.",
  },
  {
    name: "ZeptoMail",
    role: "Transactional email",
    data: "The recipient's email address, when you invite someone to a workspace.",
  },
  {
    name: "BetterStack",
    role: "Server error and performance logs",
    data: "Request metadata and internal account identifiers. No transaction text, amounts, names or file contents.",
  },
  {
    name: "Google Analytics and Microsoft Clarity",
    role: "Marketing-site analytics — only if you accept cookies",
    data: "Pages visited and anonymised interaction patterns on the public site. Never loaded on the app itself.",
  },
] as const;

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-4xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-3 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>

      <div className="mt-10 space-y-8 text-muted-foreground">
        <section className="space-y-3">
          <h2 className="text-xl font-medium text-foreground">Overview</h2>
          <p>
            {siteConfig.name} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) is a money tracker
            operated by {siteConfig.author}. This policy explains what we collect, why we
            collect it, who else processes it, and the controls you have.
          </p>
          <p>
            {siteConfig.name} is open source under the {siteConfig.license} licence, so
            this policy is checkable rather than merely promised: the code that handles
            your data is public at{" "}
            <a
              href={siteConfig.links.github}
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline underline-offset-4"
            >
              {siteConfig.links.github.replace("https://", "")}
            </a>
            .
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-foreground">Information we collect</h2>
          <ul className="list-inside list-disc space-y-2">
            <li>
              <span className="text-foreground">Account information</span> — your email
              address, managed by our authentication provider (Firebase Authentication, a
              Google service). If you sign in with Google, your basic Google profile (name
              and picture) is shared with the app. We never see or store your password:
              the email-and-password path is handled entirely by Google.
            </li>
            <li>
              <span className="text-foreground">Your transactions</span> — the amounts,
              categories, notes, and dates you choose to record.
            </li>
            <li>
              <span className="text-foreground">Files you upload</span> — receipts
              attached to transactions, and any documents you put in the file vault. These
              are stored in Cloudflare R2 and served only through short-lived, signed
              links.
            </li>
            <li>
              <span className="text-foreground">Preferences</span> — settings such as your
              workspace&apos;s currency and number format, your theme, and the languages
              voice entry should expect.
            </li>
            <li>
              <span className="text-foreground">Technical data</span> — server logs
              containing request metadata and internal account identifiers, kept to
              diagnose errors. Your country is read once from your connection when your
              account is created, only to pick a sensible default currency.
            </li>
          </ul>
          <p>
            We do not connect to your bank, and we never ask for card numbers, account
            numbers, or banking credentials — there is no feature in the product that
            could use them.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-foreground">How we use your data</h2>
          <p>
            Your information is used solely to provide the service: to authenticate you,
            to store and display what you record, and to let you search, filter, export
            and print it. We do not sell your personal data, we do not share it with
            advertisers, and we do not use your financial records to train any AI model.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-foreground">Who can see your records</h2>
          <p>
            Your data is private to your account by default. It becomes visible to other
            people only through something you do:
          </p>
          <ul className="list-inside list-disc space-y-2">
            <li>
              <span className="text-foreground">Workspace members</span> — if you invite
              someone to a workspace, or accept an invitation to one, members can see the
              profiles they have been given access to, and what those profiles contain.
              Their role (viewer, editor, or admin) decides what they may change.
            </li>
            <li>
              <span className="text-foreground">Share links</span> — if you create a share
              link for a file or folder, anyone holding that link can open it without
              signing in. That is what the link is for. You can revoke it at any time, and
              revoking takes effect immediately.
            </li>
          </ul>
          <p>
            Outside of those two, nothing you record is shown to another user of the
            service.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-foreground">AI and voice entry</h2>
          <p>
            AI entry and voice entry are the only features that send your content to a
            third party, and they run only when you choose to use them. When you do, the
            note you typed (or the audio you recorded), your workspace&apos;s category
            names, and its currency are sent to the AI provider this deployment is
            configured with, so it can propose draft rows for you to review.
          </p>
          <p>
            Nothing is saved on your behalf until you confirm those drafts. Recordings are
            transcribed and discarded — we never store the audio. If you never use AI or
            voice entry, no part of your data reaches an AI provider at all. Every other
            way of adding a transaction — typing, bulk paste, import — stays entirely
            within the app.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-foreground">Who processes your data</h2>
          <p>
            We use the infrastructure providers below to run the service. Each acts on our
            instructions, and none is permitted to use your data for its own purposes.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2 pr-4 font-medium text-foreground">Provider</th>
                  <th className="py-2 pr-4 font-medium text-foreground">Purpose</th>
                  <th className="py-2 font-medium text-foreground">What it receives</th>
                </tr>
              </thead>
              <tbody>
                {PROCESSORS.map((p) => (
                  <tr key={p.name} className="border-b border-border/60 align-top">
                    <td className="py-2 pr-4 text-foreground">{p.name}</td>
                    <td className="py-2 pr-4">{p.role}</td>
                    <td className="py-2">{p.data}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Analytics never run on the authenticated app, and never run anywhere until you
            accept them — see the{" "}
            <Link
              href="/cookie-policy"
              className="text-foreground underline underline-offset-4"
            >
              Cookie Policy
            </Link>
            , which lists every cookie and lets you change your mind at any time.
          </p>
          <p>
            Because {siteConfig.name} is self-hostable, anyone running their own instance
            chooses their own providers. This table describes the instance at{" "}
            {siteConfig.domain}.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-foreground">How long we keep it</h2>
          <p>
            Your records are kept for as long as your account exists — a money tracker is
            only useful with its history intact — and are deleted when you delete them or
            delete your account. Server logs and the internal rate-limit records that stop
            abuse of email and AI features are short-lived operational data, pruned by the
            operator on a roughly 30-day window.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-foreground">Security</h2>
          <p>
            Connections are encrypted in transit. Every query is scoped to what your
            account is allowed to see, all input is validated, and the app sends strict
            security headers. Files are stored in a private bucket and are never public:
            each download is a signed link that expires in minutes. Session tokens are
            held in httpOnly cookies your browser will not expose to scripts. No system is
            perfectly secure, but these are the measures we take, and you can read every
            one of them in the source.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-foreground">Your rights and choices</h2>
          <ul className="list-inside list-disc space-y-2">
            <li>
              <span className="text-foreground">Access and export</span> — every
              transaction you have is visible in the app, and can be downloaded as CSV
              from the transactions view at any time.
            </li>
            <li>
              <span className="text-foreground">Correction</span> — edit or delete any
              individual transaction, file, or category directly in the app.
            </li>
            <li>
              <span className="text-foreground">Erasure</span> — delete your whole account
              from <span className="text-foreground">Settings → Account</span>, without
              emailing anyone. That removes your transactions, the workspaces you own and
              everything inside them, your uploaded files, your memberships and your
              settings. Your sign-in credential is removed in the same step; if you have
              been signed in a while, our authentication provider asks you to sign in once
              more before it will do that, and the app tells you so.
            </li>
            <li>
              <span className="text-foreground">Objection and withdrawal of consent</span>{" "}
              — decline or withdraw analytics consent at any time from the Cookie Policy
              page. Simply not using AI or voice entry keeps your content away from any AI
              provider.
            </li>
          </ul>
          <p>
            Depending on where you live you may have further rights over your personal
            data, including the right to complain to your local data-protection authority.
            To exercise any of them, write to{" "}
            <a
              href={`mailto:${siteConfig.supportEmail}`}
              className="text-foreground underline underline-offset-4"
            >
              {siteConfig.supportEmail}
            </a>
            .
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-foreground">
            International transfers and children
          </h2>
          <p>
            Our providers operate globally, so your data may be processed outside your
            country, under the safeguards those providers offer for international
            transfers. {siteConfig.name} is not directed at children under 13, and we do
            not knowingly collect their data.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-foreground">Contact and changes</h2>
          <p>
            {siteConfig.author} is the data controller for {siteConfig.domain}. Questions
            about this policy, or about your data, go to{" "}
            <a
              href={`mailto:${siteConfig.supportEmail}`}
              className="text-foreground underline underline-offset-4"
            >
              {siteConfig.supportEmail}
            </a>
            .
          </p>
          <p>
            We may update this policy as the product changes. Material changes are
            reflected in the &ldquo;Last updated&rdquo; date above, and because the site is
            open source, the full history of every edit to this page is public.
          </p>
        </section>
      </div>
    </div>
  );
}

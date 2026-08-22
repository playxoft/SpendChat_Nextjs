import Link from "next/link";
import { PrivacyDemo } from "@/components/marketing/demo/privacy-demo";
import {
  FeatureAudience,
  FeaturePage,
  FeatureSection,
  FeatureSteps,
} from "@/components/marketing/feature-page";
import { featureLink, getFeature } from "@/lib/features";
import { createMetadata } from "@/lib/seo";
import { siteConfig } from "@/lib/site";

const SLUG = "privacy-and-security";
const feature = getFeature(SLUG)!;

export const metadata = createMetadata({
  title: feature.title,
  description: feature.description,
  path: `/features/${SLUG}`,
});

const faqs = [
  {
    q: "Is SpendChat safe to use?",
    a: "It holds what you type into it and nothing more — no bank credentials, no card numbers, no payment details, because there's no feature that would use them. Sign-in is handled by Firebase Authentication, so we never see or store a password. Every read is scoped to your own access, and the codebase is public if you'd rather check than trust.",
  },
  {
    q: "Do I have to connect my bank?",
    a: "No — and you couldn't if you wanted to. There is no bank integration anywhere in SpendChat, no aggregator behind it, and no screen that asks for banking credentials. Transactions get in because you type them, say them, paste them from a spreadsheet, or let the AI read a sentence you wrote.",
  },
  {
    q: "Do you sell my data?",
    a: "No. We don't sell personal data, we don't use it for advertising, and there are no ads in the app. The only third parties involved are the infrastructure it runs on — the database host, the authentication provider, file storage, and the AI model if you use AI entry — each doing one job for us, not building a profile of you.",
  },
  {
    q: "Can I delete my account and all my data?",
    a: "Yes, from Settings, without emailing anyone. Deleting your account removes your transactions, the workspaces you own (and everything inside them), your memberships, and your settings, then the account row itself. There's also a lighter option that clears transactions but keeps the account. Both make you type DELETE first, because both are irreversible.",
  },
  {
    q: "Does my data go to an AI company?",
    a: "Only if you use AI or voice entry, and only the part that's needed: the note you typed (or the recording you made), your workspace's category names, its currency code and today's date. No name, no email, no user id, no balance, and none of your other transactions. Manual entry calls no model at all.",
  },
  {
    q: "Is SpendChat really open source?",
    a: `Yes — AGPL-3.0, on GitHub at ${siteConfig.links.github}. Every claim on this page is a statement about code you can read: the auth checks, the queries, the AI prompts, the security headers. You can also run your own copy against your own database if you'd rather not use ours.`,
  },
];

export default function PrivacyAndSecurityPage() {
  return (
    <FeaturePage
      slug={SLUG}
      demo={<PrivacyDemo />}
      demoAction="pick an action and read what the request actually carries"
      faqs={faqs}
      intro={
        <>
          <p>
            Most expense trackers open by asking for your bank login. SpendChat
            can&apos;t, because there is no bank integration in it — no
            aggregator, no read-only credentials, no consent screen that hands a
            third party a window into your account. You type what you spent, or
            say it, and that is the entire data-collection story.
          </p>
          <p>
            That&apos;s a trade-off, not a free win: nothing appears in your feed
            unless you put it there. What you get in return is a much smaller
            thing to worry about. The panel below is the actual ledger — pick an
            action and read what leaves your device.
          </p>
        </>
      }
    >
      <FeatureSteps
        title="What we ask you for"
        steps={[
          {
            title: "An email address",
            body: "That's the account. Sign in with Google or with an email and password — either way the credential is handled by Firebase Authentication, and there is no password column in our database to steal.",
          },
          {
            title: "Whatever you choose to type",
            body: "Amounts, titles, categories, dates, and a receipt if you attach one. One entry at a time, all of it editable, all of it deletable.",
          },
          {
            title: "Nothing else",
            body: "No bank credentials, no card numbers, no contacts, no device identifiers. There's no field for any of them, because there's no feature that would use one.",
          },
        ]}
      />

      <FeatureSection title="We never ask for your bank login">
        <p>
          The reason SpendChat never asks for your banking credentials is not
          restraint — it&apos;s that nothing in the product could accept them.
          Search the codebase for an aggregator and you find none: no Plaid, no
          TrueLayer, no Salt Edge, no open-banking client of any kind, and no
          &ldquo;connect an account&rdquo; screen waiting behind a feature flag.
        </p>
        <p>
          That has a consequence people usually only appreciate after the fact.
          A tracker that holds bank connections is a tracker that can be phished:
          once users are trained to type banking credentials into a page that
          looks like their tracker, a convincing copy of that page is worth
          building. Nobody can phish a SpendChat user for a bank login, because a
          SpendChat user has never been asked for one and would find the request
          strange.
        </p>
        <p>
          The honest cost is that automatic import doesn&apos;t exist. You add
          things yourself — which is why so much of the rest of the product is
          about making that fast:{" "}
          <Link
            href={featureLink("ai-expense-tracker")}
            className="underline underline-offset-4"
          >
            a sentence in plain English
          </Link>
          ,{" "}
          <Link
            href={featureLink("voice-expense-tracker")}
            className="underline underline-offset-4"
          >
            a held key and your voice
          </Link>
          , or a block of rows pasted straight out of a spreadsheet. Ten seconds
          a day, and nothing outside the app knows anything about your money.
        </p>
      </FeatureSection>

      <FeatureSection title="How your account is actually protected">
        <p>
          <strong>Sign-in.</strong> Authentication is Firebase Authentication —
          Google, or email and password. The password path is Google&apos;s
          entirely: we never see it and store no hash of it. What we get is a
          signed ID token, which the browser hands to one endpoint that verifies
          it and puts it in an{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-sm">httpOnly</code>{" "}
          cookie — meaning script on the page, ours or anything that ever got
          injected into it, cannot read that cookie.
        </p>
        <p>
          <strong>Verification.</strong> Every request re-verifies the token
          against Google&apos;s public keys, pinning the signing algorithm to
          RS256 and pinning both the issuer and the audience to this project. A
          token minted for some other Firebase project, or signed with an
          algorithm we didn&apos;t ask for, is rejected rather than trusted.
        </p>
        <p>
          <strong>Identity.</strong> Exactly one place in the codebase turns a
          Firebase user id into an internal one, and every table stores our own
          identifier rather than the provider&apos;s. That&apos;s plumbing, but
          it&apos;s the plumbing that makes &ldquo;is this row yours?&rdquo; a
          question with one answer in one place.
        </p>
        <p>
          <strong>Scoping.</strong> Reads live in one query module and writes in
          one actions module, and both are scoped to the profiles you can reach
          in the workspace you&apos;re currently in — by membership, or by a
          per-profile grant, whichever gives you more. Being the person who typed
          a transaction is attribution, not access: if you&apos;re removed from a{" "}
          <Link
            href={featureLink("workspaces")}
            className="underline underline-offset-4"
          >
            shared workspace
          </Link>
          , the rows you wrote stay with the workspace and stop being yours to
          read or delete. Every write is validated with a schema before it
          reaches the database, and every query is parameterised, so a note
          containing SQL is just a note containing SQL.
        </p>
        <p>
          <strong>Headers.</strong> Every response carries a
          Content-Security-Policy, HSTS,{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-sm">
            X-Content-Type-Options: nosniff
          </code>
          , a referrer policy, and framing blocked outright, so the app
          can&apos;t be embedded in someone else&apos;s page and clicked through.
          The Permissions-Policy closes the camera, geolocation and microphone
          everywhere, then re-opens the microphone on one page: the tracker,
          which is the only page that records.
        </p>
        <p>
          One limitation, stated rather than hidden: signing out clears your
          cookies on that device but doesn&apos;t revoke the Firebase refresh
          token server-side, so there is no working &ldquo;sign out
          everywhere&rdquo; today. That&apos;s a real gap, and it&apos;s written
          down in the code as one.
        </p>
      </FeatureSection>

      <FeatureSection title="What the AI sees, and what it never does">
        <p>
          AI entry and voice entry are the only features that send anything to a
          third party you didn&apos;t already sign in with, so they deserve the
          most scrutiny. When you send an AI note, the request contains the note
          itself, your workspace&apos;s category names, its currency code, and
          today&apos;s date. That is the complete payload — no name, no email, no
          user id, no balance, none of your other transactions. The model is
          answering a question about one sentence and has no channel through
          which to ask for more.
        </p>
        <p>
          Voice adds the recording and the languages you selected. The audio is
          transcribed and then discarded: nothing is written to storage,
          there&apos;s no recording history, and there is nothing to export or
          lose. What survives the round trip is text you can read before anything
          happens to it.
        </p>
        <p>
          Neither one writes to your data. Parsing produces drafts, the drafts
          sit in front of you, and the database is untouched until you press Add.
          That gate exists because a model&apos;s failure mode on a money note is
          a plausible-looking wrong number — the worst kind to let into a
          financial record silently.
        </p>
        <p>
          We keep one row per AI request, and it&apos;s worth knowing what&apos;s
          in it: a user id, a workspace id, a label saying which feature called,
          and a timestamp. Four columns, none of them your note. It exists to
          enforce an hourly limit so one account can&apos;t run up the bill. The
          application logs follow the same rule — ids, counts and durations,
          never the text of what you wrote — and receipts aren&apos;t read at
          all, because there is no OCR step and no vision step anywhere in the
          product.
        </p>
      </FeatureSection>

      <FeatureSection title="No ads, no data selling, and an exit that works">
        <p>
          There are no ads in SpendChat and no plans for any. We don&apos;t sell
          personal data and we don&apos;t use it for advertising — easier to mean
          when the business model isn&apos;t attention. The app is free today and
          open source, so a copy of it outlives whatever we decide about{" "}
          <Link href="/pricing" className="underline underline-offset-4">
            pricing
          </Link>{" "}
          later.
        </p>
        <p>
          Analytics deserve their own paragraph, because &ldquo;we respect your
          privacy&rdquo; so often shares a page with three trackers. Google
          Analytics and Microsoft Clarity are mounted in the marketing layout and
          nowhere else, so the signed-in app never loads either one. Neither
          loads at all until you click Accept on the banner; Decline is a working
          choice, not a cosmetic one, and you can change it from the{" "}
          <Link href="/cookie-policy" className="underline underline-offset-4">
            cookie policy
          </Link>{" "}
          at any time. Nothing collected there is joined to your account or your
          transactions.
        </p>
        <p>
          Leaving is deliberately undramatic. You can{" "}
          <Link
            href={featureLink("export-and-print")}
            className="underline underline-offset-4"
          >
            download your transactions as CSV
          </Link>{" "}
          — the exact view you&apos;re looking at, with no export limit and no
          paid tier gating it — or print a report. From Settings you can clear
          transactions and keep the account, or delete the account outright,
          which removes your transactions, the workspaces you own and everything
          in them, your memberships, and your settings. Both make you type
          DELETE, because both are irreversible. The{" "}
          <Link href="/privacy" className="underline underline-offset-4">
            privacy policy
          </Link>{" "}
          is the formal version of all of this.
        </p>
      </FeatureSection>

      <FeatureSection title="Open source, so you don't have to take our word for it">
        <p>
          SpendChat is published under the AGPL-3.0 at{" "}
          <a
            href={siteConfig.links.github}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4"
          >
            github.com/playxoft/SpendChat_Nextjs
          </a>
          . Every sentence on this page describes code in that repository: the
          token verification, the access checks on every query, the exact prompt
          text sent to a model, the headers in the Next config. If something here
          were untrue, the repository would say so — and a licence that requires
          modifications to stay open means a hosted fork can&apos;t quietly
          become the closed version.
        </p>
        <p>
          It also means an option we can&apos;t take away: run your own copy
          against your own database, and the only party holding your transactions
          is you. The project ships a security policy for reporting
          vulnerabilities privately rather than in a public issue — the part of
          &ldquo;open source&rdquo; that actually matters when someone finds
          something.
        </p>
        <p>
          And the things we haven&apos;t done, said plainly, because a security
          page that only lists wins isn&apos;t worth reading: there is no
          third-party security audit and no compliance certification. There is no
          end-to-end encryption — your transactions are stored in a database we
          can technically read, the same as with essentially every hosted app,
          and a page claiming otherwise would be lying. Sign-out doesn&apos;t
          revoke sessions on other devices yet. What we can honestly claim is a
          much smaller collection surface than the category standard, a codebase
          you can inspect, and no reason to want your data for anything but
          showing it back to you.
        </p>
      </FeatureSection>

      <FeatureAudience
        items={[
          {
            title: "People who won't hand over bank credentials",
            body: "A completely reasonable position that most trackers treat as a dealbreaker. Here it costs you nothing, because the feature you'd be declining doesn't exist.",
          },
          {
            title: "Anyone whose finances aren't only theirs",
            body: "Household money, a shared business float, a partner's spending in the same book. Roles decide who can view, edit or administer, and access ends when you end it — not when someone remembers to.",
          },
          {
            title: "Developers who read before they sign up",
            body: "The repository is public and the interesting parts — auth, query scoping, AI prompts, security headers — are all where you'd expect them, with comments explaining the trade-offs rather than hiding them.",
          },
        ]}
      />
    </FeaturePage>
  );
}

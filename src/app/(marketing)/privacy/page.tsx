import { createMetadata } from "@/lib/seo";
import { siteConfig } from "@/lib/site";
import { ADULT_AGE, LEGAL_UPDATED, MIN_AGE } from "@/lib/legal";
import { TRASH_DAYS } from "@/lib/plans";
import { TRIAL_DAYS } from "@/lib/pricing";
import {
  Ext,
  GrievanceOfficer,
  In,
  LegalList,
  LegalPage,
  LegalSection,
  LegalSubsection,
  LegalTable,
  SupportEmail,
  Term,
} from "@/components/legal/legal-page";

export const metadata = createMetadata({
  title: "Privacy Policy",
  description: `How ${siteConfig.name} collects, uses, shares and protects personal data — AI features, service providers, retention, and your rights under GDPR, the DPDP Act, US state laws and the Australian Privacy Act.`,
  path: "/privacy",
});

/**
 * Every claim on this page has to be a statement about code in the repository,
 * because the repository is public and someone will check. When you add a
 * feature that sends data anywhere — a new processor, a new upload target, a
 * new model provider — it belongs in the provider table below **in the same
 * change**, and so does a new kind of data, a new purpose or a new retention
 * rule. A material change also moves `LEGAL_VERSION` (`src/lib/legal.ts`), which
 * asks every signed-in person to accept again. A policy that lags the product
 * is worse than no policy: it is a false statement about what happens to
 * people's money data.
 *
 * It is written to meet the notice requirements of the EU and UK GDPR
 * (Articles 13–14), India's DPDP Act 2023 and Rules, the CCPA/CPRA and other US
 * state laws, and the Australian Privacy Principles (APP 1, 5 and 8, including
 * the automated-decision disclosures in APP 1.7–1.9) — the region sections near
 * the end carry what only one of them asks for.
 */
const name = siteConfig.name;
const op = siteConfig.author;

const TOC = [
  { id: "summary", title: "The short version" },
  { id: "who-we-are", title: "Who we are" },
  { id: "data-we-collect", title: "Personal data we collect" },
  { id: "how-we-use", title: "How we use it, and our legal bases" },
  { id: "ai", title: "AI features and your data" },
  { id: "automated-decisions", title: "Automated decisions" },
  { id: "sharing", title: "Who we share it with" },
  { id: "transfers", title: "International transfers" },
  { id: "retention", title: "How long we keep it" },
  { id: "security", title: "Security and breaches" },
  { id: "your-rights", title: "Your rights" },
  { id: "eu-uk", title: "EU, EEA, UK and Switzerland" },
  { id: "india", title: "India" },
  { id: "united-states", title: "United States" },
  { id: "australia", title: "Australia" },
  { id: "other-regions", title: "Other countries" },
  { id: "children", title: "Children and teens" },
  { id: "changes", title: "Changes to this policy" },
  { id: "contact", title: "Contact and complaints" },
];

/** Service providers that process personal data on our behalf. */
const PROCESSORS: [string, string, string, string][] = [
  [
    "Cloudflare, Inc.",
    "Hosting of the website, app and API; content delivery and security; file storage (R2); rate-limit counters",
    "Every request to the Service, including your IP address; the files you upload",
    "USA (global network)",
  ],
  [
    "Neon (database hosting)",
    "Our Postgres database",
    "Everything you record and your account, workspace and billing records",
    "USA",
  ],
  [
    "Google LLC — Firebase Authentication",
    "Sign-in, email verification and password reset",
    "Email address, password (held by Google, never by us), name and picture if you use Google sign-in, IP address",
    "USA",
  ],
  [
    "Google LLC — Gemini API",
    "AI entry, voice entry and SpendChat AI, only when you use them",
    "The content of that AI request (see “AI features and your data”)",
    "USA and other countries where Google operates",
  ],
  [
    "Zoho Corporation — ZeptoMail",
    "Transactional email",
    "Recipient’s email address and name, and the email’s content",
    "India / USA",
  ],
  [
    "Better Stack, Inc.",
    "Server error and performance logs",
    "Request metadata, internal account and workspace identifiers, error messages — no transaction text, amounts, names or file contents",
    "USA / EU",
  ],
  [
    "Google LLC — Google Analytics; Microsoft Corporation — Clarity",
    "Analytics on the public website, only if you accept analytics cookies",
    "Pages visited, interactions, device and browser details, approximate location from IP — never on the signed-in app",
    "USA",
  ],
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated={LEGAL_UPDATED}
      toc={TOC}
      inShort
      intro={
        <>
          <p>
            This Privacy Policy explains how {op} collects, uses, shares and protects personal
            data when you use {name} — our website at {siteConfig.domain}, the web and mobile
            apps, the API and the free tools (the “<Term>Service</Term>”) — and the rights you
            have. It forms the privacy notice required by the data-protection laws that apply to
            us, including the EU and UK General Data Protection Regulation (“<Term>GDPR</Term>”),
            India’s Digital Personal Data Protection Act, 2023 (“<Term>DPDP Act</Term>”), the
            California Consumer Privacy Act as amended (“<Term>CCPA</Term>”) and other US state
            laws, and Australia’s Privacy Act 1988. Words such as “personal data” include
            “personal information” where a law uses that term.
          </p>
          <p>
            {name} is open source under the {siteConfig.license} licence, so this policy is
            checkable rather than merely promised: the code that handles your data is public at{" "}
            <Ext href={siteConfig.links.github}>{siteConfig.links.github.replace("https://", "")}</Ext>.
          </p>
        </>
      }
    >
      <LegalSection id="summary" title="1. The short version">
        <LegalList>
          <li>We collect what you give us to run your money tracker — your account details and the records, files and settings you add — plus the technical data needed to keep the Service secure.</li>
          <li>We never connect to your bank, and never ask for your card numbers or online-banking credentials.</li>
          <li>We don’t sell your personal data, don’t share it for advertising, don’t show ads, and don’t use your records to train AI models.</li>
          <li>AI features run only when you use them. Then, what that request needs is sent to our AI provider (currently Google) to produce a result.</li>
          <li>Analytics run only on the public website and only if you accept them. We honour Global Privacy Control.</li>
          <li>You can export your data, correct it and delete your account yourself, at any time, from Settings.</li>
          <li>{`${name} is for people ${MIN_AGE} and older — you confirm that with the same tick that accepts these terms. We never ask for your date of birth.`}</li>
        </LegalList>
      </LegalSection>

      <LegalSection
        id="who-we-are"
        title="2. Who we are"
        summary={`${name} is run by ${op}, based in India, and we’re responsible for your data — except data a business keeps in ${name} about its own clients, where that business is in charge.`}
      >
        <p>
          {name} is operated by {op}, which is based in India. {op} decides why and how your
          personal data is processed for the Service, which makes it the “controller” under the
          GDPR, the “Data Fiduciary” under the DPDP Act, the “business” under the CCPA, and the
          “APP entity” under the Australian Privacy Act. You can reach us about anything in this
          policy at <SupportEmail />. Our Grievance Officer for India is named in section 13.
        </p>
        <p>
          <Term>Where we act for someone else.</Term> When a business uses the Service to hold
          personal data about other people — for example its clients on invoices, or the members
          of a workspace it runs — that business is the controller of that data and we process it
          on its behalf, under the data processing terms in section 8 of our{" "}
          <In href="/terms">Terms of Service</In>. If your details are held in someone else’s
          workspace or invoice, please contact them first; we will help them respond.
        </p>
        <p>
          <Term>What this policy doesn’t cover.</Term> Copies of {name} that other people run on
          their own servers (the code is open source) are operated by them, not us. Nor does it
          cover websites and services we link to, which have their own policies.
        </p>
      </LegalSection>

      <LegalSection
        id="data-we-collect"
        title="3. Personal data we collect"
        summary="Your account details, what you add (records, files, invoices), any optional answers you choose to give us, and a few technical details that keep SpendChat safe."
      >
        <LegalTable
          head={["Category", "What it includes", "Where it comes from"]}
          rows={[
            [
              "Account details",
              "Email address; name and profile picture (from Google sign-in, or as you set them); your internal account id and your Firebase sign-in id; the sign-in method; when you accepted these terms. We never see or store your password — the email-and-password path is handled entirely by Google.",
              "You; Google, if you sign in with Google",
            ],
            [
              "Financial records you enter",
              "Transactions (amounts, dates, types, categories, tags, titles and notes), profiles, spaces, workspaces, budgets, and your workspace’s currency and number format.",
              "You and the members of your workspaces",
            ],
            [
              "Files",
              "Receipts and other attachments, documents in the file vault, profile pictures, seller logos — with their names, sizes and types.",
              "You and your workspace members",
            ],
            [
              "Collaboration",
              "Workspace memberships and roles; invitations (the invitee’s email address); split groups — the names and, if given, email addresses of people added, the expenses and shares; share links you create.",
              "You, and other users who add you",
            ],
            [
              "Invoices and quotations",
              "Your business details as seller, including any registration number and the bank details you choose to print for receiving payment; your clients’ names, contact details, addresses and tax ids; line items, notes and payment status; private notes about saved clients.",
              "You",
            ],
            [
              "AI inputs and outputs",
              "Notes you send to AI entry; voice recordings you make for voice entry (transcribed and discarded — never stored); questions you ask SpendChat AI and its answers; counts of AI actions used.",
              "You",
            ],
            [
              "Billing",
              "Plan, billing period and status, the country and currency you buy in, amounts, invoice links, our payment provider’s customer, subscription and payment ids, and whether a payment was refunded or disputed; for trials, a one-way hash of the email address that started one. We never receive your full card or bank details — they are entered on our payment provider’s page.",
              "You; Dodo Payments",
            ],
            [
              "Communications",
              "Emails you send us and our replies; records of the transactional emails we send you.",
              "You; us",
            ],
            [
              "Preferences",
              "Theme, input mode, layout preferences, voice-entry languages and your time zone.",
              "You; your browser",
            ],
            [
              "How you found us",
              "The website that linked you to us and any campaign tag on that link (hostnames and short tags only), and your answer to the optional “how did you hear about us?” question.",
              "Your browser; you",
            ],
            [
              "About you (optional)",
              "If you answer our optional welcome questions: whether you use SpendChat for personal or business use, what you’d like to do with it, who you’ll use it with, how you track money today, which best describes you (for example student or freelancer), your team size, how often you expect to use it, and which features interest you. Each answer is a choice from a list, and you can skip any or all of them.",
              "You",
            ],
            [
              "Email preferences",
              "Whether you said yes to product news emails, and when.",
              "You",
            ],
            [
              "Technical data",
              "IP address; the country derived from it; browser and device type; request details and times; error logs; rate-limit counters; whether your browser sends a Global Privacy Control signal.",
              "Your device, automatically",
            ],
            [
              "Cookies and local storage",
              "Sign-in cookies, preference cookies and — only with your consent — analytics cookies on the public website. See the Cookie Policy.",
              "Your browser",
            ],
          ]}
        />
        <p>
          <Term>Sensitive information.</Term> We do not ask for sensitive or special-category
          data — such as health, religion, biometrics or government identity numbers — and you
          should not put it in notes or files. If what you record reveals something sensitive
          (for example, a medical bill), we process it only to provide the Service to you.
          Your email and password are used only to sign you in, and bank details you add to an
          invoice seller are used only to print them on your own invoices and quotations.
        </p>
        <p>
          <Term>What you must provide.</Term> An email address is required to create an account
          and is a condition of our contract with you; without it we cannot provide the Service.
          Everything else is optional, although some features need it to work.
        </p>
      </LegalSection>

      <LegalSection
        id="how-we-use"
        title="4. How we use it, and our legal bases"
        summary="We use your data to run SpendChat for you, keep it secure, take payments and talk to you about your account. Product news only if you say yes — never ads, and never to train AI."
      >
        <p>
          We use personal data only for the purposes below. The third column gives the legal
          basis under the GDPR; section 13 explains the position under India’s DPDP Act.
        </p>
        <LegalTable
          head={["Purpose", "Data used", "Legal basis (GDPR)"]}
          rows={[
            [
              "Create your account, sign you in and keep it secure",
              "Account details, technical data",
              "Performance of our contract with you (Art. 6(1)(b))",
            ],
            [
              "Provide the Service: store, show, sync, search, export and print your records; run workspaces, budgets, split bills, invoices, files and share links",
              "Account details, records, files, collaboration, invoices, preferences",
              "Contract (Art. 6(1)(b))",
            ],
            [
              "Run AI features when you use them",
              "AI inputs and outputs, and the records the request needs",
              "Contract (Art. 6(1)(b))",
            ],
            [
              "Send service emails: welcome, workspace and split invitations you ask us to send, budget alerts, password-change notices (verification and reset emails come from Firebase)",
              "Account details, collaboration, records",
              "Contract (Art. 6(1)(b)); for invitations to people who don’t yet have an account, our and your legitimate interest in inviting them (Art. 6(1)(f))",
            ],
            [
              "Take payments, manage plans and trials, prevent trial and payment abuse, handle refunds and disputes, keep tax and accounting records",
              "Billing, account details",
              "Contract (Art. 6(1)(b)); legal obligation (Art. 6(1)(c)); legitimate interests in preventing fraud and abuse (Art. 6(1)(f))",
            ],
            [
              "Protect the Service: security, rate limits, abuse prevention, diagnosing errors",
              "Technical data, account details",
              "Legitimate interests in a secure, reliable service (Art. 6(1)(f)); legal obligation where security law requires it (Art. 6(1)(c))",
            ],
            [
              "Choose a sensible default currency, suggest your country and currency when you sign up, and show prices in your local currency",
              "Country derived from your IP address or your browser’s language; the country you confirm when you sign up, which sets your currency and number format and isn’t stored",
              "Legitimate interests (Art. 6(1)(f))",
            ],
            [
              "Support you and tell you about changes to the Service or these policies",
              "Account details, communications",
              "Contract (Art. 6(1)(b)); legitimate interests (Art. 6(1)(f))",
            ],
            [
              "Understand who uses SpendChat and what they need, and decide what to build next",
              "About you answers",
              "Legitimate interests in improving the Service (Art. 6(1)(f)) — every question is optional",
            ],
            [
              "Email you product news — new features, updates, offers and occasional requests for feedback — only if you said yes",
              "Account details, email preferences",
              "Consent (Art. 6(1)(a)); turn it off anytime in Settings → Account, or with the unsubscribe link in every such email",
            ],
            [
              "Understand which places bring people to us, and measure the Service in aggregate",
              "How you found us, aggregated usage counts",
              "Legitimate interests in understanding our growth (Art. 6(1)(f)) — the survey question is optional",
            ],
            [
              "Analytics on the public website",
              "Analytics cookies and the data they collect",
              "Consent (Art. 6(1)(a)), which you can withdraw at any time",
            ],
            [
              "Comply with the law, enforce our Terms, and establish, exercise or defend legal claims",
              "Any of the above, as needed",
              "Legal obligation (Art. 6(1)(c)); legitimate interests (Art. 6(1)(f))",
            ],
          ]}
        />
        <p>
          Where we rely on legitimate interests, we have weighed them against your rights and
          expectations, and we use the least data that will do. You can object to that
          processing at any time (section 11).
        </p>
        <p>
          <Term>What we don’t do.</Term> We do not sell personal data; share it for
          cross-context behavioural or targeted advertising; show advertising; build marketing
          profiles; or use your records, files or AI requests to train AI models. We email you
          about your account and what you asked for. Product news — new features,
          announcements, offers — comes only if you said yes (the optional box when you sign up,
          or Settings → Account), every one has an unsubscribe link, and saying no changes
          nothing else about your account.
        </p>
      </LegalSection>

      <LegalSection
        id="ai"
        title="5. AI features and your data"
        summary="AI features send only what each request needs to Google’s AI, and only when you use them. Google can’t train on it, and voice recordings are never stored."
      >
        <p>
          {name} has three AI features. They run only when you use them. If you never use them,
          none of your data reaches an AI provider. You can always add transactions by typing,
          bulk paste or import, which stays entirely within the Service.
        </p>
        <LegalTable
          head={["Feature", "What is sent to the AI provider", "What we keep"]}
          rows={[
            [
              "AI entry",
              "The note you typed, your workspace’s category and tag names and currency, and today’s date.",
              "Nothing until you review and confirm the draft rows; then the transactions you saved.",
            ],
            [
              "Voice entry",
              "Your recording and the languages you set in Settings → Voice.",
              "Nothing. The audio is transcribed and discarded; the text goes into your note for you to check.",
            ],
            [
              "SpendChat AI",
              "Your question, earlier messages in that chat, your workspace’s currency, and a summary of records you can see in the current workspace — totals by category and period, and relevant transactions with their dates, amounts, types, categories, titles, notes, profile names and tags.",
              "The chat (questions and answers), private to you within that workspace, until you delete it, leave the workspace or delete your account.",
            ],
          ]}
        />
        <LegalList>
          <li>
            <Term>Provider.</Term> Our AI provider is currently Google, through the Gemini API.
            Requests travel from our servers through the Playxoft AI gateway
            (ai-proxy.playxoft.com), a service operated by {op} that routes each request to the
            provider from a supported region. The gateway is covered by this policy. It does not
            store what you send: it passes the request on and keeps only technical records of
            each call (such as its time, model, size and cost), with none of your content. If we add or change an AI provider, we
            will update the table in section 7 first.
          </li>
          <li>
            <Term>No training.</Term> We do not use your content to train AI models, and we use
            the provider’s paid commercial service, whose terms do not allow it to use your
            content to train or improve its models. The provider may keep request data for a
            limited period to detect abuse, as its terms permit.
          </li>
          <li>
            <Term>Only what you can see.</Term> SpendChat AI is given only records you could open
            yourself in that workspace, with the same access rules and the same exclusion of
            trashed items as the rest of the app. Other members — admins included — cannot read
            your chats.
          </li>
          <li>
            <Term>AI output can be wrong.</Term> Drafts and answers are generated by an AI system
            and are labelled as such. Check them before you rely on them.
          </li>
          <li>
            <Term>Test environments.</Term> On our development and beta environments, SpendChat AI
            answers from a built-in sample, and no request is sent to an AI provider.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection
        id="automated-decisions"
        title="6. Automated decisions"
        summary="A few billing rules run automatically — like whether you get a free trial. If you think one got it wrong, a person will take a look."
      >
        <p>
          We do not make decisions about you based solely on automated processing — including by
          AI — that produce legal effects concerning you or similarly significantly affect you.
          The AI features produce suggestions and answers for you to review; budget alerts are
          notifications based on limits you set.
        </p>
        <p>
          Some billing rules are applied automatically by our software, not by AI: whether a
          checkout includes a {TRIAL_DAYS}-day free trial (from the number of trials started with
          the same email address in the last 12 months, counted from a one-way hash of it);
          whether a workspace becomes view-only after a renewal payment finally fails or a
          payment is disputed, and whether a person whose payments have been disputed more than
          once can make further purchases (from the payment status our payment provider reports);
          and rate limits that pause requests made too quickly. These use your billing and
          usage records. If you think one of them got it wrong, write to <SupportEmail /> and a person
          will review it.
        </p>
      </LegalSection>

      <LegalSection
        id="sharing"
        title="7. Who we share it with"
        summary="We share data only with the companies that help run SpendChat (hosting, email, payments, AI) and with the people you choose. We never sell it."
      >
        <LegalSubsection title="Service providers">
          <p>
            These providers process personal data on our behalf, only on our instructions and
            under contracts that require them to protect it. None may use it for its own
            purposes. The country shown is where each is established; providers may also process
            data in other countries where they operate.
          </p>
          <LegalTable head={["Provider", "Purpose", "Personal data", "Location"]} rows={PROCESSORS} minWidth="44rem" />
        </LegalSubsection>
        <LegalSubsection title="Independent organisations">
          <LegalList>
            <li>
              <Term>Dodo Payments</Term> is the merchant of record for purchases. It receives your
              name, email address, billing address or country and payment details, and what you
              buy, and processes them as an independent controller under its own privacy policy
              — including for fraud prevention, tax and anti-money-laundering obligations.
            </li>
            <li>
              <Term>Google</Term>, when you choose “Continue with Google”, handles your Google
              account under its own privacy policy and shares your basic profile with us.
            </li>
            <li>
              <Term>The free tools</Term> at <In href="/tools">/tools</In> run in your browser:
              what you type into them stays on your device and is never sent to us. The currency
              converter fetches exchange rates straight from your browser — from Frankfurter
              (api.frankfurter.dev) and, if that fails, jsDelivr (cdn.jsdelivr.net). Like any web
              request, those carry your IP address and browser details, but never the amounts or
              currencies you enter; they handle requests under their own policies.
            </li>
          </LegalList>
        </LegalSubsection>
        <LegalSubsection title="Other users, because you chose to share">
          <LegalList>
            <li>
              <Term>Workspace members</Term> see the profiles they have access to and what those
              profiles contain, and your name, email address and picture as a member.
            </li>
            <li>
              <Term>Split groups</Term>: members see your name, the group’s expenses and your
              shares; the group’s creator also sees members’ email addresses.
            </li>
            <li>
              <Term>Share links</Term>: anyone holding a link you create can open that file,
              folder, invoice or quotation without signing in, until you revoke it.
            </li>
            <li>
              <Term>Your profile picture</Term> is served from a public address, so it can be shown
              to the people you work with.
            </li>
          </LegalList>
        </LegalSubsection>
        <LegalSubsection title="Legal reasons and business changes">
          <p>
            We may disclose personal data where we reasonably believe the law requires it — for
            example, in response to a valid court order or a lawful request from a public
            authority — or where needed to protect the rights, property or safety of our users,
            the public or us. Where the law allows, we will tell you first. If {op} is involved in
            a merger, acquisition or sale of assets, personal data may transfer to the new owner,
            who will be bound by this policy; we will tell you before that happens.
          </p>
        </LegalSubsection>
      </LegalSection>

      <LegalSection
        id="transfers"
        title="8. International transfers"
        summary="Some of those companies are in other countries, so we use legal safeguards to protect your data wherever it goes."
      >
        <p>
          We are based in India, and our service providers operate in the United States, India,
          the European Union and other countries. Your personal data may therefore be
          transferred to and processed in countries other than yours, whose laws may not
          protect it to the same standard. Where we do this, we protect it as follows:
        </p>
        <LegalList>
          <li>
            <Term>From the EU, EEA, UK and Switzerland:</Term> to a country with an adequacy
            decision, on that basis; otherwise under the European Commission’s Standard
            Contractual Clauses (with the UK Addendum or the Swiss amendments as needed), or the
            EU-US Data Privacy Framework and its UK and Swiss extensions where a US provider is
            certified under it — together with additional measures where needed. You can ask us
            for a copy of the relevant safeguards.
          </li>
          <li>
            <Term>From India:</Term> as permitted by section 16 of the DPDP Act — we do not
            transfer personal data to any country or territory the Central Government has
            restricted.
          </li>
          <li>
            <Term>From Australia:</Term> the overseas recipients described in section 7 are
            likely to be located in the United States, India and member states of the European
            Union, and in other countries where Cloudflare and Google operate. We take reasonable
            steps, including contractual commitments, to ensure they handle it consistently with
            the Australian Privacy Principles.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection
        id="retention"
        title="9. How long we keep it"
        summary="We keep your data while you have an account. Delete something and it’s gone (some things wait in the trash first); delete your account and we erase it, apart from the few records the law requires."
      >
        <p>
          We keep personal data only for as long as we need it for the purposes in section 4,
          then delete or anonymise it:
        </p>
        <LegalTable
          head={["Data", "How long"]}
          minWidth="30rem"
          rows={[
            ["Account details, About you answers and preferences", "While your account exists; deleted when you delete it."],
            [
              "Records, files and workspaces",
              `Until you (or the workspace’s owner or admins) delete them, or the account is deleted. Deleted transactions and profiles — and, on paid plans, files and folders — stay in the trash for ${TRASH_DAYS} days, then are permanently removed.`,
            ],
            [
              "Content you added to someone else’s workspace",
              "Stays with that workspace, which is theirs to keep, until they delete it.",
            ],
            ["SpendChat AI chats", "Until you delete the chat, leave or are removed from the workspace, or delete your account."],
            ["Voice recordings", "Not stored — discarded once transcribed."],
            ["AI usage counts", "About two months (they count your workspace’s monthly allowance), then deleted."],
            ["Server logs, email-sending and billing-request records", "Up to about 30 days."],
            ["Rate-limit counters", "A rolling window of up to one hour."],
            [
              "Billing records (plans, payments, invoice links)",
              "With the workspace, and for as long as tax and accounting law requires. Deleting your account removes your name from billing records of workspaces that remain.",
            ],
            [
              "Free-trial record",
              "A one-way hash of the email address that started a trial (never the address itself), with its date, for about 13 months — including after the account is deleted, so the trial limit can’t be reset by re-registering.",
            ],
            ["Split-group membership", "While the group exists. Leaving a group marks you as having left; balances stay correct for the others."],
            ["Support emails", "As long as needed to deal with your request, and for a reasonable period after in case it comes up again."],
            ["Backups", "Deleted data may remain in our database provider’s backups for a limited period until it is overwritten in the normal cycle."],
          ]}
        />
        <p>
          We may keep data longer where the law requires it, or where it is needed to establish,
          exercise or defend a legal claim, and only for that purpose.
        </p>
      </LegalSection>

      <LegalSection
        id="security"
        title="10. Security and breaches"
        summary="Your data is encrypted and locked down, and only you and the people you share with can see it. If something ever goes wrong, we’ll tell you."
      >
        <p>
          We use technical and organisational measures appropriate to the risk, including:
          encryption of data in transit, and at rest by our database and storage providers; every
          query scoped to what your account is allowed to see; validation of all input; strict
          security headers; files served only through signed links that expire within minutes;
          session tokens held in httpOnly cookies that scripts cannot read; per-person rate
          limits; and access to production systems restricted to the people who need it. Our code
          is public, so these measures can be inspected. No system is perfectly secure, and you
          should protect your own sign-in credentials.
        </p>
        <p>
          If a personal data breach occurs, we will notify the authorities and the people
          affected as the law requires — including, where applicable, the competent EU or UK
          supervisory authority within 72 hours, the Data Protection Board of India and CERT-In,
          and the Office of the Australian Information Commissioner under the Notifiable Data
          Breaches scheme — and tell you what happened and what you can do.
        </p>
      </LegalSection>

      <LegalSection
        id="your-rights"
        title="11. Your rights"
        summary="You can see, download, fix or delete your data anytime — most of it right in Settings. Email us for anything else."
      >
        <p>
          Depending on where you live, you have some or all of these rights over your personal
          data. We extend the core rights to everyone, wherever they live:
        </p>
        <LegalList>
          <li><Term>Access and portability</Term> — get a copy of your personal data, in a portable format. Every transaction can be downloaded as CSV from the transactions view, and files from the vault; for anything else, write to us.</li>
          <li><Term>Correction</Term> — edit your name, picture and records directly in the app, or ask us.</li>
          <li><Term>Deletion</Term> — delete your account yourself in Settings → Account. That removes your transactions, the workspaces you own and everything in them (files included), your memberships, chats and settings. Content you added to a workspace someone else owns stays with that workspace. If your sign-in is too old for our authentication provider to delete your credential in the same step, write to us and we will remove it.</li>
          <li><Term>Objection and restriction</Term> — object to processing based on legitimate interests, or ask us to restrict processing while a concern is resolved.</li>
          <li><Term>Withdrawing consent</Term> — change your analytics choice at any time on the <In href="/cookie-policy">Cookie Policy</In> page; withdraw consent to processing for the Service by deleting your account. Withdrawal doesn’t affect processing that already took place.</li>
          <li><Term>Human review</Term> — ask a person to review any automated billing decision (section 6).</li>
          <li><Term>Complaint</Term> — complain to us, and to your data-protection authority (see the region sections below).</li>
        </LegalList>
        <p>
          <Term>How to make a request.</Term> Email <SupportEmail /> from your account’s email
          address. To protect your data, we may need to confirm your identity — usually by a
          reply from that address — before acting. An authorised agent may make a request for
          you with your signed permission; we may ask you to confirm it directly. We do not
          charge a fee unless a request is manifestly unfounded or excessive. We answer within
          the time the law that applies to you sets — at most one month under the GDPR (which may
          be extended by two months for complex requests), 45 days under US state laws (extendable
          once by 45 days), and 30 days in Australia — and will tell you if we need longer and why.
          We will not treat you differently for exercising your rights.
        </p>
      </LegalSection>

      <LegalSection
        id="eu-uk"
        title="12. EU, EEA, UK and Switzerland"
        summary="In Europe, the UK or Switzerland? You have GDPR rights, and you can complain to your local data-protection authority."
      >
        <LegalList>
          <li>Our legal bases are set out in section 4, and our transfer safeguards in section 8.</li>
          <li>You have the rights in Articles 15 to 22 of the GDPR (and the equivalents in the UK GDPR and the Swiss Federal Act on Data Protection): access, rectification, erasure, restriction, data portability, objection, and not to be subject to solely automated decisions with legal or similarly significant effects.</li>
          <li>
            You can complain to the data-protection authority where you live or work, or where
            you believe an infringement took place — in the EU,{" "}
            <Ext href="https://www.edpb.europa.eu/about-edpb/about-edpb/members_en">your national authority</Ext>;
            in the UK, the <Ext href="https://ico.org.uk/make-a-complaint/">Information Commissioner’s Office</Ext>;
            in Switzerland, the <Ext href="https://www.edoeb.admin.ch/">FDPIC</Ext>. We would
            appreciate the chance to address your concern first.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection
        id="india"
        title="13. India"
        summary="In India? You have rights under the DPDP Act, and our Grievance Officer is here to help with any complaint."
      >
        <LegalList>
          <li>
            <Term>Notice and consent.</Term> Sections 3 and 4 itemise the personal data we
            process and the purpose of each, and the features each one enables. When you tick the
            box at sign-up, you give your free, specific, informed and unambiguous consent to
            processing the personal data described in this policy for those purposes, limited to
            what is necessary for them. Some processing also rests on the “legitimate uses” in
            section 7 of the DPDP Act — for example, data you provide voluntarily for a specific
            purpose, and compliance with law.
          </li>
          <li>
            <Term>Withdrawing consent.</Term> You can withdraw consent as easily as you gave it: by
            deleting your account in Settings → Account, or by writing to us. We, and our
            processors, will then stop processing your personal data unless the law requires or
            permits us to keep it. Withdrawing doesn’t affect processing already done, and it means
            we can no longer provide the Service to you.
          </li>
          <li>
            <Term>Your rights</Term> as a Data Principal: to obtain a summary of your personal
            data and of the processing, and the identities of those we have shared it with
            (section 11 of the DPDP Act); to correct, complete, update and erase it (section 12);
            to have your grievances redressed (section 13); and to nominate another person to
            exercise your rights if you die or become incapable (section 14). Write to us to
            exercise any of them.
          </li>
          <li>
            <Term>Grievance Officer.</Term> Our Grievance Officer is <GrievanceOfficer />. We
            acknowledge a grievance within 24 hours and aim to resolve it within 15 days, and in
            any case within the period prescribed by the DPDP Rules, 2025. If you are not
            satisfied with our response, you may complain to the Data Protection Board of India
            once you have used this process.
          </li>
          <li>
            <Term>Language.</Term> This notice is in English. If you would like it in any language
            listed in the Eighth Schedule to the Constitution of India, write to us.
          </li>
          <li>
            <Term>Sensitive personal data.</Term> We do not collect passwords (they are held by
            Google), card details, or health, biometric or similar “sensitive personal data or
            information” under the Information Technology (Reasonable Security Practices and
            Procedures and Sensitive Personal Data or Information) Rules, 2011. The one kind the
            Service can hold is bank account details you choose to add to an invoice seller; we
            use them only to print them on your own invoices and quotations, with the consent you
            give by entering them, and you can remove them at any time.
          </li>
          <li>
            <Term>Children (under {ADULT_AGE}).</Term> The DPDP Act treats everyone under{" "}
            {ADULT_AGE} as a child. Until its rules on a parent’s or guardian’s consent take effect,
            people aged {MIN_AGE} to {ADULT_AGE - 1} use the Service with their parent’s or
            guardian’s permission, as section 17 explains. When those rules apply, we will ask for
            a parent’s or guardian’s verifiable consent in the way they set out. We never track,
            monitor the behaviour of, or target advertising at children.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection
        id="united-states"
        title="14. United States"
        summary="In the US? We don’t sell your data or share it for ads, we respect Global Privacy Control, and you can use your state’s privacy rights."
      >
        <LegalSubsection title="Notice at collection (California and other states)">
          <p>
            In the last 12 months we have collected the following categories of personal
            information, from the sources in section 3, for the purposes in section 4, and
            disclosed each for a business purpose only to the service providers and contractors in
            section 7. We keep each for the periods in section 9.
          </p>
          <LegalTable
            head={["Category (CCPA)", "Examples"]}
            minWidth="30rem"
            rows={[
              ["Identifiers", "Name, email address, internal account ids, IP address"],
              ["Customer records (Cal. Civ. Code § 1798.80(e))", "Name, email address, billing country, bank details you print on your invoices"],
              ["Commercial information", "Plans and top-ups bought; the income and expense records you choose to log"],
              ["Internet or other electronic network activity", "Request logs, error logs; website analytics only with your consent"],
              ["Geolocation data", "Country only, derived from IP address — never precise location"],
              ["Audio information", "Voice-entry recordings, transcribed and discarded, never stored"],
              ["Professional or employment-related information", "Business details you put on invoices and quotations; if you tell us, which best describes you (for example student or freelancer) and your team size"],
              ["Sensitive personal information", "Account log-in (email address and password, held by Google), used only to sign you in"],
            ]}
          />
          <p>
            We do not sell personal information or share it for cross-context behavioural
            advertising, and have not done so in the last 12 months; we have no actual knowledge
            of selling or sharing the personal information of anyone under 16. We use sensitive
            personal information only for the purposes the CCPA permits without a right to limit.
            We do not use or disclose personal information for profiling that produces legal or
            similarly significant effects.
          </p>
        </LegalSubsection>
        <LegalSubsection title="Your rights">
          <p>
            Residents of California and of other states with comprehensive privacy laws —
            including Colorado, Connecticut, Delaware, Indiana, Iowa, Kentucky, Maryland,
            Minnesota, Montana, Nebraska, New Hampshire, New Jersey, Oregon, Rhode Island,
            Tennessee, Texas, Utah and Virginia — have, as their law provides, the rights to know
            and access, to correct, to delete, to data portability, to opt out of the sale or
            sharing of personal information, targeted advertising and significant profiling, to
            limit the use of sensitive personal information, and not to be discriminated against
            for exercising them. Make a request as described in section 11.
          </p>
          <p>
            <Term>Opt-out signals.</Term> We treat a Global Privacy Control signal from your
            browser as a valid request to opt out: analytics cookies stay off, and the website
            does not ask. We do not otherwise respond to “Do Not Track”, which has no agreed
            meaning.
          </p>
          <p>
            <Term>Appeals.</Term> If we decline your request, you may appeal by replying to our
            decision with “Appeal” in the subject line. We will respond in writing within 45 days
            (or the period your state’s law sets), explaining our reasons. If your appeal is
            denied, you may contact your state Attorney General.
          </p>
          <p>
            <Term>California “Shine the Light”.</Term> We do not disclose personal information to
            third parties for their own direct-marketing purposes. <Term>Nevada:</Term> we do not
            sell covered information.
          </p>
        </LegalSubsection>
      </LegalSection>

      <LegalSection
        id="australia"
        title="15. Australia"
        summary="In Australia? We follow the Australian Privacy Principles, and you can complain to the OAIC if we don’t sort things out."
      >
        <LegalList>
          <li>We handle personal information in line with the Australian Privacy Principles (APPs). This policy is our APP privacy policy and our collection notice under APP 5.</li>
          <li><Term>Pseudonymity.</Term> You may use the Service under a pseudonym as your display name. We need an email address to provide an account.</li>
          <li><Term>Overseas disclosure.</Term> See section 8 for the countries where recipients are likely to be located.</li>
          <li><Term>Access and correction.</Term> You may ask to access or correct the personal information we hold about you (APPs 12 and 13). We respond within 30 days and will explain in writing if we refuse.</li>
          <li><Term>Automated decisions.</Term> Section 6 describes the kinds of decisions our software makes automatically and the personal information they use, as APPs 1.7 to 1.9 require.</li>
          <li>
            <Term>Complaints.</Term> Write to us first; we will respond within 30 days. If you are
            not satisfied, you may complain to the{" "}
            <Ext href="https://www.oaic.gov.au/privacy/privacy-complaints">Office of the Australian Information Commissioner</Ext>{" "}
            (phone 1300 363 992).
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection
        id="other-regions"
        title="16. Other countries"
        summary="Wherever you live, you can use the privacy rights your local law gives you — just email us."
      >
        <p>
          Wherever you live, you can exercise the rights your local law gives you by writing to
          us, and complain to your local regulator — for example, in Canada, the Office of the
          Privacy Commissioner of Canada (or, in Québec, the Commission d’accès à l’information);
          in Brazil, the ANPD under the LGPD; in New Zealand, the Office of the Privacy
          Commissioner; in Singapore, the Personal Data Protection Commission; in Japan, the
          Personal Information Protection Commission; and in South Africa, the Information
          Regulator. For the purposes of those laws, the contact in section 19 is the person
          responsible for our compliance with them, including as the officer in charge of the
          protection of personal information under Québec law and as our data protection officer
          (encarregado) under the LGPD.
        </p>
      </LegalSection>

      <LegalSection
        id="children"
        title="17. Children and teens"
        summary={`${name} is for people ${MIN_AGE} and older. Teens can use it with a parent’s or guardian’s OK, and parents can ask us to see or delete their teen’s data.`}
      >
        <LegalList>
          <li>
            <Term>Under {MIN_AGE}.</Term> {name} is not for children under {MIN_AGE}, and we
            don’t knowingly collect their personal data. Everyone confirms they are {MIN_AGE} or
            older when they accept these terms, and if we learn that an account belongs to someone
            under {MIN_AGE}, we delete it and its data. If you think a child under{" "}
            {MIN_AGE} has given us personal data, write to <SupportEmail /> and we will delete it.
          </li>
          <li>
            <Term>Teens ({MIN_AGE} to {ADULT_AGE - 1}).</Term> Teens can use {name} with their
            parent’s or guardian’s permission (section 2 of our{" "}
            <In href="/terms">Terms of Service</In>). We handle a teen’s personal data exactly as
            this policy describes for everyone, and only to provide the Service: there are no ads
            and no selling of data, analytics never run inside the app, and we never use a teen’s
            data for profiling or targeted advertising. If you’re under {ADULT_AGE}, only say yes
            to product news emails with your parent’s or guardian’s OK.
          </li>
          <li>
            <Term>Parents and guardians</Term> can write to <SupportEmail /> to ask what we hold
            about their teen, to correct it, or to have the account and its data deleted. We may
            ask for reasonable proof that you are the parent or guardian.
          </li>
          <li>
            <Term>Changes in the law.</Term> Where a law requires a parent’s or guardian’s consent
            to be verified — such as India’s DPDP Act when its rules on children take effect — we
            will ask whether you are under {ADULT_AGE} and, if you are, for your parent’s or
            guardian’s consent in the way that law sets out, before a teen’s account can continue.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection
        id="changes"
        title="18. Changes to this policy"
        summary="If we change this policy in a big way, we’ll tell you first, and ask you to agree in the app when the law requires it."
      >
        <p>
          We update this policy when the Service or the law changes, and change the “Last updated”
          date above. For a material change — such as a new purpose, a new kind of recipient or a
          new kind of data — we will tell you in advance by email or in the app, and where the law
          requires your consent or agreement we will ask for it in the app before the change
          applies to you. Because {name} is open source, the full history of every edit to this
          page is public.
        </p>
      </LegalSection>

      <LegalSection
        id="contact"
        title="19. Contact and complaints"
        summary="Questions or worries about your data? Email us — we’re happy to help."
      >
        <p>
          {op} is responsible for your personal data in the Service. For questions about this
          policy, requests about your data, or complaints, write to <SupportEmail />. Grievances
          under Indian law can go straight to our Grievance Officer, <GrievanceOfficer />. We aim to acknowledge every message
          promptly and to resolve it within the times set out above.
        </p>
      </LegalSection>
    </LegalPage>
  );
}

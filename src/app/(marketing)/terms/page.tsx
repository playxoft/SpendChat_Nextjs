import { createMetadata } from "@/lib/seo";
import { siteConfig } from "@/lib/site";
import { ADULT_AGE, LEGAL_UPDATED, MIN_AGE } from "@/lib/legal";
import { PLAN_NAMES, TRASH_DAYS } from "@/lib/plans";
import {
  Ext,
  GrievanceOfficer,
  In,
  LegalList,
  LegalPage,
  LegalSection,
  LegalSubsection,
  SupportEmail,
  Term,
} from "@/components/legal/legal-page";

export const metadata = createMetadata({
  title: "Terms of Service",
  description: `The terms for using ${siteConfig.name}: your account, your data, AI features, paid plans, acceptable use, liability and your consumer rights.`,
  path: "/terms",
});

/**
 * The Terms of Service. Written to hold up under the consumer and contract law
 * of the places SpendChat is used most (India, the EU/EEA and UK, the US and
 * Australia) — so it never takes away a right those laws give a consumer, and
 * says so. Statements of fact about the product must match the code, like the
 * Privacy Policy's. A material change moves `LEGAL_VERSION` (`src/lib/legal.ts`),
 * which asks every signed-in person to accept again.
 */
const name = siteConfig.name;
const op = siteConfig.author;
const paid = `${PLAN_NAMES.plus} and ${PLAN_NAMES.pro}`;

const TOC = [
  { id: "about", title: "About these Terms" },
  { id: "eligibility", title: "Who can use the Service" },
  { id: "account", title: "Your account" },
  { id: "what-it-is", title: "What SpendChat is — and isn’t" },
  { id: "workspaces", title: "Workspaces, members and sharing" },
  { id: "content", title: "Your content" },
  { id: "other-people", title: "Other people’s personal data" },
  { id: "processing", title: "Data processing terms (business use)" },
  { id: "ai", title: "AI features" },
  { id: "acceptable-use", title: "Acceptable use" },
  { id: "reporting", title: "Reporting illegal content" },
  { id: "open-source", title: "Open source and self-hosting" },
  { id: "plans", title: "Plans, payments and trials" },
  { id: "consumer-rights", title: "Your statutory consumer rights" },
  { id: "changes-to-service", title: "Changes to the Service" },
  { id: "third-parties", title: "Third-party services" },
  { id: "ip", title: "Intellectual property" },
  { id: "termination", title: "Suspension and termination" },
  { id: "disclaimers", title: "Disclaimers" },
  { id: "liability", title: "Limitation of liability" },
  { id: "indemnity", title: "Indemnity" },
  { id: "changes", title: "Changes to these Terms" },
  { id: "disputes", title: "Governing law and disputes" },
  { id: "general", title: "General" },
  { id: "contact", title: "Contact and grievances" },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated={LEGAL_UPDATED}
      toc={TOC}
      inShort
      intro={
        <>
          <p>
            These Terms of Service (the “<Term>Terms</Term>”) are a legally binding agreement
            between you and {op} (“<Term>{op}</Term>”, “we”, “us” or “our”), the operator of{" "}
            {name}. Please read them carefully. Section 14 explains rights you have as a
            consumer that these Terms do not take away.
          </p>
        </>
      }
    >
      <LegalSection
        id="about"
        title="1. About these Terms"
        summary="These are the rules for using SpendChat, and you agree to them by ticking the box. Any rights the law gives you as a consumer always come first."
      >
        <p>
          <Term>1.1 The Service.</Term> These Terms govern your access to and use of the {name}{" "}
          website at {siteConfig.domain}, the {name} web application, our mobile applications,
          the {name} application programming interface (API) and the free tools at{" "}
          <In href="/tools">/tools</In> (together, the “<Term>Service</Term>”).
        </p>
        <p>
          <Term>1.2 Acceptance.</Term> You accept these Terms by ticking the box confirming that
          you agree to them when you create an account or when we ask you to accept an updated
          version, or — for parts of the Service that need no account, such as the free tools —
          by using them. If you do not agree, you must not use the Service.
        </p>
        <p>
          <Term>1.3 Documents that form part of these Terms.</Term> Our{" "}
          <In href="/billing-policy">Billing &amp; refund policy</In> forms part of these Terms
          and governs paid plans, trials, renewals, cancellations and refunds. Our{" "}
          <In href="/privacy">Privacy Policy</In> and <In href="/cookie-policy">Cookie Policy</In>{" "}
          explain how we handle personal data; they are notices to you, and the commitments we
          make in them bind us. If these Terms and the Billing &amp; refund policy conflict on a
          billing matter, the Billing &amp; refund policy prevails; otherwise these Terms prevail.
        </p>
        <p>
          <Term>1.4 Mandatory law prevails.</Term> Nothing in these Terms excludes, restricts or
          modifies any right or remedy, or any guarantee, warranty or other term or condition,
          implied or imposed by law that cannot lawfully be excluded or limited — including under
          the Australian Consumer Law, the consumer protection laws of the European Union, its
          member states and the United Kingdom, India’s Consumer Protection Act, 2019, and New
          Zealand’s Consumer Guarantees Act 1993 (your “<Term>Mandatory Rights</Term>”). Where a
          provision of these Terms would do so, it applies only to the extent the law allows.
        </p>
      </LegalSection>

      <LegalSection
        id="eligibility"
        title="2. Who can use the Service"
        summary={`You need to be ${MIN_AGE} or older. Under ${ADULT_AGE}? You need a parent’s or guardian’s OK to use SpendChat, and to buy anything in it.`}
      >
        <p>
          <Term>2.1 Minimum age.</Term> You must be at least {MIN_AGE} years old to create an
          account or use the Service, and you confirm that you are when you accept these Terms.
          If we learn that an account belongs to someone under {MIN_AGE}, we will close it and
          delete its data.
        </p>
        <p>
          <Term>2.2 If you are under {ADULT_AGE}.</Term> If you are under {ADULT_AGE} — or under
          the age of majority where you live, if that is higher — you may use the Service only
          with the permission of your parent or legal guardian, and that permission must cover
          anything you buy. By allowing you to use the Service, your parent or guardian agrees
          to these Terms on your behalf and is responsible for your use of the Service,
          including any payment. Where the law requires a parent’s or guardian’s consent to be
          verified — as India’s Digital Personal Data Protection Act, 2023 will — we will ask
          whether you are under {ADULT_AGE} and, if you are, for that consent in the way the law
          sets out, and an account may need it to continue.
        </p>
        <p>
          <Term>2.3 Lawful use.</Term> You must not use the Service if you are prohibited from
          doing so by the laws that apply to you, including economic sanctions laws.
        </p>
        <p>
          <Term>2.4 Using the Service for an organisation.</Term> If you use the Service on
          behalf of a company, firm or other organisation, you confirm that you are authorised to
          accept these Terms on its behalf, and “you” includes that organisation. An organisation
          or a person acting for the purposes of their trade, business, craft or profession is a
          “<Term>business user</Term>”; provisions stated to apply only to consumers do not apply
          to business users.
        </p>
      </LegalSection>

      <LegalSection
        id="account"
        title="3. Your account"
        summary="Sign in with Google or your email. Keep your login to yourself, and tell us quickly if you think someone else got in."
      >
        <LegalList>
          <li>
            You may sign in with Google or with an email address and password. Sign-in is
            provided by Google’s Firebase Authentication; your Google account remains subject to
            Google’s own terms. We may require you to verify your email address before you can
            use the Service.
          </li>
          <li>
            You must give accurate information, keep it up to date, and keep your sign-in
            credentials confidential. An account is for one person; do not share it.
          </li>
          <li>
            You are responsible for activity under your account, except to the extent it results
            from our failure to take reasonable security measures. Tell us promptly at{" "}
            <SupportEmail /> if you believe your account has been accessed without your
            permission.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection
        id="what-it-is"
        title="4. What SpendChat is — and isn’t"
        summary="SpendChat is a notebook for your money. It isn’t a bank, it never moves money, and nothing in it is advice — so double-check numbers before you rely on them."
      >
        <p>
          <Term>4.1 A record-keeping tool.</Term> {name} lets you record, organise and review
          income and expenses that you enter yourself, and provides related features such as
          workspaces shared with others, budgets and alerts, split bills, invoices and
          quotations, a file vault, analytics, and AI-assisted entry and question answering.
        </p>
        <p>
          <Term>4.2 Not advice.</Term> Nothing in the Service — including AI output, analytics,
          insights, projections, budgets, calculators and free tools — is financial, investment,
          tax, accounting, legal or other professional advice, or a recommendation to take or
          avoid any action. You are solely responsible for decisions you make, and you should
          consult a suitably qualified professional before making financial decisions.
        </p>
        <p>
          <Term>4.3 Not a financial institution.</Term> {op} is not a bank, payment service
          provider, money transmitter, lender, credit reporting body, investment adviser or tax
          agent. The Service does not connect to your bank or card accounts, does not hold, move
          or pay money, and does not make payments on your behalf. Recording in Split bills that
          someone owes money, or marking an invoice as paid, is a note for your own records: it
          does not create, transfer, collect or settle any debt.
        </p>
        <p>
          <Term>4.4 Accuracy.</Term> Figures in the Service are only as accurate as the
          information you and your workspace members enter. Exchange rates, inflation figures and
          other calculations in the free tools are indicative and may be out of date.
        </p>
        <p>
          <Term>4.5 Invoices and quotations.</Term> You are responsible for the content of every
          invoice and quotation you create, and for complying with the invoicing, tax (including
          GST, VAT and sales tax) and record-keeping laws that apply to you. We do not verify tax
          registrations, calculate tax you owe, or file returns.
        </p>
      </LegalSection>

      <LegalSection
        id="workspaces"
        title="5. Workspaces, members and sharing"
        summary="Workspace admins decide who’s in and what each person can see. Anyone with a share link can open what it points to, so share links with care."
      >
        <LegalList>
          <li>
            <Term>Workspaces.</Term> Records are kept in workspaces. Each workspace has an owner,
            who is always one of its admins. Admins decide who is a member, what each member can
            see and change (as a viewer, editor or admin), and which plan the workspace has.
          </li>
          <li>
            <Term>Shared content.</Term> Content added to a workspace stays with that workspace.
            If you leave a workspace or are removed from it, what you added to it remains there
            under the control of its owner and admins, except your private SpendChat AI chats,
            which are deleted when you leave or are removed. If an owner deletes a workspace,
            everything in it is deleted.
          </li>
          <li>
            <Term>Share links.</Term> If you create a share link for a file, folder, invoice or
            quotation, anyone who has the link can open it without signing in until you revoke
            it. You are responsible for who you give it to.
          </li>
          <li>
            <Term>Split bills.</Term> Members of a split group can see its expenses, shares and
            balances. Balances are calculated from what members enter and are for information
            only (see section 4.3).
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection
        id="content"
        title="6. Your content"
        summary="What you put in SpendChat is yours. We use it only to run SpendChat for you — never to sell, for ads, or to train AI. Keep your own copy of anything important."
      >
        <p>
          <Term>6.1 What it is.</Term> “<Term>Your Content</Term>” means the data, text, files,
          images, voice recordings and other material that you or your workspace members submit
          to the Service, including transactions, notes, attachments, invoices, client details,
          and questions asked of SpendChat AI, together with the output the Service generates
          from them for you.
        </p>
        <p>
          <Term>6.2 You own it.</Term> As between you and us, you (or the owner of the workspace
          it is in) keep all rights in Your Content. We claim no ownership of it.
        </p>
        <p>
          <Term>6.3 The permission you give us.</Term> You grant {op} a worldwide,
          non-exclusive, royalty-free licence to host, store, copy, transmit, process and display
          Your Content only as needed to provide, secure, maintain and support the Service for
          you and the people you share it with, in accordance with your instructions and our
          Privacy Policy — including by passing it to the service providers listed there (for
          example, our AI provider when you use an AI feature). The licence ends when Your
          Content is deleted from the Service, except for copies we are required by law to keep
          and copies in backups, which are deleted in their normal cycle.
        </p>
        <p>
          <Term>6.4 What we don’t do with it.</Term> We do not sell Your Content, use it for
          advertising, or use it to train or improve artificial intelligence models, whether our
          own or anyone else’s.
        </p>
        <p>
          <Term>6.5 Your responsibility.</Term> You are responsible for Your Content and confirm
          that you have the rights needed to submit it and to let us use it as described here.
          Do not store payment card numbers, bank account credentials, passwords or government
          identity numbers in notes or files; the Service is not designed to hold them.
        </p>
        <p>
          <Term>6.6 Keeping copies.</Term> We take reasonable care to protect and back up the
          Service, but no service is free of risk. You can export your transactions as CSV and
          download your files at any time, and we recommend keeping your own copies of records
          that matter to you. Deleted transactions and profiles — and, on paid plans, files and
          folders — stay in the trash for {TRASH_DAYS} days and are then permanently removed.
        </p>
      </LegalSection>

      <LegalSection
        id="other-people"
        title="7. Other people’s personal data"
        summary="Only add someone else’s details if you’re allowed to. If you use SpendChat for a business, you decide how your clients’ data is used, and we follow your lead."
      >
        <p>
          <Term>7.1 Your promise.</Term> When you give us personal data about someone else — for
          example an email address to invite them to a workspace or a split group, a name or
          email address in a split group, a client’s details on an invoice or quotation, or
          information about a person in a note or file — you confirm that you are permitted by
          the law that applies to you to share it with us for that purpose, that you have given
          them any notice the law requires, and that it is accurate.
        </p>
        <p>
          <Term>7.2 Invitations.</Term> When you invite someone, we email them on your
          instruction. Split-group invitations are emailed only to people without an account,
          at most once per group per address. Invite only people who would expect to hear from
          you; do not use invitations to send unsolicited messages.
        </p>
        <p>
          <Term>7.3 Where we act for you.</Term> For personal data in Your Content about other
          people (such as your clients, or members of a workspace you run for an organisation),
          you decide why and how it is processed: you are its controller (or data fiduciary), and
          we process it on your behalf as your processor (or data processor). If you are a
          business user, section 8 applies to that processing. If you are a consumer using the
          Service for purely personal or household purposes, data-protection law generally does
          not treat you as a controller, but section 7.1 still applies.
        </p>
      </LegalSection>

      <LegalSection
        id="processing"
        title="8. Data processing terms (business use)"
        summary="For business users: our formal promise about how we handle your customers’ data for you, as data-protection laws require."
      >
        <p>
          This section applies where you are a business user and we process personal data in
          Your Content on your behalf (section 7.3). It is intended to satisfy Article 28(3) of
          the EU and UK General Data Protection Regulation and equivalent requirements of other
          data-protection laws. We will:
        </p>
        <LegalList>
          <li>
            process that personal data only on your documented instructions — which are these
            Terms and the actions you take in the Service — unless the law requires otherwise,
            in which case we will tell you before processing unless the law forbids it;
          </li>
          <li>
            ensure that anyone we authorise to process it is bound by confidentiality;
          </li>
          <li>
            implement appropriate technical and organisational security measures, as described
            in the Privacy Policy;
          </li>
          <li>
            use only the sub-processors listed in the Privacy Policy, which you authorise
            generally; we will update that list before adding or replacing one, and if you
            object on reasonable data-protection grounds you may stop using the affected feature
            or end these Terms;
          </li>
          <li>
            impose on each sub-processor data-protection obligations that are no less protective
            than these, and remain responsible to you for their performance;
          </li>
          <li>
            help you, taking into account the nature of the processing, to respond to requests
            from individuals exercising their rights (the Service’s export, edit and delete
            features are the primary means), and to meet your obligations on security, breach
            notification and data-protection impact assessments;
          </li>
          <li>
            notify you without undue delay after becoming aware of a personal data breach
            affecting that personal data;
          </li>
          <li>
            delete that personal data when you delete it or your account, or when these Terms
            end, unless the law requires us to keep it — you can export it beforehand; and
          </li>
          <li>
            make available the information reasonably necessary to demonstrate compliance with
            this section, and contribute to audits by answering your reasonable written
            questions and, where that is not sufficient, as otherwise required by law.
          </li>
        </LegalList>
        <p>
          The subject matter, nature and purpose of the processing are providing the Service;
          its duration is the term of these Terms; the personal data and data subjects are those
          you choose to include in Your Content (typically your clients, workspace members and
          people in your split groups). To the extent your use of the Service involves a
          transfer of personal data to us that is restricted under the EU GDPR, the UK GDPR or
          Swiss law, the Standard Contractual Clauses adopted by the European Commission in
          Decision (EU) 2021/914 (Module Two, or Module Three where you are a processor) and,
          for the UK, the International Data Transfer Addendum, are incorporated into these Terms
          by reference, with the annex details taken from these Terms and the Privacy Policy and
          the laws and courts of Ireland chosen for the Clauses.
        </p>
      </LegalSection>

      <LegalSection
        id="ai"
        title="9. AI features"
        summary="AI features save you typing, but they can get things wrong — check before you save. AI only runs when you use it, and your data never trains AI."
      >
        <p>
          <Term>9.1 What they are.</Term> AI entry turns a note you type into draft transactions;
          voice entry transcribes what you say into a note; and SpendChat AI answers questions
          about the money in your workspace. They use artificial intelligence models provided
          by third parties.
        </p>
        <p>
          <Term>9.2 You are dealing with AI.</Term> Drafts from AI and voice entry and answers
          from SpendChat AI are generated by an AI system, not written by a person, and are
          labelled in the Service as AI features.
        </p>
        <p>
          <Term>9.3 Check the output.</Term> AI output can be inaccurate, incomplete or out of
          date. It may misread amounts, dates, names or categories, mishear speech, or state
          totals that are wrong. Review every draft before you confirm it — nothing from AI or
          voice entry is saved until you do — and check any answer against your records before
          relying on it. Section 4.2 (not advice) applies to all AI output.
        </p>
        <p>
          <Term>9.4 Your data.</Term> When you use an AI feature, the content needed for that
          request is sent to our AI provider, as the Privacy Policy describes. We do not use it
          to train AI models, and we use our providers’ commercial services under terms that do
          not allow them to use it to train or improve their models. AI features run only when
          you use them.
        </p>
        <p>
          <Term>9.5 Allowances and fair use.</Term> AI features are limited to the monthly
          allowance of AI actions included in the workspace’s plan, plus any top-ups, and to the
          rate limits that protect the Service. We may suspend AI features for an account that
          uses them in a way that is abusive or that threatens the stability of the Service.
        </p>
        <p>
          <Term>9.6 Using AI responsibly.</Term> You must not use AI features to produce
          unlawful, harmful or deceptive content, to try to extract our instructions to the
          model or to bypass its safeguards, or to process information unrelated to managing
          your money. Leave out sensitive details you do not need — such as health information
          or identity numbers. Do not record other people with voice entry without their
          consent where the law requires it.
        </p>
        <p>
          <Term>9.7 No automated decisions about you.</Term> AI features produce suggestions and
          answers for you to review. They do not make decisions about you that have legal or
          similarly significant effects.
        </p>
      </LegalSection>

      <LegalSection
        id="acceptable-use"
        title="10. Acceptable use"
        summary="Use SpendChat fairly and legally: nothing illegal or harmful, no getting into other people’s data, and no trying to break or overload the service."
      >
        <p>You must not, and must not help or allow anyone else to:</p>
        <LegalList>
          <li>use the Service in breach of any law, or to facilitate fraud, money laundering, terrorist financing, sanctions evasion, tax evasion or any other crime;</li>
          <li>
            host, upload, store, share or transmit any information that: belongs to another
            person and to which you have no right; is obscene, pornographic, paedophilic,
            invasive of another person’s privacy (including bodily privacy), insulting or
            harassing on the basis of gender, racially or ethnically objectionable, or that
            relates to or encourages money laundering or gambling; is harmful to children;
            infringes any patent, trademark, copyright or other proprietary right; deceives or
            misleads anyone about its origin, or knowingly communicates misinformation or
            information that is patently false and intended to mislead or harass for financial
            gain or to cause injury; impersonates another person; threatens the unity,
            integrity, defence, security or sovereignty of India or any other nation, friendly
            relations between states or public order, incites the commission of an offence, or
            prevents the investigation of one; contains malware or other code designed to
            interrupt, destroy or limit the functionality of any computer resource; or
            otherwise violates any law in force;
          </li>
          <li>access, or attempt to access, another person’s account or data without their permission, or any part of the Service you are not authorised to use;</li>
          <li>
            probe, scan or test the vulnerability of the Service, except under our security
            policy (see{" "}
            <Ext href={`${siteConfig.links.github}/blob/master/SECURITY.md`}>SECURITY.md</Ext>)
            and without accessing other people’s data or degrading the Service;
          </li>
          <li>interfere with or disrupt the Service, or place an unreasonable load on it;</li>
          <li>
            circumvent plan limits, AI allowances, rate limits, trial limits (for example, by
            creating accounts or workspaces to obtain further trials) or payment;
          </li>
          <li>access the Service by automated means other than the documented API within its limits, or scrape it;</li>
          <li>use invitations, share links or emails sent through the Service for spam or unsolicited messages;</li>
          <li>resell, sublicense or offer the hosted Service to others as a service without our written permission (this does not limit your rights under the open-source licence — see section 12); or</li>
          <li>misrepresent your identity or your affiliation with any person.</li>
        </LegalList>
        <p>
          We may remove or disable access to content that breaches this section, and suspend or
          end accounts under section 18.
        </p>
      </LegalSection>

      <LegalSection
        id="reporting"
        title="11. Reporting illegal content"
        summary="Seen something illegal or harmful in SpendChat? Email us and we’ll look into it."
      >
        <p>
          If you believe content available through the Service — for example through a share
          link — is illegal or breaches these Terms, email <SupportEmail /> with: the link or
          other precise location of the content; why you believe it is illegal or in breach;
          your name and email address (unless you are reporting certain offences involving
          children, where you may stay anonymous); and a statement that you believe in good
          faith that the information in your report is accurate and complete. We will review
          reports diligently and objectively, and tell you what we decided.
        </p>
        <p>
          If we restrict your content or your account, we will tell you what we restricted and
          why, unless the law prevents us or the content is deceptive high-volume commercial
          content. You can ask us to review the decision by replying to that message, and you
          keep any right you have to challenge it before a court or an out-of-court dispute
          settlement body. This address is also our single point of contact for authorities in
          the European Union and elsewhere; we can be contacted in English.
        </p>
      </LegalSection>

      <LegalSection
        id="open-source"
        title="12. Open source and self-hosting"
        summary="SpendChat’s code is open source, and its licence decides what you can do with the code. These Terms cover the SpendChat we run; our name and logo stay ours."
      >
        <p>
          <Term>12.1 The code.</Term> {name}’s source code is published under the GNU Affero
          General Public License, version 3 (<Ext href={siteConfig.links.github}>AGPL-3.0</Ext>).
          Your rights to use, copy, modify and distribute the code are governed by that licence,
          and nothing in these Terms restricts them.
        </p>
        <p>
          <Term>12.2 The hosted Service.</Term> These Terms govern the Service we operate at{" "}
          {siteConfig.domain}. A copy of {name} run by someone else is operated by them, not by
          us; these Terms and our Privacy Policy do not apply to it, and we are not responsible
          for it.
        </p>
        <p>
          <Term>12.3 Our name.</Term> The AGPL-3.0 does not grant rights in the names
          “{name}” and “{op}” or our logos. A copy you run or modify must not be presented as
          ours or as endorsed by us.
        </p>
      </LegalSection>

      <LegalSection
        id="plans"
        title="13. Plans, payments and trials"
        summary="Free stays free. Paid plans renew automatically until you cancel, and Dodo Payments handles the payment."
      >
        <p>
          <Term>13.1 Plans.</Term> The Free plan costs nothing. {paid} are paid plans bought
          for one workspace at a time, and AI top-ups are one-time purchases for a workspace. What
          each plan includes is described on our <In href="/pricing">pricing page</In>. The{" "}
          <In href="/billing-policy">Billing &amp; refund policy</In> sets out how trials,
          renewals, plan changes, cancellations, failed payments, top-ups and refunds work.
        </p>
        <p>
          <Term>13.2 Merchant of record.</Term> Purchases are processed by Dodo Payments, which
          acts as merchant of record: it sells the purchase to you, takes your payment, charges
          and remits any applicable taxes, and issues your invoice, and its terms apply to the
          payment. We provide the Service you have paid for.
        </p>
        <p>
          <Term>13.3 Automatic renewal.</Term> A paid plan renews automatically at the end of
          each billing period you chose (1 month, 3 months or 1 year), and by starting one you
          authorise the recurring charge at the price then in effect until you cancel. You can
          cancel at any time in Settings → Billing; the plan then runs to the end of the period
          you have paid for. If a plan starts with a free trial, you will be charged when the
          trial ends unless you cancel before then. We will give you at least 30 days’ notice
          before a price change applies to your plan.
        </p>
        <p>
          <Term>13.4 Limits after a change.</Term> If a workspace moves to a plan with lower
          limits, nothing is deleted; you keep what you have but cannot add more beyond the new
          limits.
        </p>
      </LegalSection>

      <LegalSection
        id="consumer-rights"
        title="14. Your statutory consumer rights"
        summary="Depending on where you live, the law may give you extra rights — like 14 days to change your mind in the EU and UK. These Terms never take those away."
      >
        <LegalSubsection title="14.1 Right of withdrawal (consumers in the EU, EEA, UK and Switzerland)">
          <p>
            If you are a consumer in the European Union, the European Economic Area, the United
            Kingdom or Switzerland, you have the right to withdraw from a contract for a paid
            plan or an AI top-up within 14 days of entering into it, without giving any reason.
            By starting a paid plan or buying a top-up, you ask us to begin providing it
            straight away. If you withdraw, we will refund what you paid, less an amount in
            proportion to what was provided before you told us you were withdrawing (for a
            top-up, the share of its AI actions already used). To withdraw, send us a clear
            statement — for example, “I withdraw from my contract for the {PLAN_NAMES.plus} plan
            of my workspace [name], bought on [date]” — to <SupportEmail /> before the 14 days
            end. If a plan starts with a free trial, the 14 days run from the first payment.
          </p>
        </LegalSubsection>
        <LegalSubsection title="14.2 Australia">
          <p>
            Our services come with guarantees that cannot be excluded under the Australian
            Consumer Law. For major failures with the service, you are entitled to cancel your
            service contract with us and to a refund for the unused portion, or to compensation
            for its reduced value. You are also entitled to be compensated for any other
            reasonably foreseeable loss or damage. If the failure does not amount to a major
            failure, you are entitled to have problems with the service rectified in a
            reasonable time and, if this is not done, to cancel your contract and obtain a
            refund for the unused portion of the contract.
          </p>
        </LegalSubsection>
        <LegalSubsection title="14.3 Everywhere else">
          <p>
            If you are a consumer, we will provide the Service with reasonable care and skill and
            in line with the description we give you. Where the law of the country you live in
            gives you a right to a refund, repair, price reduction or other remedy that cannot
            be waived — including in India, the United Kingdom, New Zealand and the United
            States — that right applies in addition to these Terms and the Billing &amp; refund
            policy.
          </p>
        </LegalSubsection>
      </LegalSection>

      <LegalSection
        id="changes-to-service"
        title="15. Changes to the Service"
        summary="SpendChat will keep changing. If a change takes away something important you’ve paid for, we’ll tell you first and refund you if you cancel."
      >
        <LegalList>
          <li>
            We improve the Service continually and may add, change or remove features. If we
            make a change that materially reduces what a paid plan provides during a period you
            have paid for, we will tell you in advance, and if you cancel because of it we will
            refund the unused part of that period.
          </li>
          <li>
            We may stop offering the Service. If we do, we will give you at least 60 days’ notice
            (unless the law or a serious security risk requires a shorter period), let you
            export your data, and refund any prepaid amount for the period after it stops.
          </li>
          <li>
            We aim to keep the Service available but do not promise that it will be
            uninterrupted or error-free; we may need to suspend it for maintenance, security or
            reasons outside our control. Features marked as beta or preview may change or be
            withdrawn.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection
        id="third-parties"
        title="16. Third-party services"
        summary="Some parts of SpendChat use other companies’ services, like Google sign-in and Dodo Payments. Their own terms apply to those."
      >
        <p>
          The Service relies on, and links to, services run by others — such as Google sign-in,
          Dodo Payments, and the exchange-rate services used by the free tools. Their own terms
          and privacy policies apply to your use of them. Except where we have engaged them to
          process data for us (as listed in the Privacy Policy), we are not responsible for
          third-party services.
        </p>
      </LegalSection>

      <LegalSection
        id="ip"
        title="17. Intellectual property"
        summary="Your content stays yours. The SpendChat app, name and design belong to us (apart from what the open-source licence covers)."
      >
        <p>
          Subject to the open-source licence (section 12) and your rights in Your Content
          (section 6), the Service, its design, text and graphics, and the {name} and {op} names
          and logos belong to {op} or its licensors. If you send us feedback or suggestions, we
          may use them without obligation to you.
        </p>
      </LegalSection>

      <LegalSection
        id="termination"
        title="18. Suspension and termination"
        summary="You can leave anytime by deleting your account. We may suspend accounts that break these rules, and we’ll usually warn you first."
      >
        <p>
          <Term>18.1 By you.</Term> You may stop using the Service at any time, and delete your
          account in Settings → Account. Deleting your account deletes the workspaces you own and
          their contents, and cancels the plans you pay for at the end of their paid periods, as
          the Privacy Policy and Billing &amp; refund policy describe.
        </p>
        <p>
          <Term>18.2 By us.</Term> We may suspend or end your access to all or part of the
          Service if you materially or repeatedly breach these Terms, if we must do so to comply
          with the law or an order of a competent authority, or if your use creates a serious
          risk of harm to other users, to us or to the Service. A workspace whose payment has
          failed or been disputed may become view-only as the Billing &amp; refund policy
          describes. Where it is reasonable and lawful, we will tell you in advance, explain why,
          and give you an opportunity to fix the problem and to export your data.
        </p>
        <p>
          <Term>18.3 Effect.</Term> When these Terms end, your right to use the Service ends.
          Sections that by their nature should survive — including sections 6.4, 8 (until the
          personal data is deleted), 17, 19, 20, 21, 23 and 24 — survive.
        </p>
      </LegalSection>

      <LegalSection
        id="disclaimers"
        title="19. Disclaimers"
        summary="We work hard to keep SpendChat accurate and running, but we can’t promise it will be perfect or never go down."
      >
        <p>
          Subject to your Mandatory Rights and section 14, and to the extent permitted by law,
          the Service is provided “as is” and “as available”, and we exclude all warranties,
          representations and conditions not expressly set out in these Terms, whether express
          or implied, including implied warranties of merchantability, fitness for a particular
          purpose and non-infringement, and any warranty that the Service or AI output will be
          accurate, complete, uninterrupted or error-free. The free tools are provided without
          charge and for information only.
        </p>
      </LegalSection>

      <LegalSection
        id="liability"
        title="20. Limitation of liability"
        summary="If something goes wrong, there are limits on what we can be held responsible for — but never below what the law guarantees you."
      >
        <p>
          <Term>20.1 What we never limit.</Term> Nothing in these Terms limits or excludes our
          liability for death or personal injury caused by our negligence, for fraud or
          fraudulent misrepresentation, for our gross negligence or wilful misconduct, under your
          Mandatory Rights, or for any other liability that cannot lawfully be limited or
          excluded.
        </p>
        <p>
          <Term>20.2 Consumers in the EU, EEA, UK and Switzerland.</Term> If you are a consumer
          there, we are responsible for loss or damage you suffer that is a foreseeable result of
          our breach of these Terms or our failure to use reasonable care and skill, and not for
          loss or damage that is not foreseeable. We provide the Service for domestic and
          private use; we are not liable to you for loss of profit, business, business
          opportunity or business interruption.
        </p>
        <p>
          <Term>20.3 Everyone else.</Term> Subject to section 20.1, and to the extent permitted
          by law: (a) we are not liable for any indirect, incidental, special, consequential,
          exemplary or punitive loss or damage, or for loss of profits, revenue, business,
          goodwill or anticipated savings; (b) we are not liable for decisions you make based on
          the Service or its AI output, for content entered by you or others, or for failures
          caused by events beyond our reasonable control; and (c) our total aggregate liability
          arising out of or in connection with these Terms or the Service is limited to the
          greater of the amounts you paid for the Service in the 12 months before the event
          giving rise to the claim and USD 100 (or its equivalent in your local currency).
        </p>
      </LegalSection>

      <LegalSection
        id="indemnity"
        title="21. Indemnity"
        summary="For business users only: if your content or actions get us into legal trouble, you cover the cost."
      >
        <p>
          If you are a business user, you will indemnify {op} against third-party claims, and the
          resulting losses, damages and reasonable legal costs, to the extent they arise from Your
          Content, your breach of these Terms or your breach of law. If you are a consumer, this
          section does not apply, but you remain responsible under the law for loss you cause by
          breaching these Terms.
        </p>
      </LegalSection>

      <LegalSection
        id="changes"
        title="22. Changes to these Terms"
        summary="If we change these Terms in a big way, we’ll tell you at least 30 days ahead and ask you to agree in the app."
      >
        <p>
          We may update these Terms to reflect changes to the Service, the law or our practices.
          For a material change, we will tell you at least 30 days before it takes effect, by
          email or in the Service, except where a shorter period is needed to comply with the law
          or address a security risk, and we will ask you to accept the updated Terms in the
          Service. Where you accept updated Terms, they apply from your acceptance. If you do not
          accept a material change, you may stop using the Service and delete your account
          before it takes effect, and if the change is to your disadvantage we will refund any
          prepaid amount for the unused part of your billing period. Other changes take effect
          when we publish them. Every version of these Terms is preserved in our public source
          repository.
        </p>
      </LegalSection>

      <LegalSection
        id="disputes"
        title="23. Governing law and disputes"
        summary="If something’s wrong, talk to us first. Indian law applies, but you keep the protections of the country you live in."
      >
        <p>
          <Term>23.1 Talk to us first.</Term> If you have a complaint, please email{" "}
          <SupportEmail /> first. We will try in good faith to resolve it with you within 30 days.
        </p>
        <p>
          <Term>23.2 Governing law and courts.</Term> These Terms and any dispute or claim arising
          out of or in connection with them, including non-contractual disputes, are governed by
          the laws of India, and, subject to section 23.3, the courts of India have exclusive
          jurisdiction.
        </p>
        <p>
          <Term>23.3 If you are a consumer.</Term> The choice of law in section 23.2 does not
          deprive you of the protection of the mandatory provisions of the law of the country
          where you live, and you may bring proceedings in the courts of that country. In India,
          you may also file a complaint before the consumer commissions under the Consumer
          Protection Act, 2019.
        </p>
      </LegalSection>

      <LegalSection
        id="general"
        title="24. General"
        summary="The usual fine print: how these Terms fit together and how we send each other notices."
      >
        <LegalList>
          <li><Term>Entire agreement.</Term> These Terms, with the documents in section 1.3, are the whole agreement between you and us about the Service and replace any earlier version.</li>
          <li><Term>Assignment.</Term> We may transfer our rights and obligations under these Terms to an affiliate or to a successor to our business, and will tell you if we do; this will not reduce your rights. You may not transfer yours without our written consent.</li>
          <li><Term>Severability.</Term> If a court finds any provision invalid or unenforceable, it will be enforced to the maximum extent permitted and the rest will remain in effect.</li>
          <li><Term>No waiver.</Term> If we do not enforce a provision straight away, we can still enforce it later.</li>
          <li><Term>Events beyond our control.</Term> We are not responsible for delay or failure caused by events beyond our reasonable control, but will take reasonable steps to limit their effect.</li>
          <li><Term>Notices.</Term> We may give you notices by email to your account address or in the Service. You may give us notices at <SupportEmail />.</li>
          <li><Term>Language.</Term> These Terms are written in English. If we provide a translation, the English version prevails to the extent the law permits.</li>
          <li><Term>No third-party rights.</Term> No one other than you and us has any right to enforce these Terms.</li>
          <li><Term>Relationship.</Term> Nothing in these Terms creates a partnership, agency or employment relationship.</li>
        </LegalList>
      </LegalSection>

      <LegalSection
        id="contact"
        title="25. Contact and grievances"
        summary="Questions or complaints? Email us. People in India can also reach our Grievance Officer."
      >
        <p>
          {name} is operated by {op}. For questions about these Terms, complaints, legal notices,
          or reports under section 11, write to <SupportEmail />.
        </p>
        <p>
          <Term>Grievance Officer (India).</Term> Complaints under the Information Technology
          Act, 2000 and the rules made under it, and under the Digital Personal Data Protection
          Act, 2023, may be sent to our Grievance Officer, <GrievanceOfficer />. We acknowledge a
          complaint within 24 hours and aim to resolve it within 15 days of receiving it.
        </p>
      </LegalSection>
    </LegalPage>
  );
}

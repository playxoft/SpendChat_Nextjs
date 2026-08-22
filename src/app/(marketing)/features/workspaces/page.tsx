import Link from "next/link";
import { WorkspacesDemo } from "@/components/marketing/demo/workspaces-demo";
import {
  FeatureAudience,
  FeaturePage,
  FeatureSection,
  FeatureSteps,
} from "@/components/marketing/feature-page";
import { featureLink, getFeature } from "@/lib/features";
import { createMetadata } from "@/lib/seo";

const SLUG = "workspaces";
const feature = getFeature(SLUG)!;

export const metadata = createMetadata({
  title: feature.title,
  description: feature.description,
  path: `/features/${SLUG}`,
});

const faqs = [
  {
    q: "How do I share expenses with my partner?",
    a: "Invite them to your workspace by email and give them the editor role. From then on you're both looking at the same profiles, the same categories and the same running balance, and each transaction in the feed shows who entered it. Neither of you has to hand over a password or re-type anything the other already logged.",
  },
  {
    q: "Can my accountant see only my business profile?",
    a: "Yes. Instead of adding them to the workspace, grant access to the Business profile alone. They'll open the app and see that one set of books — not your groceries, not the household bills — and you can revoke it the moment the filing is done.",
  },
  {
    q: "What can a viewer, an editor and an admin each do?",
    a: "A viewer reads: the feed, the transactions table, the reports. An editor also adds, edits and deletes transactions and attaches receipts. An admin does all of that plus manages profiles, categories, the workspace currency, and who else has access. Someone who can only view sees the composer replaced by a read-only notice rather than a button that fails.",
  },
  {
    q: "What happens if I invite someone who doesn't have an account yet?",
    a: "The invite waits for them. Their email address is stored as a pending invite with the access you chose, they get an email about it, and the moment they sign up with that address the access is applied automatically — no second invite, no code to paste. You can change the role or cancel the invite while it's pending.",
  },
  {
    q: "Can I have more than one workspace?",
    a: "Yes. Everyone starts with one — named after you, created the first time you sign in — and you can create more. A household workspace and a company workspace are a common pair, since they usually have different people in them. Switching is a keystroke, and a new workspace inherits the currency and number format of the one you're in.",
  },
  {
    q: "Do all the profiles in a workspace share categories and currency?",
    a: "Yes, and that's deliberate. Categories and the currency belong to the workspace, so everyone is filing into the same buckets and reading the same units. It's what makes a report comparable across profiles and across people rather than three private taxonomies that never add up.",
  },
];

export default function WorkspacesPage() {
  return (
    <FeaturePage
      slug={SLUG}
      demo={<WorkspacesDemo />}
      demoAction="change someone's role and watch what they can reach change with it"
      faqs={faqs}
      intro={
        <>
          <p>
            Money that more than one person spends needs more than one person to
            see it. A workspace decides who can open the books — invite your
            partner, a co-founder or your accountant by email, choose what each
            of them is allowed to do, and change your mind later without anyone
            re-entering anything.
          </p>
          <p>
            The demo below runs the real permission rules. Change a role and
            watch the profiles that person can reach change with it.
          </p>
        </>
      }
    >
      <FeatureSteps
        steps={[
          {
            title: "Invite by email",
            body: "Type an address and pick a role. If they already have an account the access is live immediately; if not, the invite waits for them.",
          },
          {
            title: "Choose how much they see",
            body: "Everything in the workspace, or a grant on the one profile that concerns them — each at its own role.",
          },
          {
            title: "Change it whenever",
            body: "A role is a dropdown, not a migration. Promote someone for a month, demote them after, or remove them in a click.",
          },
        ]}
      />

      <FeatureSection title="A role beats a shared password">
        <p>
          The way most households actually share a money tracker is by sharing
          one login. It works, in the sense that both people can get in. What it
          costs is everything else: there&apos;s no record of who entered what,
          no way to let someone look without also letting them delete, and no way
          to remove one person&apos;s access without changing the password on
          both.
        </p>
        <p>
          Giving each person their own account and their own role fixes all
          three at once. Every transaction carries who logged it, and in a
          workspace with more than one person the tracker shows those names
          against the rows — the way a group chat does — so &ldquo;did you
          already put the rent in?&rdquo; stops being a question. Access is
          granted per person, so it can be taken back per person.
        </p>
        <p>
          It also means an accountant, a bookkeeper or a flatmate can be given
          exactly the amount of access their job needs, which is almost never
          &ldquo;all of it, forever&rdquo;.
        </p>
      </FeatureSection>

      <FeatureSection title="Two doors in, and the wider one wins">
        <p>
          Access comes from one of two places. <strong>Workspace
          membership</strong> covers everything in the workspace: every{" "}
          <Link href={featureLink("multiple-profiles")} className="underline underline-offset-4">
            profile
          </Link>{" "}
          in it, at the role you chose. A <strong>per-profile grant</strong>{" "}
          covers a single profile, at its own role, and gives no visibility into
          anything else — the person isn&apos;t a member of the workspace at all,
          they just have a key to one room.
        </p>
        <p>
          When both apply to the same profile, the higher role wins. A partner
          who is a viewer of the whole workspace and an editor on Home can read
          everything and write to Home. That single rule is what lets one
          workspace hold books with genuinely different audiences: shared
          household spending everybody can edit, a business profile only you and
          your accountant can reach, and a personal profile nobody else sees.
        </p>
        <p>
          The rule is applied on the server, on every read and every write, not
          in the interface. Hiding a button is a courtesy; the permission check
          is the thing that decides.
        </p>
      </FeatureSection>

      <FeatureSection title="Three roles, because two isn't enough and five is too many">
        <p>
          <strong>Viewer</strong> can read — the feed, the table, the reports,
          the receipts. Nothing they do changes a number. This is the right
          setting for a parent who wants to see how the house is doing, or an
          accountant mid-year who only needs to look. A person with no write
          access anywhere sees the composer replaced by a read-only notice, so
          the app never invites them to do something it will then refuse.
        </p>
        <p>
          <strong>Editor</strong> adds, edits and deletes transactions and
          attaches{" "}
          <Link href={featureLink("receipts-and-files")} className="underline underline-offset-4">
            receipts
          </Link>{" "}
          to them. This is the everyday role for anyone who spends money the
          books need to know about — the other half of a couple, a co-founder, a
          treasurer.
        </p>
        <p>
          <strong>Admin</strong> can additionally manage the structure: create
          and delete profiles, edit{" "}
          <Link href={featureLink("categories")} className="underline underline-offset-4">
            categories
          </Link>
          , change the workspace currency, and invite or remove people. Keep this
          list short. Most shared workspaces need exactly one admin and a set of
          editors, which is also the configuration that is hardest to get wrong.
        </p>
      </FeatureSection>

      <FeatureSection title="The workspace owns the shared vocabulary">
        <p>
          Some settings belong to a person and some belong to a group. Your
          theme and your entry mode follow you between workspaces, because
          they&apos;re about how you work. Categories, currency and number
          format belong to the workspace, because they&apos;re about how the
          numbers are read.
        </p>
        <p>
          That split matters more than it sounds. If two people in the same
          household could each keep their own categories, a monthly report would
          be an average of two different filing systems and comparable to
          nothing. If they could each pick a currency, the balance would be a
          fiction. One set of categories and one currency per workspace means
          any total anyone looks at means the same thing to everybody, and it
          means a new member has nothing to configure before they can be useful.
        </p>
        <p>
          The same logic covers storage: the file vault&apos;s allowance is per
          workspace, not per person, so a shared workspace has one pool everyone
          contributes to rather than a quota nobody can see.
        </p>
      </FeatureSection>

      <FeatureSection title="Invites are just emails, and they wait">
        <p>
          Adding someone is one field. If the address already belongs to an
          account, the access is applied straight away and they&apos;re told by
          email. If it doesn&apos;t, the address is kept as a pending invite with
          the access you chose, and it converts the first time that person signs
          in with it — no invite code to copy, nothing to redeem, nothing that
          expires while they get around to it. Until then you can change the
          pending role or cancel it outright.
        </p>
        <p>
          Everyone gets a workspace of their own at sign-up, named after them,
          so nobody starts on someone else&apos;s. Creating more is a click, and
          a new one inherits the currency and number format of the one you were
          in — a small thing that stops a non-USD account landing on a USD
          workspace and having to fix it. What you don&apos;t get is a bank
          connection or an ad network in the middle of it; more on that in{" "}
          <Link href={featureLink("privacy-and-security")} className="underline underline-offset-4">
            privacy and security
          </Link>
          .
        </p>
      </FeatureSection>

      <FeatureAudience
        items={[
          {
            title: "Couples and households",
            body: "Both people log to the same books, both see the names against each row, and neither has to ask what the other already entered.",
          },
          {
            title: "Freelancers with an accountant",
            body: "Grant access to the business profile alone, at viewer, for as long as the work takes — then take it back without touching anything else.",
          },
          {
            title: "Small teams and clubs",
            body: "One admin holds the structure, everyone else is an editor, and the treasurer's spreadsheet stops being a single point of failure.",
          },
        ]}
      />
    </FeaturePage>
  );
}

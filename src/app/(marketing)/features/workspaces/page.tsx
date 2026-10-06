import Link from "next/link";
import { WorkspacesDemo } from "@/components/marketing/demo/workspaces-demo";
import {
  FeatureAudience,
  FeaturePage,
  FeatureSection,
  FeatureSteps,
} from "@/components/marketing/feature-page";
import { DEFAULT_CATEGORIES, DEFAULT_TAGS } from "@/lib/categories";
import { featureLink, getFeature } from "@/lib/features";
import { plansWith } from "@/lib/plan-copy";
import { PLAN_LIMITS, PLAN_NAMES, type PersonalPlan } from "@/lib/plans";
import { createMetadata } from "@/lib/seo";

const SLUG = "workspaces";
const feature = getFeature(SLUG)!;

export const metadata = createMetadata({
  title: feature.title,
  description: feature.description,
  path: `/features/${SLUG}`,
});

// Every number and plan name below is read from the plan catalogue, never
// typed out, so the page can't promise what the app doesn't enforce.
const L = PLAN_LIMITS;
/** "Plus and Pro" — the plans with per-profile access. */
const perProfilePlans = plansWith("profileLevelAccess");
const limitsOn = (plan: PersonalPlan) =>
  `${L[plan].members} people, ${L[plan].spaces} spaces and up to ${L[plan].profilesPerSpace} profiles in each space`;
const seededTags = DEFAULT_TAGS.map((t) => t.name).join(" and ");

const faqs = [
  {
    q: "How do I share expenses with my partner?",
    a: "Put the profiles you share — Home, say — in a space, invite your partner by email, and give them Read + write on that space. From then on you both see the same profiles, the same categories and the same running balance, and every transaction shows who entered it. Profiles in spaces they're not in stay out of their sidebar, and neither of you hands over a password.",
  },
  {
    q: "Can my accountant see only my business profile?",
    a: `Yes. Keep the business books in their own space and add your accountant to that space alone, with Read. They'll open the app and see the business — not your groceries, not the household bills — and you can take them out of the space the moment the filing is done. On ${perProfilePlans} you can also share just the one profile with them, without adding them to the workspace at all.`,
  },
  {
    q: "Can I hide one profile from someone who shares the space?",
    a: `On ${perProfilePlans}, yes. A per-profile setting — No access, Read or Read + write — for one person on one profile wins over their space role, in either direction: it can hide a profile inside a space they share, or let someone who reads a space write to one profile in it. On ${PLAN_NAMES.free}, people share whole spaces.`,
  },
  {
    q: "What can Read, Read + write and Admin each do?",
    a: "Read is for looking: the feed, the transactions table, the reports and the receipts, in the spaces someone is in. Read + write also adds, edits and deletes transactions and attaches receipts there. Admin sees every space and manages the structure — spaces, profiles, people and the currency. Someone who can only read sees the composer replaced by a read-only notice, not a button that fails.",
  },
  {
    q: "Can a space be hidden from the workspace owner?",
    a: "No. The owner is always an admin, and admins see every space. Spaces decide what members see; they aren't a way to keep money out of sight of the people who run the workspace.",
  },
  {
    q: "How many people, spaces and profiles can a workspace have?",
    a: `On ${PLAN_NAMES.free}, ${limitsOn("free")}. On ${PLAN_NAMES.plus}, ${limitsOn("plus")}. On ${PLAN_NAMES.pro}, ${limitsOn("pro")}. People include you, and pending invites count too. The plan belongs to the workspace, so everyone in it shares the same limits.`,
  },
  {
    q: "What happens if I invite someone who doesn't have an account yet?",
    a: "The invite waits for them. Their email address is kept as a pending invite with the role and spaces you chose, they get an email with a link to join, and when they sign up with that address the access is applied automatically — no second invite, no code to paste. You can change or cancel the invite while it's pending.",
  },
  {
    q: "Can I have more than one workspace?",
    a: "Yes. Everyone gets one free workspace — named after you, created the first time you sign in. Each workspace has its own plan, so another one you create needs its own Plus or Pro plan — upgrade it in a click. Being a member of other people's workspaces doesn't use up yours. A household workspace and a company workspace are a common pair, since they usually have different people in them. Switching is a keystroke, and a new workspace inherits the currency and number format of the one you're in.",
  },
  {
    q: "Do all the profiles in a workspace share categories and currency?",
    a: "Yes, and that's deliberate. Categories, tags and the currency belong to the workspace, not to a space or a person, so everyone is filing into the same buckets and reading the same units. It's what makes a report comparable across profiles and across people rather than three private filing systems that never add up.",
  },
];

export default function WorkspacesPage() {
  return (
    <FeaturePage
      slug={SLUG}
      demo={<WorkspacesDemo />}
      demoAction="change what someone can reach in each space, or hide one profile from them, and watch what they see change with it"
      faqs={faqs}
      intro={
        <>
          <p>
            Money that more than one person spends needs more than one person to
            see it — but rarely all of it. Your partner needs the household
            bills, not your side business. Your accountant needs the business
            books, not your groceries. A workspace lets you invite each of them
            by email and decide, space by space, what they can see and what they
            can change.
          </p>
          <p>
            The demo below runs the real permission rules. Change what someone
            can reach and watch their sidebar change with it.
          </p>
        </>
      }
    >
      <FeatureSteps
        steps={[
          {
            title: "Group profiles into spaces",
            body: "Home and Personal in a Family space, the business books in a Business space. A space is a group in the sidebar — everything one set of people should see.",
          },
          {
            title: "Invite by email, pick their spaces",
            body: "Type an address, choose Read or Read + write, and tick the spaces they should see. If they already have an account it works straight away; if not, the invite waits for them.",
          },
          {
            title: "Change it whenever",
            body: `Add someone to another space, take them out of one, or — on ${perProfilePlans} — hide or open a single profile for them. Nobody re-enters anything.`,
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
          Giving each person their own account and their own access fixes all
          three at once. Every transaction carries who logged it, and in a
          workspace with more than one person the tracker shows those names
          against the rows — the way a group chat does — so &ldquo;did you
          already put the rent in?&rdquo; stops being a question. Access is
          granted per person, so it can be taken back per person.
        </p>
        <p>
          It also means an accountant, a bookkeeper or a flatmate can be given
          exactly the access their job needs, which is almost never &ldquo;all
          of it, forever&rdquo;.
        </p>
      </FeatureSection>

      <FeatureSection title="Spaces: the household in one, the business in another">
        <p>
          Most shared money isn&apos;t shared with everyone. A couple shares the
          rent and the groceries, but one of them also runs a business. A family
          shop has a bookkeeper who should see the shop&apos;s accounts and
          nothing at home. A flat list of profiles can&apos;t say that. Spaces
          can.
        </p>
        <p>
          A space is a group of{" "}
          <Link href={featureLink("multiple-profiles")} className="underline underline-offset-4">
            profiles
          </Link>{" "}
          — Family holding Home and Personal, Business holding the business
          books — shown in the sidebar as a group you can fold away. You add
          each person to the spaces that concern them, at Read to look or Read +
          write to add and edit. A member sees only the spaces they&apos;re in;
          the rest of the workspace simply isn&apos;t there for them. Because the
          role is set per space, the same person can be Read + write in Family
          and Read in Business.
        </p>
        <p>
          Admins are the exception, on purpose. The owner is always an admin,
          and admins see every space — there are no spaces hidden from them.
          That keeps someone able to answer for all of the books, which is what
          running a workspace means. {PLAN_NAMES.free} includes {L.free.spaces}{" "}
          spaces with up to {L.free.profilesPerSpace} profiles in each — enough
          for a household and a side business — and {PLAN_NAMES.plus} and{" "}
          {PLAN_NAMES.pro} raise that to {L.plus.spaces} and {L.pro.spaces}{" "}
          spaces.
        </p>
        <p>
          The rule is applied on the server, on every read and every write, not
          in the interface. Leaving a profile out of someone&apos;s sidebar is a
          courtesy; the permission check is the thing that decides.
        </p>
      </FeatureSection>

      <FeatureSection title="When one profile needs a different answer">
        <p>
          Spaces cover most of it. Sometimes one profile is the exception: your
          partner shares the Family space, but your Personal profile in it
          should stay yours. Or your accountant only sees Business, but needs to
          read the Home profile for one claim.
        </p>
        <p>
          On {perProfilePlans}, an admin can set access for one person on one
          profile — No access, Read or Read + write. It wins over their space
          role in either direction: it can hide one profile inside a space they
          share, or let someone who only reads a space write to one profile in
          it. Leave it on Default and the space decides.
        </p>
        <p>
          A single profile can also be shared with someone who isn&apos;t in the
          workspace at all — a key to one room. They see that profile and
          nothing else. On {PLAN_NAMES.free}, access is whole spaces only;
          settings made on a paid plan keep working after a downgrade, and you
          can still narrow them.
        </p>
      </FeatureSection>

      <FeatureSection title="Three roles, because two isn't enough and five is too many">
        <p>
          <strong>Read</strong> (a viewer) can look — the feed, the table, the
          reports, the receipts — in the spaces they&apos;re in. Nothing they do
          changes a number. This is the right setting for a parent who wants to
          see how the house is doing, or an accountant mid-year who only needs to
          look. A person with no write access anywhere sees the composer replaced
          by a read-only notice, so the app never invites them to do something it
          will then refuse.
        </p>
        <p>
          <strong>Read + write</strong> (an editor) also adds, edits and deletes
          transactions and attaches{" "}
          <Link href={featureLink("receipts-and-files")} className="underline underline-offset-4">
            receipts
          </Link>{" "}
          to them, in the spaces where they have it. This is the everyday role
          for anyone who spends money the books need to know about — the other
          half of a couple, a co-founder, a treasurer.
        </p>
        <p>
          <strong>Admin</strong> sees every space and manages the structure:
          spaces, profiles, the currency, and who is in the workspace and what
          they can reach. Renaming or deleting a shared{" "}
          <Link href={featureLink("categories")} className="underline underline-offset-4">
            category
          </Link>{" "}
          or tag changes every transaction filed under it, so that needs an
          admin, or someone with Read + write on every profile. Keep the admin
          list short. Most shared workspaces need exactly one admin and a few
          people with Read + write, which is also the setup that is hardest to
          get wrong.
        </p>
      </FeatureSection>

      <FeatureSection title="The workspace owns the shared vocabulary">
        <p>
          Some settings belong to a person and some belong to a group. Your
          theme and your entry mode follow you between workspaces, because
          they&apos;re about how you work. Categories, tags, currency and number
          format belong to the workspace — not to a space — because they&apos;re
          about how the numbers are read.
        </p>
        <p>
          That split matters more than it sounds. If two people in the same
          household could each keep their own categories, a monthly report would
          be an average of two different filing systems and comparable to
          nothing. If they could each pick a currency, the balance would be a
          fiction. One set per workspace means any total anyone looks at means
          the same thing to everybody. A new workspace starts with{" "}
          {DEFAULT_CATEGORIES.length} categories and {DEFAULT_TAGS.length} tags
          ({seededTags}), so a new member has nothing to set up before they can
          be useful.
        </p>
        <p>
          The same logic covers storage: the file vault&apos;s allowance is per
          workspace, not per person, so a shared workspace has one pool everyone
          contributes to rather than a quota nobody can see.
        </p>
      </FeatureSection>

      <FeatureSection title="Invites are just emails, and they wait">
        <p>
          Adding someone is an email address, a role, and a tick next to each
          space they should see. If the address already belongs to an account,
          the access is applied straight away and they&apos;re told by email. If
          it doesn&apos;t, the address is kept as a pending invite with the
          access you chose, and it turns into real access the first time that
          person signs in with it — no invite code to copy, nothing to redeem,
          nothing that expires while they get around to it. Until then you can
          change the pending access or cancel it outright. Pending invites count
          towards the workspace&apos;s people limit.
        </p>
        <p>
          Everyone gets one free workspace of their own at sign-up, named after
          them, so nobody starts on someone else&apos;s. Each workspace has its
          own plan, so another one you create needs its own Plus or Pro plan —
          see{" "}
          <Link href="/pricing" className="underline underline-offset-4">
            pricing
          </Link>
          . A new workspace inherits the currency and number format of
          the one you were in — a small thing that stops a non-USD account
          landing on a USD workspace and having to fix it. What you don&apos;t
          get is a bank connection or an ad network in the middle of it; more on
          that in{" "}
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
            body: "Share the Family space at Read + write, so both of you log to the same books and see whose name is on each row. Your own Personal profile can stay yours.",
          },
          {
            title: "Freelancers with an accountant",
            body: "Put the business in its own space and give your accountant Read on that alone, for as long as the work takes — then take them out without touching anything else.",
          },
          {
            title: "Small teams and clubs",
            body: "One admin holds the structure, everyone else gets Read + write on the spaces they spend from, and the treasurer's spreadsheet stops being a single point of failure.",
          },
        ]}
      />
    </FeaturePage>
  );
}

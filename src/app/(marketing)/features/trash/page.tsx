import Link from "next/link";
import { TrashDemo } from "@/components/marketing/demo/trash-demo";
import {
  FeatureAudience,
  FeaturePage,
  FeatureSection,
  FeatureSteps,
} from "@/components/marketing/feature-page";
import { featureLink, getFeature } from "@/lib/features";
import { plansWith } from "@/lib/plan-copy";
import { PLAN_NAMES } from "@/lib/plans";
import { TRASH_DAYS } from "@/lib/trash";
import { createMetadata } from "@/lib/seo";

const SLUG = "trash";
const feature = getFeature(SLUG)!;

export const metadata = createMetadata({
  title: feature.title,
  description: feature.description,
  path: `/features/${SLUG}`,
});

// The window and the plans are read from the catalogue the app enforces.
const DAYS = TRASH_DAYS;
/** "Plus and Pro" — the plans whose trash also keeps files and folders. */
const FILE_PLANS = plansWith("fileTrash");

const faqs = [
  {
    q: "How long do deleted transactions stay in the trash?",
    a: `${DAYS} days, on every plan. Restore one, several or all of them any time before then. After ${DAYS} days a daily clean-up removes them for good.`,
  },
  {
    q: "I deleted the wrong transaction. How do I get it back?",
    a: `Press Undo on the message that appears straight after the delete — it puts back exactly what went, bulk deletes included. Missed it? Open Trash from your account menu and press Restore; it's there for ${DAYS} days.`,
  },
  {
    q: "Can I recover a deleted file or folder?",
    a: `On ${FILE_PLANS}, yes: files and folders go to the trash for ${DAYS} days too, folders with everything inside them. On ${PLAN_NAMES.free}, deleting a file is final, and the app says so before you confirm.`,
  },
  {
    q: "Do deleted transactions still count in my totals?",
    a: "No. A transaction in the trash drops out of your balance, reports, budgets and exports straight away. Restore it and it counts again, exactly as before.",
  },
  {
    q: "Do files in the trash use my storage?",
    a: "Yes, until they're gone. Delete them forever or empty the trash and the space is yours again straight away; otherwise it frees up when the trash clears them out.",
  },
  {
    q: "Who can restore something in a shared workspace?",
    a: "Anyone who can see the profile can see what was deleted from it, and who deleted it. Restoring or deleting for good needs Read + write on that profile. A deleted profile is restored by an admin, like deleting one.",
  },
  {
    q: "Can I empty the trash early?",
    a: "Yes. Pick items and press Delete forever, or empty the whole trash. That one can't be undone, so the app asks first.",
  },
];

export default function TrashFeaturePage() {
  return (
    <FeaturePage
      slug={SLUG}
      demo={<TrashDemo />}
      demoAction="delete a row and press Undo, or restore one from the trash below"
      faqs={faqs}
      intro={
        <>
          <p>
            Everyone deletes the wrong row eventually — usually the rent, mid-way
            through tidying up. In SpendChat a delete is a move to the trash.
            Press Undo on the message that follows, or open the trash any time in
            the next {DAYS} days and put it back exactly as it was.
          </p>
          <p>
            The demo below skips the &ldquo;Delete this transaction?&rdquo;
            check and goes straight to the part that matters: delete
            something, then change your mind.
          </p>
        </>
      }
    >
      <FeatureSteps
        steps={[
          {
            title: "Delete as usual",
            body: "One row, a whole selection, a file or folder, or a profile. It leaves every list straight away and waits in the trash.",
          },
          {
            title: "Undo, right there",
            body: "The message after every delete has an Undo that brings back exactly what went — the category, the date, the tags, all of it.",
          },
          {
            title: `Or restore within ${DAYS} days`,
            body: `Trash sits in your account menu, next to Settings. Restore what you need; after ${DAYS} days the rest is removed for good.`,
          },
        ]}
      />

      <FeatureSection title="A delete you can take back">
        <p>
          A money tracker you&apos;re afraid to tidy is one that slowly fills
          with duplicates. So a delete is never the end of the story: the
          message that confirms it carries an Undo, and Undo restores precisely
          what was removed, whether that was one coffee or two hundred rows you
          selected in{" "}
          <Link href={featureLink("transactions")} className="underline underline-offset-4">
            the transactions table
          </Link>
          .
        </p>
        <p>
          While something is in the trash it stops counting. Your balance,
          reports, budgets and exports drop it straight away, and pick it up
          again the moment it&apos;s restored — nothing to recalculate, nothing
          left half-deleted.
        </p>
      </FeatureSection>

      <FeatureSection title="What goes to the trash, on which plan">
        <p>
          <strong>Transactions</strong> go to the trash on every plan, for {DAYS}{" "}
          days. <strong>Files and folders</strong> in the{" "}
          <Link href={featureLink("receipts-and-files")} className="underline underline-offset-4">
            vault
          </Link>{" "}
          do too on {FILE_PLANS} — a folder with everything inside it — and
          their share links stop working while they&apos;re there. On{" "}
          {PLAN_NAMES.free}, deleting a file is final, and the app tells you so
          before you confirm rather than after.
        </p>
        <p>
          <strong>Whole profiles</strong> go to the trash as well, with their
          transactions, when an admin deletes one. Restore the profile and its
          books come back with it.
        </p>
        <p>
          Files in the trash still count toward your storage until they&apos;re
          gone. Delete them forever, or empty the trash, and the space is free
          straight away.
        </p>
      </FeatureSection>

      <FeatureSection title={`${DAYS} days, then gone for good`}>
        <p>
          Each item in the trash shows how long it has left — &ldquo;Deletes in
          27 days&rdquo; — and the badge turns amber in the last few days, so
          nothing disappears by surprise. After {DAYS} days a daily clean-up
          removes it, along with any stored file, and it can&apos;t be
          recovered. Until that clean-up has actually run, you can still
          restore it.
        </p>
        <p>
          You don&apos;t have to wait. Delete forever removes the items you pick,
          and Empty trash clears it out. Both ask first, because those are the
          deletes with no Undo.
        </p>
      </FeatureSection>

      <FeatureSection title="The same rules as the delete">
        <p>
          In a{" "}
          <Link href={featureLink("workspaces")} className="underline underline-offset-4">
            shared workspace
          </Link>
          , the trash follows the same access as everything else. Anyone who can
          see a profile can see what was deleted from it, and by whom —
          &ldquo;Deleted 2 hours ago by Sam&rdquo; settles most questions before
          they&apos;re asked. Restoring or deleting for good needs Read + write
          on that profile; profiles themselves are restored by an admin.
        </p>
        <p>
          And when you&apos;d rather keep a copy outside the app altogether,{" "}
          <Link href={featureLink("export-and-print")} className="underline underline-offset-4">
            export to CSV
          </Link>{" "}
          is on every plan.
        </p>
      </FeatureSection>

      <FeatureAudience
        items={[
          {
            title: "People who tidy up",
            body: "Clearing duplicates after a bulk import, or a month of test entries. Delete freely; if the rent goes with them, Undo brings it back.",
          },
          {
            title: "Shared households",
            body: "Someone else deleted the electricity bill. The trash says who and when, and anyone with Read + write puts it back.",
          },
          {
            title: "Freelancers with receipts",
            body: `On ${FILE_PLANS}, a contract or a warranty deleted by mistake waits in the trash for ${DAYS} days instead of being gone the moment you click.`,
          },
        ]}
      />
    </FeaturePage>
  );
}

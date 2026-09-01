import Link from "next/link";
import { FilesDemo } from "@/components/marketing/demo/files-demo";
import {
  FeatureAudience,
  FeaturePage,
  FeatureSection,
  FeatureSteps,
} from "@/components/marketing/feature-page";
import { featureLink, getFeature } from "@/lib/features";
import { createMetadata } from "@/lib/seo";

const SLUG = "receipts-and-files";
const feature = getFeature(SLUG)!;

export const metadata = createMetadata({
  title: feature.title,
  description: feature.description,
  path: `/features/${SLUG}`,
});

const faqs = [
  {
    q: "Can I attach a receipt to an expense?",
    a: "Yes. Drop a photo or PDF onto the composer, or anywhere on the tracker, and it's attached to the transaction you're writing. Attached files also appear in the vault, in a system folder called Transaction attachments, so you can find them either way.",
  },
  {
    q: "What file types can I upload?",
    a: "Photos, PDFs, spreadsheets and plain documents — the things a receipt or an invoice actually arrives as. Each file is capped at 5 MB, which is comfortably more than a phone photo of a receipt.",
  },
  {
    q: "How much storage do I get?",
    a: "1 GB per workspace, included. The toolbar shows a ring with how much is used, and it changes colour as you approach the limit rather than surprising you at it.",
  },
  {
    q: "Can I share a file with someone who doesn't have an account?",
    a: "Yes. Create a share link for a file and anyone with the link can view it — useful for sending a landlord a receipt or an accountant a single invoice without giving them access to anything else. Links can be revoked.",
  },
  {
    q: "How do tags differ from folders?",
    a: "A file lives in one folder but can carry several tags. Folders are where something is kept; tags are what it is. A rent receipt can sit in \"2026 tax\" while being tagged both Receipts and Tax.",
  },
  {
    q: "Is the vault only for receipts?",
    a: "No. It's a general file store that happens to be where receipts land. Warranties, insurance policies, statements and contracts are all reasonable things to keep beside the money they relate to.",
  },
];

export default function ReceiptsAndFilesPage() {
  return (
    <FeaturePage
      slug={SLUG}
      demo={<FilesDemo />}
      demoAction="filter by a tag, search, or switch between grid and list"
      faqs={faqs}
      intro={
        <>
          <p>
            A receipt is only useful if you can find it next to the expense it
            belongs to. Attach one to any transaction, and keep everything else —
            bills, invoices, warranties, policies — in a vault with folders,
            colour tags and share links.
          </p>
          <p>
            The demo below filters and searches for real. Every workspace gets
            1&nbsp;GB.
          </p>
        </>
      }
    >
      <FeatureSteps
        steps={[
          {
            title: "Drop it on the transaction",
            body: "Drag a photo or PDF onto the composer — or anywhere on the tracker — and it's attached to what you're writing.",
          },
          {
            title: "Or file it in the vault",
            body: "Folders with colour tints, tags with their own colours, drag-and-drop between folders, and drop straight from your desktop.",
          },
          {
            title: "Find it later",
            body: "Search by name, filter by tag, and switch between grid, list and column views depending on what you're doing.",
          },
        ]}
      />

      <FeatureSection title="The receipt lives with the expense">
        <p>
          The usual failure isn&apos;t losing the receipt — it&apos;s having the
          receipt and the record in two different places. A photo roll full of
          receipts you can&apos;t match to transactions is barely better than no
          receipts at all, and a folder of PDFs named{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-sm">IMG_4471.jpg</code>{" "}
          is worse.
        </p>
        <p>
          Attaching a file to a transaction ties the two together permanently.
          Open the transaction and the receipt is there; open the file and you
          can see what it was for. Attachments also show as a small marker in the{" "}
          <Link href={featureLink("transactions")} className="underline underline-offset-4">
            transactions table
          </Link>
          , so a row with proof behind it is visibly different from one without —
          which is exactly what you want when you&apos;re assembling a claim.
        </p>
      </FeatureSection>

      <FeatureSection title="Folders for where, tags for what">
        <p>
          A file lives in exactly one folder and can carry as many tags as make
          sense. That distinction does real work: a rent receipt belongs in
          &ldquo;2026 tax&rdquo; and is also, separately, a receipt. Folders
          alone would force you to choose; tags alone would leave you without a
          place to put things.
        </p>
        <p>
          Both carry colour — folders get a tint, tags get a dot — so a vault
          with a few hundred files is still scannable. Attachments from
          transactions land in a system folder of their own, which keeps them
          from cluttering the folders you made on purpose.
        </p>
      </FeatureSection>

      <FeatureSection title="Share one file, not your account">
        <p>
          A landlord wants one receipt. An accountant wants one invoice. Neither
          needs access to your finances, and inviting them to a{" "}
          <Link href={featureLink("workspaces")} className="underline underline-offset-4">
            workspace
          </Link>{" "}
          for it is more than the situation asks for.
        </p>
        <p>
          A share link points at a single file, works without an account, and can
          be revoked when it&apos;s done. It&apos;s the smallest amount of access
          that answers the request — which is the right default for anything
          involving money.
        </p>
      </FeatureSection>

      <FeatureSection title="1 GB, and you can see it">
        <p>
          Every workspace includes a gigabyte. In practice that&apos;s several
          thousand receipt photos, which is more than most people accumulate in
          years — but the point of the toolbar gauge is that you never have to
          wonder. It shows what&apos;s used against the limit, and shifts colour
          as you approach it rather than letting an upload fail without warning.
        </p>
        <p>
          Files are capped at 5 MB each. That&apos;s deliberate: a receipt is a
          document, and a 5 MB ceiling is generous for a phone photo of one while
          keeping a shared workspace from being filled by a single video.
        </p>
      </FeatureSection>

      <FeatureAudience
        items={[
          {
            title: "Anyone claiming expenses",
            body: "Proof attached to the record it proves, so building a claim is a filter and an export rather than an archaeology project.",
          },
          {
            title: "Freelancers and small businesses",
            body: "Invoices out, receipts in, and everything tagged for the year it belongs to when the accountant asks.",
          },
          {
            title: "Households",
            body: "Warranties, policies and bills kept beside the money that paid for them, visible to whoever you've shared the workspace with.",
          },
        ]}
      />
    </FeaturePage>
  );
}

import { notFound } from "next/navigation";
import { TryItCaption } from "@/components/marketing/demo/demo-caption";
import { StaticFeed } from "./static-feed";
import { ChatDemo } from "@/components/marketing/demo/chat-demo";
import { AiDemo } from "@/components/marketing/demo/ai-demo";
import { VoiceDemo } from "@/components/marketing/demo/voice-demo";
import { ProfilesDemo } from "@/components/marketing/demo/profiles-demo";
import { TransactionsDemo } from "@/components/marketing/demo/transactions-demo";
import { AnalyticsDemo } from "@/components/marketing/demo/analytics-demo";
import { FilesDemo } from "@/components/marketing/demo/files-demo";
import { BulkAddDemo } from "@/components/marketing/demo/bulk-add-demo";
import { CategoriesDemo } from "@/components/marketing/demo/categories-demo";
import { ExportDemo } from "@/components/marketing/demo/export-demo";
import { WorkspacesDemo } from "@/components/marketing/demo/workspaces-demo";
import { PrivacyDemo } from "@/components/marketing/demo/privacy-demo";
import { ShortcutsDemo } from "@/components/marketing/demo/shortcuts-demo";
import { FilesPreview } from "@/components/marketing/demo/files-preview";
import { ShortcutsPreview } from "@/components/marketing/demo/shortcuts-preview";
import { EntryMethods } from "@/components/marketing/entry-methods";
import { createMetadata } from "@/lib/seo";

/**
 * Development-only gallery of every marketing demo, so they can be eyeballed
 * side by side in both themes.
 *
 * The demos live on separate pages but are supposed to read as one product, and
 * the only reliable way to catch drift — a stray radius here, a different
 * spacing scale there — is to see them together. That means the page's own
 * furniture has to be part of the set, not an exception to it: `StaticFeed` is
 * a client island precisely so it resolves currency the way the demos below it
 * do, and a difference you spot here is always theirs rather than the
 * gallery's.
 *
 * "Every" is the load-bearing word, and it's a maintenance rule rather than an
 * observation: a demo that isn't on this page is a demo nobody is comparing
 * against the others, which is how a toolbar that collapses on a phone or a
 * count that contradicts the list under it survives review. Add the section in
 * the same change that adds the demo — the homepage bands (`FilesPreview`,
 * `ShortcutsPreview`, `EntryMethods`) included, since they're the ones most
 * likely to drift from their full-size siblings.
 *
 * It 404s in production and is disallowed in `robots.ts`; `noIndex` is belt and
 * braces.
 */
export const metadata = createMetadata({
  title: "Demo gallery",
  description:
    "Development-only gallery of the marketing demos, for checking they stay visually consistent with the app.",
  path: "/dev/demos",
  noIndex: true,
});

export default function DemoGalleryPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-16 px-4 pb-24 pt-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Demo gallery</h1>
        <p className="mt-2 text-muted-foreground">
          Development only — 404s in production. Toggle the theme and check the
          demos still read as one product.
        </p>
      </div>

      <section>
        <h2 className="mb-4 text-xl font-medium">DemoFrame — app chrome</h2>
        <StaticFeed profile="Personal" />
        <TryItCaption action="this one is static, it's here to check the chrome" />
      </section>

      <section>
        <h2 className="mb-4 text-xl font-medium">ChatDemo — hero variant (no rail)</h2>
        <ChatDemo sidebar={false} className="h-[30rem]" />
        <TryItCaption action="type an amount, pick a category, and hit send" />
      </section>

      <section>
        <h2 className="mb-4 text-xl font-medium">ChatDemo — /features/chat-expense-tracker</h2>
        <ChatDemo />
        <TryItCaption action="type an amount, pick a category, and hit send" />
      </section>

      <section>
        <h2 className="mb-4 text-xl font-medium">AiDemo — /features/ai-expense-tracker</h2>
        <AiDemo />
        <TryItCaption action="edit a draft, delete one, then press Add" />
      </section>

      <section>
        <h2 className="mb-4 text-xl font-medium">VoiceDemo — /features/voice-expense-tracker</h2>
        <VoiceDemo />
        <TryItCaption action="pick a language and hold the mic button" />
      </section>

      <section>
        <h2 className="mb-4 text-xl font-medium">ProfilesDemo — /features/multiple-profiles</h2>
        <ProfilesDemo />
        <TryItCaption action="switch between Personal, Home and Business" />
      </section>

      <section>
        <h2 className="mb-4 text-xl font-medium">TransactionsDemo — /features/transactions</h2>
        <TransactionsDemo />
        <TryItCaption action="filter, search the notes, or sort by amount" />
      </section>

      <section>
        <h2 className="mb-4 text-xl font-medium">AnalyticsDemo — /features/analytics</h2>
        <AnalyticsDemo />
        <TryItCaption action="change the range or flip expense/income" />
      </section>

      <section>
        <h2 className="mb-4 text-xl font-medium">FilesDemo — /features/receipts-and-files</h2>
        <FilesDemo />
        <TryItCaption action="filter by a tag, search, or switch between grid and list" />
      </section>

      <section>
        <h2 className="mb-4 text-xl font-medium">BulkAddDemo — /features/bulk-add</h2>
        <BulkAddDemo />
        <TryItCaption action="edit the rows and watch the preview re-parse" />
      </section>

      <section>
        <h2 className="mb-4 text-xl font-medium">CategoriesDemo — /features/categories</h2>
        <CategoriesDemo />
        <TryItCaption action="rename a category, change its emoji, or add one — and watch the composer below" />
      </section>

      <section>
        <h2 className="mb-4 text-xl font-medium">ExportDemo — /features/export-and-print</h2>
        <ExportDemo />
        <TryItCaption action="switch between income and expenses, or pick a category, and watch the file rewrite itself" />
      </section>

      <section>
        <h2 className="mb-4 text-xl font-medium">WorkspacesDemo — /features/workspaces</h2>
        <WorkspacesDemo />
        <TryItCaption action="change someone's role and watch what they can reach change with it" />
      </section>

      <section>
        <h2 className="mb-4 text-xl font-medium">
          PrivacyDemo — /features/privacy-and-security
        </h2>
        <PrivacyDemo />
        <TryItCaption action="pick an action and read what the request actually carries" />
      </section>

      <section>
        <h2 className="mb-4 text-xl font-medium">
          ShortcutsDemo — /features/keyboard-shortcuts
        </h2>
        <ShortcutsDemo />
        <TryItCaption action="click the panel, then press a key and watch the app move" />
      </section>

      {/* The homepage bands. Both sit in one half of a `lg:grid-cols-2` row up
          there, so they're boxed to about that column's width here rather than
          run out to the full page — a panel checked at 1000px tells you nothing
          about the 540 it actually gets. */}
      <section>
        <h2 className="mb-4 text-xl font-medium">FilesPreview — homepage band</h2>
        <div className="max-w-xl">
          <FilesPreview />
        </div>
        <TryItCaption action="tap a tag to filter the vault" />
      </section>

      <section>
        <h2 className="mb-4 text-xl font-medium">ShortcutsPreview — homepage band</h2>
        <div className="max-w-xl">
          <ShortcutsPreview />
        </div>
        <TryItCaption action="click the panel, then press t, e or f" />
      </section>

      {/* Last, because it's the only one that's a whole section rather than a
          frame: it pins its heading and widget and steps the composer through
          the four entry methods as you scroll past it, so anything below it
          would be several screens away. */}
      <section>
        <h2 className="mb-4 text-xl font-medium">EntryMethods — homepage section</h2>
        <EntryMethods
          header={
            <>
              <h3 className="text-2xl font-semibold tracking-tight">
                Four ways to add a transaction
              </h3>
              <p className="mt-3 text-muted-foreground">
                Keep scrolling — the composer works through all four.
              </p>
            </>
          }
        />
        <TryItCaption action="scroll, and watch the composer change under the heading" />
      </section>
    </div>
  );
}

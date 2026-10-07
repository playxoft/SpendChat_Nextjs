import type { Metadata } from "next";
import { getCurrentWorkspace, requireUser } from "@/lib/auth";
import { SplitImport } from "./_components/split-import";

export const dynamic = "force-dynamic";

// Private app page (robots-disallowed under /app) — a title is all it needs.
export const metadata: Metadata = { title: "Bring your group in" };

/**
 * Where the free split calculator hands over after sign-up: the group the
 * visitor built (kept in this browser) becomes a real Split group once each
 * person has an email. The draft only exists in the browser, so the page is
 * a client component; the server lends the number format.
 */
export default async function SplitImportPage() {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return <SplitImport locale={workspace.locale} />;
}

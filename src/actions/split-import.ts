"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/action-result";
import type { SplitImportInput } from "@/lib/split-import";
import * as splitImport from "@/services/split-import";

/**
 * Bring a group in from the free split calculator (`/app/split/import`). A thin
 * wrapper: every rule is in `services/split-import.ts`. Kept out of
 * `actions/split.ts` so the tool hand-off and the Split screens can change
 * independently.
 */
export async function importSplitDraft(
  input: SplitImportInput,
): Promise<ActionResult<{ groupId: string; expenses: number; invited: number }>> {
  const user = await requireUser();
  return runAction(
    "importSplitDraft",
    async () => {
      const { groupId, expenses, added } = await splitImport.importSplitDraft(user, input);
      // The new group shows on the Split list, and the nav badge may move.
      revalidatePath("/app", "layout");
      // Everyone added is invited — by email, or in the app if they have an
      // account; the count can't say which (on purpose, see services/split.ts).
      return { groupId, expenses, invited: added.filter((a) => a.status === "invited").length };
    },
    { userId: user.id },
  );
}

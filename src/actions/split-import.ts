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
): Promise<ActionResult<{ groupId: string; expenses: number }>> {
  const user = await requireUser();
  return runAction(
    "importSplitDraft",
    async () => {
      const { groupId, expenses } = await splitImport.importSplitDraft(user, input);
      // The new group shows on the Split list, and the nav badge may move.
      revalidatePath("/app", "layout");
      return { groupId, expenses };
    },
    { userId: user.id },
  );
}

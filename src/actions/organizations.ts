"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/action-result";
import * as organizationService from "@/services/organizations";

export async function renameOrganization(name: string): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(
    "renameOrganization",
    async () => {
      await organizationService.renameMyOrganization(user.id, { name });
      revalidatePath("/app/settings", "layout");
      return {};
    },
    { userId: user.id },
  );
}

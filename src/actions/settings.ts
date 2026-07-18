"use server";

import { revalidatePath } from "next/cache";
import { getCurrentWorkspace, requireUser } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/action-result";
import * as settingsService from "@/services/settings";

function revalidateAll() {
  revalidatePath("/settings");
  revalidatePath("/app");
  revalidatePath("/transactions");
  revalidatePath("/analytics");
}

/** Partial user-settings update (theme, input mode — these follow the user). */
export async function patchSettings(input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(
    "patchSettings",
    async () => {
      await settingsService.patchSettings(user.id, input);
      revalidateAll();
      return {};
    },
    { userId: user.id },
  );
}

/** Change how the transaction composer lays out its inputs. */
export async function updateInputMode(mode: string): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(
    "updateInputMode",
    async () => {
      await settingsService.updateInputMode(user.id, mode);
      revalidatePath("/app");
      revalidatePath("/settings");
      return {};
    },
    { userId: user.id },
  );
}

/** Erase all of the user's data (danger zone). The client signs out afterwards. */
export async function deleteAccount(confirm: string): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(
    "deleteAccount",
    async () => {
      await settingsService.deleteAccount(user.id, confirm);
      return {};
    },
    { userId: user.id },
  );
}

/** Wipe the user's own transactions in the current workspace (danger zone). */
export async function deleteAllTransactions(confirm: string): Promise<ActionResult> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "deleteAllTransactions",
    async () => {
      await settingsService.deleteAllTransactions(user.id, workspace.id, confirm);
      revalidatePath("/app");
      revalidatePath("/transactions");
      revalidatePath("/analytics");
      return {};
    },
    { userId: user.id },
  );
}

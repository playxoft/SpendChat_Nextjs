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

/** Update the signed-in user's account display name. */
export async function updateAccountName(name: string): Promise<ActionResult<{ name: string }>> {
  const user = await requireUser();
  return runAction(
    "updateAccountName",
    async () => {
      const res = await settingsService.updateAccountName(user.id, { name });
      revalidatePath("/settings");
      revalidatePath("/app");
      return { name: res.name };
    },
    { userId: user.id },
  );
}

/**
 * Notify the user by email that their password was created/changed. Called from
 * the client *after* the Firebase Web-SDK password operation succeeds — the
 * change itself happens in the browser; the server only sends the notice.
 */
export async function notifyPasswordChanged(): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(
    "notifyPasswordChanged",
    async () => {
      await settingsService.notifyPasswordChanged(user.id);
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

/** Choose which languages voice entry should expect (ISO 639-1 codes). */
export async function updateVoiceLanguages(languages: string[]): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(
    "updateVoiceLanguages",
    async () => {
      await settingsService.updateVoiceLanguages(user.id, languages);
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
export async function deleteAllTransactions(
  confirm: string,
  profileIds: string[],
): Promise<ActionResult<{ deleted?: number }>> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "deleteAllTransactions",
    async () => {
      const res = await settingsService.deleteAllTransactions(
        user.id,
        workspace.id,
        confirm,
        profileIds,
      );
      revalidatePath("/app");
      revalidatePath("/transactions");
      revalidatePath("/analytics");
      return { deleted: res.deleted };
    },
    { userId: user.id, workspaceId: workspace.id },
  );
}

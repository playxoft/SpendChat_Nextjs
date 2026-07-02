"use server";

import { revalidatePath } from "next/cache";
import { getCurrentWorkspace, requireUser } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/action-result";
import * as profileService from "@/services/profiles";
import { type ProfileInput, type UpdateProfileInput } from "@/lib/validation";

function revalidateApp() {
  revalidatePath("/app");
  revalidatePath("/transactions");
  revalidatePath("/analytics");
  revalidatePath("/settings");
}

export async function addProfile(input: ProfileInput): Promise<ActionResult<{ id?: string }>> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "addProfile",
    async () => {
      const row = await profileService.createProfile(user.id, workspace.id, input);
      revalidateApp();
      return { id: row.id };
    },
    { userId: user.id, workspaceId: workspace.id, profileName: input.name },
  );
}

export async function updateProfile(input: UpdateProfileInput): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(
    "updateProfile",
    async () => {
      await profileService.updateProfile(user.id, input.id, input);
      revalidateApp();
      return {};
    },
    { userId: user.id, profileId: input.id },
  );
}

export async function deleteProfile(id: string): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(
    "deleteProfile",
    async () => {
      await profileService.deleteProfile(user.id, id);
      revalidateApp();
      return {};
    },
    { userId: user.id, profileId: id },
  );
}

/** Move every transaction from one profile to another (editor on both). */
export async function moveProfileTransactions(
  fromId: string,
  toId: string,
): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(
    "moveProfileTransactions",
    async () => {
      await profileService.moveProfileTransactions(user.id, fromId, toId);
      revalidateApp();
      return {};
    },
    { userId: user.id, profileId: fromId, toProfileId: toId },
  );
}

/** Persist the sidebar order. `ids` is the full ordered list of the workspace's profiles. */
export async function reorderProfiles(ids: string[]): Promise<ActionResult> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "reorderProfiles",
    async () => {
      await profileService.reorderProfiles(user.id, workspace.id, ids);
      revalidateApp();
      return {};
    },
    { userId: user.id, workspaceId: workspace.id },
  );
}

export async function listProfiles() {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return profileService.listProfiles(user.id, workspace.id);
}

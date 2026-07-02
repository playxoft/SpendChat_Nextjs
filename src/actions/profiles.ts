"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
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
  return runAction("addProfile", async () => {
    const row = await profileService.createProfile(user.id, input);
    revalidateApp();
    return { id: row.id };
  });
}

export async function updateProfile(input: UpdateProfileInput): Promise<ActionResult> {
  const user = await requireUser();
  return runAction("updateProfile", async () => {
    await profileService.updateProfile(user.id, input.id, input);
    revalidateApp();
    return {};
  });
}

export async function deleteProfile(id: string): Promise<ActionResult> {
  const user = await requireUser();
  return runAction("deleteProfile", async () => {
    await profileService.deleteProfile(user.id, id);
    revalidateApp();
    return {};
  });
}

/** Move every transaction from one profile to another (both must be owned). */
export async function moveProfileTransactions(
  fromId: string,
  toId: string,
): Promise<ActionResult> {
  const user = await requireUser();
  return runAction("moveProfileTransactions", async () => {
    await profileService.moveProfileTransactions(user.id, fromId, toId);
    revalidateApp();
    return {};
  });
}

/** Persist the sidebar order. `ids` is the full ordered list of the user's profiles. */
export async function reorderProfiles(ids: string[]): Promise<ActionResult> {
  const user = await requireUser();
  return runAction("reorderProfiles", async () => {
    await profileService.reorderProfiles(user.id, ids);
    revalidateApp();
    return {};
  });
}

export async function listProfiles() {
  const user = await requireUser();
  return profileService.listProfiles(user.id);
}

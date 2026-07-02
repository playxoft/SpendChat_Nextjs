"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/action-result";
import * as settingsService from "@/services/settings";
import { type SettingsInput } from "@/lib/validation";

export type { ActionResult };

function revalidateAll() {
  revalidatePath("/settings");
  revalidatePath("/app");
  revalidatePath("/transactions");
  revalidatePath("/analytics");
}

export async function updateSettings(input: SettingsInput): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(async () => {
    await settingsService.updateSettings(user.id, input);
    revalidateAll();
    return {};
  });
}

export async function updateCurrency(currency: string): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(async () => {
    await settingsService.updateCurrency(user.id, currency);
    revalidateAll();
    return {};
  });
}

/** Change how the transaction composer lays out its inputs. */
export async function updateInputMode(mode: string): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(async () => {
    await settingsService.updateInputMode(user.id, mode);
    revalidatePath("/app");
    revalidatePath("/settings");
    return {};
  });
}

/** Wipe every transaction for the user (danger zone). */
export async function deleteAllTransactions(confirm: string): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(async () => {
    await settingsService.deleteAllTransactions(user.id, confirm);
    revalidatePath("/app");
    revalidatePath("/transactions");
    revalidatePath("/analytics");
    return {};
  });
}

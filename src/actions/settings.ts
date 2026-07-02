"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/action-result";
import * as settingsService from "@/services/settings";
import { type SettingsInput } from "@/lib/validation";

function revalidateAll() {
  revalidatePath("/settings");
  revalidatePath("/app");
  revalidatePath("/transactions");
  revalidatePath("/analytics");
}

export async function updateSettings(input: SettingsInput): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(
    "updateSettings",
    async () => {
      await settingsService.updateSettings(user.id, input);
      revalidateAll();
      return {};
    },
    { userId: user.id },
  );
}

export async function updateCurrency(currency: string): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(
    "updateCurrency",
    async () => {
      await settingsService.updateCurrency(user.id, currency);
      revalidateAll();
      return {};
    },
    { userId: user.id, currency },
  );
}

/** Partial settings update (any subset of currency/locale/theme/inputMode). */
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

/** Wipe every transaction for the user (danger zone). */
export async function deleteAllTransactions(confirm: string): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(
    "deleteAllTransactions",
    async () => {
      await settingsService.deleteAllTransactions(user.id, confirm);
      revalidatePath("/app");
      revalidatePath("/transactions");
      revalidatePath("/analytics");
      return {};
    },
    { userId: user.id },
  );
}

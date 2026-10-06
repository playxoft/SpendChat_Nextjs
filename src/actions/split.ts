"use server";

import { revalidatePath } from "next/cache";
import { getCurrentWorkspace, requireUser } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/action-result";
import {
  SPLIT_EXPENSES_PAGE,
  SPLIT_PAYMENTS_PAGE,
  type AddSplitMembersInput,
  type CreateSplitGroupInput,
  type SplitExpenseInput,
  type SplitSettlementInput,
  type UpdateSplitGroupInput,
  type AddSplitShareToWorkspaceInput,
  type UpdateSplitWorkspaceEntryInput,
} from "@/lib/validation";
import * as split from "@/services/split";
import * as ledger from "@/services/split-ledger";
import * as invites from "@/services/split-invites";
import type { AddedPerson } from "@/services/split";
import type { SplitInvitation } from "@/services/split";
import type { SplitExpenseView, SplitSettlementView } from "@/services/split-ledger";

/**
 * Split server actions — thin wrappers over `services/split*.ts`, which hold
 * every rule. Groups live outside workspaces, so nothing here reads the
 * current workspace.
 */

/** Every split page (list + group pages). */
function revalidateSplit() {
  revalidatePath("/app/split", "layout");
}

/** Invitations also drive the nav badge, which the whole app layout renders. */
function revalidateApp() {
  revalidatePath("/app", "layout");
}

export async function createSplitGroup(
  input: CreateSplitGroupInput,
): Promise<ActionResult<{ id: string; added: AddedPerson[] }>> {
  const user = await requireUser();
  return runAction(
    "createSplitGroup",
    async () => {
      const { id, added } = await split.createGroup(user, input);
      revalidateSplit();
      return { id, added };
    },
    { userId: user.id },
  );
}

export async function updateSplitGroup(
  groupId: string,
  input: UpdateSplitGroupInput,
): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(
    "updateSplitGroup",
    async () => {
      await split.updateGroup(user.id, groupId, input);
      revalidateSplit();
      return {};
    },
    { userId: user.id, groupId },
  );
}

export async function deleteSplitGroup(groupId: string): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(
    "deleteSplitGroup",
    async () => {
      await split.deleteGroup(user.id, groupId);
      revalidateApp();
      return {};
    },
    { userId: user.id, groupId },
  );
}

export async function addSplitMembers(
  groupId: string,
  input: AddSplitMembersInput,
): Promise<ActionResult<{ added: AddedPerson[] }>> {
  const user = await requireUser();
  return runAction(
    "addSplitMembers",
    async () => {
      const { added } = await split.addMembers(user.id, groupId, input);
      revalidateSplit();
      return { added };
    },
    { userId: user.id, groupId },
  );
}

export async function removeSplitMember(groupId: string, memberId: string): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(
    "removeSplitMember",
    async () => {
      await split.removeMember(user.id, groupId, memberId);
      revalidateSplit();
      return {};
    },
    { userId: user.id, groupId, memberId },
  );
}

export async function leaveSplitGroup(groupId: string): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(
    "leaveSplitGroup",
    async () => {
      await split.leaveGroup(user.id, groupId);
      revalidateSplit();
      return {};
    },
    { userId: user.id, groupId },
  );
}

export async function acceptSplitInvitation(
  memberId: string,
): Promise<ActionResult<{ groupId: string }>> {
  const user = await requireUser();
  return runAction(
    "acceptSplitInvitation",
    async () => {
      const { groupId } = await split.acceptInvitation(user, memberId);
      revalidateApp();
      return { groupId };
    },
    { userId: user.id, memberId },
  );
}

export async function declineSplitInvitation(memberId: string): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(
    "declineSplitInvitation",
    async () => {
      await split.declineInvitation(user, memberId);
      revalidateApp();
      return {};
    },
    { userId: user.id, memberId },
  );
}

/** Read-only: the next page of a group's expenses, for "Show more". */
export async function loadSplitExpenses(
  groupId: string,
  offset: number,
): Promise<ActionResult<{ items: SplitExpenseView[]; total: number; currency: string }>> {
  const user = await requireUser();
  return runAction(
    "loadSplitExpenses",
    async () => {
      const safeOffset = Number.isSafeInteger(offset) && offset > 0 ? offset : 0;
      return ledger.listExpenses(user.id, groupId, { limit: SPLIT_EXPENSES_PAGE, offset: safeOffset });
    },
    { userId: user.id, groupId },
  );
}

/** Read-only: the next page of a group's payments, for "Show more". */
export async function loadSplitSettlements(
  groupId: string,
  offset: number,
): Promise<ActionResult<{ items: SplitSettlementView[]; total: number; currency: string }>> {
  const user = await requireUser();
  return runAction(
    "loadSplitSettlements",
    async () => {
      const safeOffset = Number.isSafeInteger(offset) && offset > 0 ? offset : 0;
      return ledger.listSettlements(user.id, groupId, { limit: SPLIT_PAYMENTS_PAGE, offset: safeOffset });
    },
    { userId: user.id, groupId },
  );
}

/** Read-only: the next page of the caller's invitations, for "Show more". */
export async function loadSplitInvitations(
  offset: number,
): Promise<ActionResult<{ items: SplitInvitation[]; total: number }>> {
  const user = await requireUser();
  return runAction(
    "loadSplitInvitations",
    async () => {
      const safeOffset = Number.isSafeInteger(offset) && offset > 0 ? offset : 0;
      return split.listInvitations(user, { limit: split.SPLIT_INVITATIONS_PAGE, offset: safeOffset });
    },
    { userId: user.id },
  );
}

export async function createSplitExpense(
  groupId: string,
  input: SplitExpenseInput,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  return runAction(
    "createSplitExpense",
    async () => {
      const { id } = await ledger.createExpense(user.id, groupId, input);
      revalidateSplit();
      return { id };
    },
    { userId: user.id, groupId },
  );
}

export async function updateSplitExpense(
  groupId: string,
  expenseId: string,
  input: SplitExpenseInput,
): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(
    "updateSplitExpense",
    async () => {
      await ledger.updateExpense(user.id, groupId, expenseId, input);
      revalidateSplit();
      return {};
    },
    { userId: user.id, groupId, expenseId },
  );
}

export async function deleteSplitExpense(groupId: string, expenseId: string): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(
    "deleteSplitExpense",
    async () => {
      await ledger.deleteExpense(user.id, groupId, expenseId);
      revalidateSplit();
      return {};
    },
    { userId: user.id, groupId, expenseId },
  );
}

export async function recordSplitSettlement(
  groupId: string,
  input: SplitSettlementInput,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  return runAction(
    "recordSplitSettlement",
    async () => {
      const { id } = await ledger.recordSettlement(user.id, groupId, input);
      revalidateSplit();
      return { id };
    },
    { userId: user.id, groupId },
  );
}

export async function deleteSplitSettlement(
  groupId: string,
  settlementId: string,
): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(
    "deleteSplitSettlement",
    async () => {
      await ledger.deleteSettlement(user.id, groupId, settlementId);
      revalidateSplit();
      return {};
    },
    { userId: user.id, groupId, settlementId },
  );
}

/** Join from an invite link (`/invite/split/<token>`) — bound to the invited email. */
export async function acceptSplitInvite(token: string): Promise<ActionResult<{ groupId: string }>> {
  const user = await requireUser();
  return runAction(
    "acceptSplitInvite",
    async () => {
      const { groupId } = await invites.acceptSplitInviteByToken(user, token);
      revalidateApp();
      return { groupId };
    },
    { userId: user.id },
  );
}

/** Put your share of an expense in the current workspace, as one expense. */
export async function addSplitShareToWorkspace(
  groupId: string,
  expenseId: string,
  input: AddSplitShareToWorkspaceInput,
): Promise<ActionResult<{ transactionId: string }>> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "addSplitShareToWorkspace",
    async () => {
      const { transactionId } = await ledger.addShareToWorkspace(
        user.id,
        { id: workspace.id, currency: workspace.currency, locale: workspace.locale },
        groupId,
        expenseId,
        input,
      );
      // The tracker and the transaction list now hold one more row.
      revalidateApp();
      return { transactionId };
    },
    { userId: user.id, workspaceId: workspace.id, groupId, expenseId },
  );
}

/** The expense changed since you added your share: bring your workspace entry in line. */
export async function updateSplitWorkspaceEntry(
  groupId: string,
  expenseId: string,
  input: UpdateSplitWorkspaceEntryInput,
): Promise<ActionResult<{ transactionId: string }>> {
  const user = await requireUser();
  return runAction(
    "updateSplitWorkspaceEntry",
    async () => {
      const { transactionId } = await ledger.updateWorkspaceEntry(user.id, groupId, expenseId, input);
      revalidateApp();
      return { transactionId };
    },
    { userId: user.id, groupId, expenseId },
  );
}

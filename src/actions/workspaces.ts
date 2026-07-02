"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/action-result";
import * as ws from "@/services/workspaces";
import type { AddMemberInput } from "@/lib/validation";

function revalidateApp() {
  revalidatePath("/app");
  revalidatePath("/transactions");
  revalidatePath("/analytics");
  revalidatePath("/settings");
}

export async function createWorkspace(name: string): Promise<ActionResult<{ id?: string }>> {
  const user = await requireUser();
  return runAction(
    "createWorkspace",
    async () => {
      const created = await ws.createWorkspace(user.id, { name });
      revalidateApp();
      return { id: created.id };
    },
    { userId: user.id },
  );
}

export async function renameWorkspace(id: string, name: string): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(
    "renameWorkspace",
    async () => {
      await ws.renameWorkspace(user.id, id, name);
      revalidateApp();
      return {};
    },
    { userId: user.id, workspaceId: id },
  );
}

export async function switchWorkspace(id: string): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(
    "switchWorkspace",
    async () => {
      await ws.switchWorkspace(user.id, id);
      revalidateApp();
      return {};
    },
    { userId: user.id, workspaceId: id },
  );
}

export async function addWorkspaceMember(
  workspaceId: string,
  input: AddMemberInput,
): Promise<ActionResult<{ status?: "added" | "invited" }>> {
  const user = await requireUser();
  return runAction(
    "addWorkspaceMember",
    async () => {
      const result = await ws.addMember(user.id, workspaceId, input);
      revalidatePath("/settings");
      return { status: result.status };
    },
    { userId: user.id, workspaceId, profileId: input.profileId ?? null },
  );
}

export async function updateWorkspaceMemberRole(
  workspaceId: string,
  memberId: string,
  role: string,
): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(
    "updateWorkspaceMemberRole",
    async () => {
      await ws.updateMemberRole(user.id, workspaceId, { userId: memberId, role });
      revalidatePath("/settings");
      return {};
    },
    { userId: user.id, workspaceId, memberId },
  );
}

export async function removeWorkspaceMember(
  workspaceId: string,
  memberId: string,
): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(
    "removeWorkspaceMember",
    async () => {
      await ws.removeMember(user.id, workspaceId, memberId);
      revalidateApp();
      return {};
    },
    { userId: user.id, workspaceId, memberId },
  );
}

export async function cancelWorkspaceInvite(inviteId: string): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(
    "cancelWorkspaceInvite",
    async () => {
      await ws.cancelInvite(user.id, inviteId);
      revalidatePath("/settings");
      return {};
    },
    { userId: user.id, inviteId },
  );
}

export async function removeProfileAccess(
  profileId: string,
  targetUserId: string,
): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(
    "removeProfileAccess",
    async () => {
      await ws.removeProfileAccess(user.id, profileId, targetUserId);
      revalidatePath("/settings");
      return {};
    },
    { userId: user.id, profileId, memberId: targetUserId },
  );
}

"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/action-result";
import * as ws from "@/services/workspaces";
import type {
  AddMemberInput,
  AccessGrant,
  UpdateWorkspaceInput,
  WorkspaceCurrencyInput,
} from "@/lib/validation";

function revalidateApp() {
  revalidatePath("/app");
  revalidatePath("/transactions");
  revalidatePath("/analytics");
  revalidatePath("/settings");
}

export async function createWorkspace(
  name: string,
  icon?: string,
): Promise<ActionResult<{ id?: string }>> {
  const user = await requireUser();
  return runAction(
    "createWorkspace",
    async () => {
      const created = await ws.createWorkspace(user.id, { name, icon });
      revalidateApp();
      return { id: created.id };
    },
    { userId: user.id },
  );
}

/** Update a workspace's name + emoji icon (admin only). */
export async function updateWorkspace(
  id: string,
  input: UpdateWorkspaceInput,
): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(
    "updateWorkspace",
    async () => {
      await ws.updateWorkspace(user.id, id, input);
      revalidateApp();
      return {};
    },
    { userId: user.id, workspaceId: id },
  );
}

/** Set a workspace's currency + number format (admin only). */
export async function updateWorkspaceCurrency(
  workspaceId: string,
  input: WorkspaceCurrencyInput,
): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(
    "updateWorkspaceCurrency",
    async () => {
      await ws.updateWorkspaceCurrency(user.id, workspaceId, input);
      revalidateApp();
      return {};
    },
    { userId: user.id, workspaceId },
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
      revalidateApp();
      return { status: result.status };
    },
    { userId: user.id, workspaceId },
  );
}

/** Re-scope a registered member's access (all profiles or a chosen set). */
export async function setMemberAccess(
  workspaceId: string,
  memberId: string,
  access: AccessGrant,
): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(
    "setMemberAccess",
    async () => {
      await ws.setMemberAccess(user.id, workspaceId, { userId: memberId, access });
      revalidateApp();
      return {};
    },
    { userId: user.id, workspaceId, memberId },
  );
}

/** Re-scope a pending invite (keyed by email). */
export async function setInviteAccess(
  workspaceId: string,
  email: string,
  access: AccessGrant,
): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(
    "setInviteAccess",
    async () => {
      await ws.setInviteAccess(user.id, workspaceId, { email, access });
      revalidatePath("/settings");
      return {};
    },
    { userId: user.id, workspaceId },
  );
}

export async function removeCollaborator(
  workspaceId: string,
  memberId: string,
): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(
    "removeCollaborator",
    async () => {
      await ws.removeCollaborator(user.id, workspaceId, memberId);
      revalidateApp();
      return {};
    },
    { userId: user.id, workspaceId, memberId },
  );
}

export async function cancelWorkspaceInvite(
  workspaceId: string,
  email: string,
): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(
    "cancelWorkspaceInvite",
    async () => {
      await ws.cancelInviteByEmail(user.id, workspaceId, email);
      revalidatePath("/settings");
      return {};
    },
    { userId: user.id, workspaceId },
  );
}

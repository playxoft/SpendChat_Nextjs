"use server";

import { revalidatePath } from "next/cache";
import { getCurrentWorkspace, requireUser } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/action-result";
import * as spaceService from "@/services/spaces";
import type { SpaceAccess } from "@/services/spaces";
import type {
  CreateSpaceInput,
  DeleteSpaceInput,
  SetProfileOverrideInput,
  SetSpaceMemberInput,
  UpdateSpaceInput,
} from "@/lib/validation";

/** Spaces shape the sidebar and every page's profile list, so refresh them all. */
function revalidateApp() {
  revalidatePath("/app", "layout");
}

export async function createSpace(input: CreateSpaceInput): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "createSpace",
    async () => {
      const space = await spaceService.createSpace(user.id, workspace.id, input);
      revalidateApp();
      return { id: space.id };
    },
    { userId: user.id, workspaceId: workspace.id },
  );
}

export async function updateSpace(id: string, input: UpdateSpaceInput): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(
    "updateSpace",
    async () => {
      await spaceService.updateSpace(user.id, id, input);
      revalidateApp();
      return {};
    },
    { userId: user.id, spaceId: id },
  );
}

export async function reorderSpaces(ids: string[]): Promise<ActionResult> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "reorderSpaces",
    async () => {
      await spaceService.reorderSpaces(user.id, workspace.id, { ids });
      revalidateApp();
      return {};
    },
    { userId: user.id, workspaceId: workspace.id },
  );
}

export async function deleteSpace(id: string, input: DeleteSpaceInput = {}): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(
    "deleteSpace",
    async () => {
      await spaceService.deleteSpace(user.id, id, input);
      revalidateApp();
      return {};
    },
    { userId: user.id, spaceId: id, movedTo: input.moveProfilesTo },
  );
}

export async function moveProfileToSpace(profileId: string, spaceId: string): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(
    "moveProfileToSpace",
    async () => {
      await spaceService.moveProfileToSpace(user.id, profileId, { spaceId });
      revalidateApp();
      return {};
    },
    { userId: user.id, profileId, spaceId },
  );
}

/** What the space's "Members & access" dialog shows (admin). */
export async function getSpaceAccess(id: string): Promise<ActionResult<{ access: SpaceAccess }>> {
  const user = await requireUser();
  return runAction(
    "getSpaceAccess",
    async () => ({ access: await spaceService.getSpaceAccess(user.id, id) }),
    { userId: user.id, rateLimit: "read", spaceId: id },
  );
}

export async function setSpaceMember(id: string, input: SetSpaceMemberInput): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(
    "setSpaceMember",
    async () => {
      await spaceService.setSpaceMember(user.id, id, input);
      revalidateApp();
      return {};
    },
    { userId: user.id, spaceId: id, memberId: input.userId, role: input.role },
  );
}

export async function setProfileOverride(
  profileId: string,
  input: SetProfileOverrideInput,
): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(
    "setProfileOverride",
    async () => {
      await spaceService.setProfileOverride(user.id, profileId, input);
      revalidateApp();
      return {};
    },
    { userId: user.id, profileId, memberId: input.userId, access: input.access },
  );
}

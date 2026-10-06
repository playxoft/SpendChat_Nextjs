import "server-only";
import { z } from "zod";
import { validationError } from "@/lib/errors";
import { requireSpaceInWorkspace } from "@/lib/workspaces";

/**
 * Resolve a `/spaces/{id}` path id against the current workspace (the one
 * `X-Workspace-Id` picked): 422 for a malformed id, 404 for a space that
 * isn't in it — including one in another of the caller's workspaces, the same
 * scoping the single-transaction endpoints use. The services then check the
 * caller's role on the space.
 */
export async function spaceInCurrentWorkspace(workspaceId: string, id: string): Promise<string> {
  if (!z.string().uuid().safeParse(id).success) throw validationError("Invalid space");
  return requireSpaceInWorkspace(workspaceId, id);
}

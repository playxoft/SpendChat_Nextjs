import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { profiles, tags, transactions } from "@/db/schema";
import { conflict, validationError } from "@/lib/errors";
import { parseOrThrow, withId } from "@/lib/api-response";
import {
  TAGS_PER_WORKSPACE_MAX,
  createTxnTagSchema,
  updateTxnTagSchema,
} from "@/lib/validation";
import { requireWorkspaceRole } from "@/lib/workspaces";
import type { Tag } from "@/db/schema";

/**
 * Transaction-tag business logic, shared by the web actions (`src/actions/tags`)
 * and the REST API (`src/app/api/v1/tags`).
 *
 * Tags are workspace-scoped, exactly like categories: everyone in a workspace
 * shares one list, reads need workspace access (already checked upstream when
 * the workspace was resolved) and writes need the editor role. `userId` on a
 * write is the author, never the access key.
 *
 * The one thing this file does that `services/categories.ts` doesn't is sweep
 * `transactions.tag_ids` on delete. That column carries no foreign key — it is a
 * `uuid[]`, chosen so a tag filter stays a predicate on `transactions` alone —
 * so nothing in the database detaches a deleted tag for us.
 */

const DUPLICATE = "A tag with that name already exists";

/** List the workspace's tags, by name. The order the picker and the settings
 *  manager both render in, so neither has to sort. */
export async function listTags(workspaceId: string): Promise<Tag[]> {
  const db = getDb();
  return db
    .select()
    .from(tags)
    .where(eq(tags.workspaceId, workspaceId))
    .orderBy(asc(tags.name));
}

/**
 * Reject a create that would push the workspace past its tag ceiling.
 *
 * The cap exists so an import or a runaway client can't turn the picker into a
 * thousand-row list nobody can use. Checked before the insert rather than
 * enforced in the database, because the message is the useful part.
 */
async function assertRoomForAnotherTag(workspaceId: string): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tags)
    .where(eq(tags.workspaceId, workspaceId));
  if ((row?.count ?? 0) >= TAGS_PER_WORKSPACE_MAX) {
    throw conflict(`This workspace already has ${TAGS_PER_WORKSPACE_MAX} tags`);
  }
}

export async function createTag(
  userId: string,
  workspaceId: string,
  input: unknown,
): Promise<Tag> {
  const data = parseOrThrow(createTxnTagSchema, input);
  await requireWorkspaceRole(userId, workspaceId, "editor");
  await assertRoomForAnotherTag(workspaceId);
  const db = getDb();
  try {
    const [row] = await db
      .insert(tags)
      .values({
        userId,
        workspaceId,
        name: data.name,
        // Lowercased on the way in so `#EF4444` and `#ef4444` are one value and
        // the chip's alpha suffixes (`${color}1a`) are built from a known shape.
        color: data.color.toLowerCase(),
      })
      .returning();
    return row!;
  } catch {
    // The only constraint on this insert is `tags_workspace_name_uq`.
    throw conflict(DUPLICATE);
  }
}

/**
 * Rename or recolor a tag. Every transaction carrying it updates at once — that
 * is the point of tags being entities rather than free text.
 *
 * Returns the row, or null when none matched in this workspace.
 */
export async function updateTag(
  userId: string,
  workspaceId: string,
  id: string,
  input: unknown,
): Promise<Tag | null> {
  const data = parseOrThrow(updateTxnTagSchema, withId(input, id));
  await requireWorkspaceRole(userId, workspaceId, "editor");

  const patch: Record<string, unknown> = {};
  if (data.name !== undefined) patch.name = data.name;
  if (data.color !== undefined) patch.color = data.color.toLowerCase();
  // Nothing to change is a client bug, not a no-op to absorb: without this the
  // call would bump `updated_at` and report success having done nothing.
  if (Object.keys(patch).length === 0) throw validationError("Nothing to update");
  patch.updatedAt = new Date();

  const db = getDb();
  try {
    const rows = await db
      .update(tags)
      .set(patch)
      .where(and(eq(tags.id, data.id), eq(tags.workspaceId, workspaceId)))
      .returning();
    return rows[0] ?? null;
  } catch {
    throw conflict(DUPLICATE);
  }
}

/**
 * Delete a tag and detach it from every transaction in the workspace.
 *
 * Both statements run in one database transaction. They are only safe together:
 * the row going without the sweep leaves ids in `tag_ids` that resolve to
 * nothing (the embed drops them, so they are invisible *and* unremovable), and
 * the sweep going without the row leaves a tag nothing can reach. A failure
 * between the two is exactly the shape a past review caught on profile
 * deletion — two destructive statements outside a transaction — so they are
 * written as one here.
 *
 * Returns whether a row was removed. Throws for a non-UUID id.
 */
export async function deleteTag(
  userId: string,
  workspaceId: string,
  id: string,
): Promise<boolean> {
  if (!z.string().uuid().safeParse(id).success) {
    throw validationError("Invalid tag");
  }
  await requireWorkspaceRole(userId, workspaceId, "editor");
  const db = getDb();

  return db.transaction(async (tx) => {
    const deleted = await tx
      .delete(tags)
      .where(and(eq(tags.id, id), eq(tags.workspaceId, workspaceId)))
      .returning({ id: tags.id });
    if (deleted.length === 0) return false;

    // Scoped to this workspace's profiles, and to rows that actually carry the
    // id — the GIN index on `tag_ids` serves the `= any(...)` test, so this
    // touches only the transactions that need rewriting rather than the table.
    await tx
      .update(transactions)
      .set({ tagIds: sql`array_remove(${transactions.tagIds}, ${id}::uuid)` })
      .where(
        and(
          inArray(
            transactions.profileId,
            tx.select({ id: profiles.id }).from(profiles).where(eq(profiles.workspaceId, workspaceId)),
          ),
          sql`${id}::uuid = any(${transactions.tagIds})`,
        ),
      );
    return true;
  });
}

/**
 * How many transactions in the workspace carry this tag — the "used on N
 * transactions" line the settings manager and the delete confirmation show, so
 * deleting a tag is never a guess about what it will detach.
 */
export async function countTransactionsForTag(
  workspaceId: string,
  tagId: string,
): Promise<number> {
  if (!z.string().uuid().safeParse(tagId).success) return 0;
  const db = getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(transactions)
    .innerJoin(profiles, eq(transactions.profileId, profiles.id))
    .where(
      and(
        eq(profiles.workspaceId, workspaceId),
        sql`${tagId}::uuid = any(${transactions.tagIds})`,
      ),
    );
  return row?.count ?? 0;
}

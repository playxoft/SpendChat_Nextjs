import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { profiles, tags, transactions } from "@/db/schema";
import { conflict, isUniqueViolation, validationError } from "@/lib/errors";
import { parseOrThrow, withId } from "@/lib/api-response";
import {
  TAGS_PER_WORKSPACE_MAX,
  createTxnTagSchema,
  updateTxnTagSchema,
} from "@/lib/validation";
import { requireWorkspaceRole } from "@/lib/workspaces";
import type { Tag } from "@/db/schema";

/**
 * Transaction-tag business logic.
 *
 * The exports carry a `TxnTag` prefix rather than the bare `createTag` /
 * `updateTag` / `deleteTag` the entity would suggest, because `services/files.ts`
 * already owns those three names for the vault's per-profile tags. Same reason
 * `lib/tags.ts` exports `TxnTagDTO` instead of `TagDTO`: two different entities
 * in two different tables, and the file that ends up importing both shouldn't
 * have to alias one.
 *
 * Nothing calls it yet — the server actions and
 * the `/api/v1/tags` routes land with the tag UI in the next change; this is the
 * layer they will both sit on, written first so the schema and the access rules
 * are settled before anything depends on them.
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
export async function listTxnTags(workspaceId: string): Promise<Tag[]> {
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

export async function createTxnTag(
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
  } catch (err) {
    // Only a unique violation means "that name is taken" — anything else (a
    // dropped connection, a statement timeout, a value the column can't hold)
    // has to keep its identity, or the user is told their tag name is a
    // duplicate while the real failure never reaches the logs.
    if (isUniqueViolation(err)) throw conflict(DUPLICATE);
    throw err;
  }
}

/**
 * Rename or recolor a tag. Every transaction carrying it updates at once — that
 * is the point of tags being entities rather than free text.
 *
 * Returns the row, or null when none matched in this workspace.
 */
export async function updateTxnTag(
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
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict(DUPLICATE);
    throw err;
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
 * What the transaction does *not* buy, under READ COMMITTED: a concurrent
 * create that resolved this tag id through `workspaceTagIds` before the delete
 * committed can still insert it after the sweep has passed, leaving an id that
 * resolves to nothing. That is harmless — the read path drops unresolvable ids
 * — and it self-heals the next time the row's tags are set. Locking the whole
 * workspace's transactions to close it would cost far more than it is worth.
 *
 * Returns whether a row was removed. Throws for a non-UUID id.
 */
export async function deleteTxnTag(
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
    // id. The predicate is `@> array[id]`, not `id = any(tag_ids)`: GIN's
    // `array_ops` implements `&&`, `@>` and `<@`, and nothing transforms a
    // `scalar = ANY(column)` into one of them — measured on Postgres 18.6 with
    // `enable_seqscan = off`, the `= any` form has no index path at all (the
    // planner keeps the sequential scan and marks it disabled) while `@>` takes
    // a Bitmap Index Scan. The two read the same; only one uses the index.
    await tx
      .update(transactions)
      .set({ tagIds: sql`array_remove(${transactions.tagIds}, ${id}::uuid)` })
      .where(
        and(
          inArray(
            transactions.profileId,
            tx.select({ id: profiles.id }).from(profiles).where(eq(profiles.workspaceId, workspaceId)),
          ),
          sql`${transactions.tagIds} @> array[${id}::uuid]`,
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
export async function countTransactionsForTxnTag(
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
        // `@>`, not `= any(...)` — see the sweep in `deleteTxnTag`. This one backs
        // an interactive read (the "used on N transactions" line), so a
        // sequential scan of the workspace would be felt directly.
        sql`${transactions.tagIds} @> array[${tagId}::uuid]`,
      ),
    );
  return row?.count ?? 0;
}

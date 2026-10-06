import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { getWorkspaceEntitlements } from "@/lib/entitlements";
import { categories, profiles, tags, transactionAttachments, transactions } from "@/db/schema";
import { ensureBootstrap } from "@/lib/auth";
import { badRequest, forbidden, validationError } from "@/lib/errors";
import { toMinorUnits } from "@/lib/money";
import {
  forgetAccessibleProfiles,
  getTransactionById,
  getTransactionsByIds,
  type TransactionRow,
} from "@/lib/queries";
import { notTrashed } from "@/lib/trash-scope";
import { planBulkEdit, type BulkChange } from "@/lib/bulk-edit";
import { setLogContext } from "@/lib/log-context";
import { scheduleBudgetCheck } from "@/services/budget-alerts";
import { logger } from "@/lib/logger";
import { time } from "@/lib/timing";
import { parseOrThrow, withId } from "@/lib/api-response";
import { rolesAtLeast } from "@/lib/rbac";
import {
  accessibleProfileIds,
  getDefaultSpaceId,
  getEffectiveProfileRole,
  readOnlyWorkspaceError,
  getWorkspaceMoneyFormat,
  getWorkspaceRole,
  requireProfileRole,
} from "@/lib/workspaces";
import {
  TAGS_PER_TRANSACTION_MAX,
  transactionInputSchema,
  updateTransactionSchema,
  bulkTransactionsSchema,
  setTransactionTagsSchema,
  bulkDeleteTransactionsSchema,
  bulkUpdateTransactionsSchema,
} from "@/lib/validation";
import type { BulkDraft } from "@/lib/bulk-parser";
import { z } from "zod";

/**
 * Transaction business logic, shared by the web server actions (`src/actions`)
 * and the mobile REST API (`src/app/api/v1`). RBAC is per profile: writing a
 * transaction requires the editor role on its profile (workspace-wide or via
 * a profile grant); reads are the viewer role. `transactions.user_id` records
 * the author, not access.
 */

/**
 * Narrow submitted tag ids to the ones that actually exist in this workspace.
 *
 * The tag analogue of `workspaceCategoryId` below, and it drops rather than
 * rejects for the same reason: an id the caller shouldn't have is a stale
 * client cache or a tag someone else just deleted, and failing the whole write
 * over it would lose the transaction the user was trying to save. What must
 * never happen is storing it — `tag_ids` has no foreign key, so an id that got
 * in would sit there unresolvable.
 *
 * Returns the ids in the order the caller sent them, so the chips keep the order
 * the user picked. An empty input short-circuits without a query.
 */
async function workspaceTagIds(workspaceId: string, tagIds?: string[]): Promise<string[]> {
  if (!tagIds?.length) return [];
  const db = getDb();
  const rows = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.workspaceId, workspaceId), inArray(tags.id, tagIds)));
  const allowed = new Set(rows.map((r) => r.id));
  return tagIds.filter((id) => allowed.has(id));
}

/** Confirm a category id belongs to this workspace; returns null otherwise. */
async function workspaceCategoryId(workspaceId: string, categoryId?: string | null) {
  if (!categoryId) return null;
  const db = getDb();
  const cat = await db.query.categories.findFirst({
    where: and(eq(categories.id, categoryId), eq(categories.workspaceId, workspaceId)),
    columns: { id: true },
  });
  return cat?.id ?? null;
}

/** Profile ids in the workspace the user can write to (editor or admin). */
async function writableProfileIds(userId: string, workspaceId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(inArray(profiles.id, accessibleProfileIds(userId, workspaceId, "editor")))
    .orderBy(asc(profiles.sortOrder), asc(profiles.createdAt));
  return rows.map((r) => r.id);
}

/**
 * Resolve the profile a new transaction lands in: the requested profile when
 * the user can write to it (and it's in this workspace), else the first
 * writable profile. A workspace admin with no profiles at all gets the
 * default "Personal" recreated (self-heal); anyone else gets a 403.
 */
async function resolveProfileId(
  userId: string,
  workspaceId: string,
  profileId?: string | null,
): Promise<string> {
  const writable = await writableProfileIds(userId, workspaceId);
  if (profileId && writable.includes(profileId)) return profileId;
  if (writable[0]) return writable[0];

  const role = await getWorkspaceRole(userId, workspaceId);
  // Nothing writable may mean the workspace is view-only (an extra free
  // workspace) — then say so, and never self-heal a
  // profile into it.
  const { readOnly } = await getWorkspaceEntitlements(workspaceId);
  if (readOnly) throw readOnlyWorkspaceError();
  if (role === "admin") {
    const db = getDb();
    const spaceId = await getDefaultSpaceId(workspaceId);
    const [row] = await db
      .insert(profiles)
      .values({ userId, workspaceId, spaceId, name: "Personal", icon: "👤", sortOrder: 0 })
      .onConflictDoNothing()
      .returning({ id: profiles.id });
    if (row) {
      // This request may already have memoized "the profiles you can see", and
      // it no longer includes all of them — the read-back below would then miss
      // the row we're about to write.
      forgetAccessibleProfiles(userId, workspaceId);
      return row.id;
    }
  }
  throw forbidden("You don't have permission to add transactions in this workspace");
}

/** Pick the title, accepting the deprecated `note` alias. */
function pickTitle(data: { title?: string; note?: string }): string | null {
  const t = (data.title ?? "").trim() || (data.note ?? "").trim();
  return t ? t : null;
}

/** Currency + number format for the write, passed in by callers that already
 *  hold the workspace (avoids a re-select) or fetched from the workspace. */
type MoneyFormat = { currency: string; locale: string };

/**
 * Insert a transaction and return its id — the shared core of the create path.
 * The web send only needs the id (its optimistic UI keys off it to retire the
 * ghost bubble), so it calls this directly and skips the joined re-read that
 * `createTransaction` does.
 *
 * Two deliberate omissions keep the hot path short:
 *  - No `ensureBootstrap`: every caller resolves the workspace first
 *    (`getCurrentWorkspace` / `getApiContext`), which already bootstraps a
 *    first-time user — repeating it here was an insert+select of pure latency.
 *  - `money` is passed in when the caller has the workspace in hand, saving the
 *    `getWorkspaceMoneyFormat` round-trip; it's only fetched as a fallback.
 */
export async function createTransactionId(
  userId: string,
  workspaceId: string,
  input: unknown,
  money?: MoneyFormat,
): Promise<{ id: string }> {
  const data = await time("createTransaction.validate", async () =>
    parseOrThrow(transactionInputSchema, input),
  );
  const fmt =
    money ??
    (await time("createTransaction.moneyFormat", () => getWorkspaceMoneyFormat(workspaceId)));
  // Category validation and profile resolution touch different tables and don't
  // depend on each other — run them in one round-trip instead of two.
  const [categoryId, profileId, tagIds] = await Promise.all([
    time("createTransaction.categoryLookup", () =>
      workspaceCategoryId(workspaceId, data.categoryId),
    ),
    time("createTransaction.resolveProfile", () =>
      resolveProfileId(userId, workspaceId, data.profileId),
    ),
    // Folded into the same round-trip as the two above rather than awaited
    // after them: it touches a different table and depends on neither, so it
    // costs nothing here and a serial await would have put a whole round-trip
    // on the send path.
    time("createTransaction.tagLookup", () => workspaceTagIds(workspaceId, data.tagIds)),
  ]);
  setLogContext({ profileId }); // log lines for this write carry the resolved profile

  const db = getDb();
  const [row] = await time("createTransaction.insert", () =>
    db
      .insert(transactions)
      .values({
        userId,
        type: data.type,
        amountMinor: toMinorUnits(data.amount, fmt.currency, fmt.locale),
        categoryId,
        profileId,
        title: pickTitle(data),
        description: data.description?.trim() ? data.description.trim() : null,
        occurredOn: data.occurredOn,
        tagIds,
      })
      .returning({ id: transactions.id }),
  );
  // After the response, not now — a crossing emails without slowing the send.
  if (data.type === "expense") {
    scheduleBudgetCheck({ workspaceId, userId, dates: [data.occurredOn] });
  }
  return { id: row!.id };
}

/**
 * Create a transaction and return the full joined row (category/profile/author +
 * attachments). Used by the mobile API, which serializes the row in its
 * response; the web path uses `createTransactionId` to skip this extra read.
 * Throws on invalid input.
 */
export async function createTransaction(
  userId: string,
  workspaceId: string,
  input: unknown,
  money?: MoneyFormat,
): Promise<TransactionRow> {
  const { id } = await createTransactionId(userId, workspaceId, input, money);
  const created = await time("createTransaction.readCreated", () =>
    getTransactionById(userId, workspaceId, id),
  );
  // We just wrote it into a profile this user can reach, so a miss means the
  // read's scoping disagrees with the write's. Say that, rather than handing a
  // null down the serializer and failing somewhere unrelated. The id stays out
  // of the message — it's interpolated into the log line — and goes in `meta`.
  if (!created) {
    logger.error("A transaction was written but could not be read back", {
      event: "transaction.write_read_mismatch",
      transactionId: id,
    });
    throw new Error("Transaction was written but is not readable back");
  }
  return created;
}

/**
 * Editor-or-better access to the profile of an existing transaction, scoped to
 * the current workspace: a transaction living in one of the user's *other*
 * workspaces resolves to null (callers 404), matching the read scoping — the
 * `X-Workspace-Id` a client sends always bounds what single-row ops can touch.
 */
async function editableInWorkspace(
  userId: string,
  workspaceId: string,
  profileId: string,
): Promise<boolean> {
  const access = await getEffectiveProfileRole(userId, profileId);
  if (!access || access.workspaceId !== workspaceId) return false;
  if (!rolesAtLeast("editor").includes(access.role)) {
    if (access.readOnly) throw readOnlyWorkspaceError();
    throw forbidden("You don't have permission to do that");
  }
  setLogContext({ profileId }); // the profile this single-row op touches
  return true;
}

/**
 * Update a transaction the user can edit in the current workspace. Returns the
 * updated row, or `null` when no row matched (including a row that lives in
 * another workspace) — callers surface that as a 404 / "not found" error.
 * Throws on invalid input or a viewer role.
 */
export async function updateTransaction(
  userId: string,
  workspaceId: string,
  id: string,
  input: unknown,
): Promise<TransactionRow | null> {
  const data = parseOrThrow(updateTransactionSchema, withId(input, id));
  const db = getDb();

  // A row in the trash can't be edited — it reads as absent until restored.
  const existing = await db.query.transactions.findFirst({
    where: and(eq(transactions.id, data.id), notTrashed(transactions)),
    columns: { id: true, profileId: true },
  });
  if (!existing) return null;
  if (!(await editableInWorkspace(userId, workspaceId, existing.profileId))) return null;

  const money = await getWorkspaceMoneyFormat(workspaceId);
  const categoryId = await workspaceCategoryId(workspaceId, data.categoryId);
  // Moving to another profile requires editor there too (same workspace).
  let profileId = existing.profileId;
  if (data.profileId && data.profileId !== existing.profileId) {
    const target = await requireProfileRole(userId, data.profileId, "editor");
    if (target.workspaceId !== workspaceId) throw validationError("Invalid profile");
    profileId = data.profileId;
  }

  const patch = {
    type: data.type,
    amountMinor: toMinorUnits(data.amount, money.currency, money.locale),
    categoryId,
    profileId,
    title: pickTitle(data),
    description: data.description?.trim() ? data.description.trim() : null,
    occurredOn: data.occurredOn,
    updatedAt: new Date(),
    // Absent means "leave the tags alone", which is why `tagIds` is optional in
    // the schema and not defaulted to `[]`. A PATCH that only moves the date
    // must not silently strip a row's tags, and the mobile client sends partial
    // updates. Clearing them is `tagIds: []`, explicitly.
    ...(data.tagIds === undefined
      ? {}
      : { tagIds: await workspaceTagIds(workspaceId, data.tagIds) }),
  };

  if (profileId === existing.profileId) {
    await db.update(transactions).set(patch).where(eq(transactions.id, data.id));
  } else {
    // Re-filing a transaction has to carry its attachments' denormalized
    // `profile_id` with it. That column is what scopes an attachment read, and
    // it is `ON DELETE cascade` — left pointing at the old profile the receipt
    // is invisible against the transaction it belongs to, and is destroyed (row
    // *and* stored object) the moment that old profile is deleted, even though
    // the transaction is alive elsewhere. One transaction so a failure can't
    // commit the move without the receipts.
    await db.transaction(async (tx) => {
      await tx.update(transactions).set(patch).where(eq(transactions.id, data.id));
      await tx
        .update(transactionAttachments)
        .set({ profileId })
        .where(eq(transactionAttachments.transactionId, data.id));
    });
  }
  if (data.type === "expense") {
    scheduleBudgetCheck({ workspaceId, userId, dates: [data.occurredOn] });
  }

  return getTransactionById(userId, workspaceId, data.id);
}

/**
 * Set a transaction's tags, touching nothing else.
 *
 * Its own path rather than a `updateTransaction` call with the other fields
 * echoed back, because every caller that tags a row — the composer's chips, the
 * table cell's picker — holds the tags and nothing else. Routing them through
 * the full update would make them re-send an amount and a date they never
 * touched, and any staleness in those would be written back over a concurrent
 * edit.
 *
 * Same access rule as any other write to the row: editor on its profile, in the
 * current workspace. Returns the updated row, or null when nothing matched.
 */
export async function setTransactionTags(
  userId: string,
  workspaceId: string,
  id: string,
  input: unknown,
): Promise<TransactionRow | null> {
  const data = parseOrThrow(setTransactionTagsSchema, withId(input, id));
  const db = getDb();

  // A row in the trash can't be edited — it reads as absent until restored.
  const existing = await db.query.transactions.findFirst({
    where: and(eq(transactions.id, data.id), notTrashed(transactions)),
    columns: { id: true, profileId: true },
  });
  if (!existing) return null;
  if (!(await editableInWorkspace(userId, workspaceId, existing.profileId))) return null;

  const tagIds = await workspaceTagIds(workspaceId, data.tagIds);
  await db
    .update(transactions)
    .set({ tagIds, updatedAt: new Date() })
    .where(eq(transactions.id, data.id));

  return getTransactionById(userId, workspaceId, data.id);
}

/**
 * Move a transaction to the trash (requires editor on its profile, in the
 * current workspace). Returns whether a row was trashed — false when it doesn't
 * exist, is already in the trash, or lives in another workspace. Throws a
 * validation error for a non-UUID id.
 *
 * Nothing is destroyed: the row is stamped `deleted_at` / `deleted_by` and every
 * read stops seeing it. Its receipts stay as they are — rows and stored bytes —
 * so restoring it (`services/trash.ts`) brings them back, and they keep counting
 * toward storage until the purge or "delete forever" removes them for good,
 * which is where the stored objects are swept now.
 */
export async function deleteTransaction(
  userId: string,
  workspaceId: string,
  id: string,
): Promise<boolean> {
  if (!z.string().uuid().safeParse(id).success) {
    throw validationError("Invalid transaction");
  }
  const db = getDb();
  const existing = await db.query.transactions.findFirst({
    where: and(eq(transactions.id, id), notTrashed(transactions)),
    columns: { id: true, profileId: true },
  });
  if (!existing) return false;
  if (!(await editableInWorkspace(userId, workspaceId, existing.profileId))) return false;

  // Scoped to the profile the access check above approved, not just the id: a
  // row moved into a profile the caller can only view, between that check and
  // this write, is no longer theirs to delete.
  const trashed = await db
    .update(transactions)
    .set({ deletedAt: sql`now()`, deletedBy: userId })
    .where(
      and(
        eq(transactions.id, id),
        eq(transactions.profileId, existing.profileId),
        notTrashed(transactions),
      ),
    )
    .returning({ id: transactions.id });
  if (trashed.length > 0) {
    logger.info("Moved 1 transaction to the trash", { event: "trash.moved", kind: "transaction", count: 1 });
  }
  return trashed.length > 0;
}

/**
 * Move many transactions to the trash at once — the tracker's and the table's
 * multi-select.
 *
 * Same rule as a single delete, per row: editor on its profile, in the current
 * workspace. Rows the caller can't edit (or that don't exist, are already in
 * the trash, or live in another workspace) are left alone and counted in
 * `skipped`; the rest go. One statement, one `now()` — every row of the batch
 * shares its `deleted_at`, which the trash list's keyset cursor handles (ties
 * broken by `id`). Receipts stay with their rows, as in the single delete.
 */
export async function deleteTransactions(
  userId: string,
  workspaceId: string,
  input: unknown,
): Promise<{ deletedIds: string[]; skipped: number }> {
  const ids = [...new Set(parseOrThrow(bulkDeleteTransactionsSchema, input).ids)];
  const writable = await writableProfileIds(userId, workspaceId);
  if (writable.length === 0) throw forbidden("You don't have permission to do that");

  const db = getDb();
  const deletedIds = await db.transaction(async (tx) => {
    // Locked in id order first, whatever plan the update would take: two
    // overlapping bulk operations taking their row locks in different orders is
    // a deadlock (`updateTransactions` does the same). `no key update`: the key
    // never changes, so attachment inserts aren't held off meanwhile.
    const locked = await tx
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          inArray(transactions.id, ids),
          inArray(transactions.profileId, writable),
          notTrashed(transactions),
        ),
      )
      .orderBy(asc(transactions.id))
      .for("no key update");
    if (locked.length === 0) return [];
    const trashed = await tx
      .update(transactions)
      .set({ deletedAt: sql`now()`, deletedBy: userId })
      .where(and(inArray(transactions.id, locked.map((r) => r.id)), notTrashed(transactions)))
      .returning({ id: transactions.id });
    return trashed.map((r) => r.id);
  });
  if (deletedIds.length > 0) {
    logger.info(`Moved ${deletedIds.length} transactions to the trash`, {
      event: "trash.moved",
      kind: "transaction",
      count: deletedIds.length,
    });
  }
  return { deletedIds, skipped: ids.length - deletedIds.length };
}

export type BulkUpdateResult = {
  /** The rows that changed, re-read with their joins for the client to patch in. */
  rows: TransactionRow[];
  /** Rows the caller can't edit here (or that no longer exist). */
  noAccess: number;
  /** Rows of the other kind that kept their category. */
  wrongKind: number;
  /** Rows whose tags were left alone because adding would pass the cap. */
  tagLimit: number;
};

/**
 * Apply one change — move profile, set category, add/remove tags — to many
 * transactions. Per-row access is the single edit's: editor on the row's
 * profile, and on the target profile for a move. What each row becomes is
 * `planBulkEdit`; rows it can't fully take are reported, not failed, so one
 * income row in a selection doesn't block re-filing the expenses around it.
 *
 * The rows are locked while they're read, because the tag arrays written back
 * are computed from that read — an edit landing in between would otherwise be
 * overwritten. The write is one statement for every changed row, and a move
 * carries the attachments' denormalized `profile_id` along in the same
 * transaction, as the single edit does.
 */
export async function updateTransactions(
  userId: string,
  workspaceId: string,
  input: unknown,
): Promise<BulkUpdateResult> {
  const data = parseOrThrow(bulkUpdateTransactionsSchema, input);
  const ids = [...new Set(data.ids)];
  const writable = await writableProfileIds(userId, workspaceId);
  if (writable.length === 0) throw forbidden("You don't have permission to do that");
  if (data.profileId !== undefined && !writable.includes(data.profileId)) {
    throw forbidden("You don't have permission to move transactions to that profile");
  }

  const db = getDb();
  let category: BulkChange["category"];
  if (data.categoryId === null) category = null;
  else if (data.categoryId !== undefined) {
    const found = await db.query.categories.findFirst({
      where: and(eq(categories.id, data.categoryId), eq(categories.workspaceId, workspaceId)),
      columns: { id: true, kind: true },
    });
    if (!found) throw validationError("Invalid category");
    category = found;
  }
  const change: BulkChange = {
    profileId: data.profileId,
    category,
    addTagIds: await workspaceTagIds(workspaceId, data.addTagIds),
    removeTagIds: data.removeTagIds ?? [],
  };

  const outcome = await db.transaction(async (tx) => {
    const current = await tx
      .select({
        id: transactions.id,
        profileId: transactions.profileId,
        type: transactions.type,
        categoryId: transactions.categoryId,
        tagIds: transactions.tagIds,
        occurredOn: transactions.occurredOn,
      })
      .from(transactions)
      .where(
        and(
          inArray(transactions.id, ids),
          inArray(transactions.profileId, writable),
          notTrashed(transactions),
        ),
      )
      // In id order, so overlapping bulk operations can't
      // deadlock. `no key update`: the write never touches the key, and plain
      // `for update` would also hold off attachment inserts (their foreign key
      // check) for as long as this transaction is open.
      .orderBy(asc(transactions.id))
      .for("no key update");

    let wrongKind = 0;
    let tagLimit = 0;
    // Expenses that moved profile or category can push a budget over.
    const expenseDates: string[] = [];
    const patches: { id: string; profileId: string; categoryId: string | null; tagIds: string[]; moved: boolean }[] = [];
    for (const row of current) {
      const plan = planBulkEdit({ ...row, tagIds: row.tagIds ?? [] }, change, TAGS_PER_TRANSACTION_MAX);
      if (plan.categorySkipped) wrongKind++;
      if (plan.tagsSkipped) tagLimit++;
      if (!plan.changed) continue;
      if (row.type === "expense") expenseDates.push(row.occurredOn);
      patches.push({
        id: row.id,
        profileId: plan.next.profileId,
        categoryId: plan.next.categoryId,
        tagIds: plan.next.tagIds,
        moved: plan.next.profileId !== row.profileId,
      });
    }

    if (patches.length > 0) {
      // Every changed row in one statement. Each row carries all three columns —
      // its own current values where the change doesn't touch them — so one
      // shape serves every combination of fields.
      // The tag array is spelled out element by element: handed a JS array, the
      // `sql` template expands it into a parenthesised parameter *list* (its `IN`
      // form), which `::uuid[]` can't cast.
      const uuidArray = (ids: string[]) =>
        ids.length === 0
          ? sql`'{}'::uuid[]`
          : sql`array[${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)}]`;
      const values = sql.join(
        patches.map(
          (p) => sql`(${p.id}::uuid, ${p.profileId}::uuid, ${p.categoryId}::uuid, ${uuidArray(p.tagIds)})`,
        ),
        sql`, `,
      );
      // trash: only rows the locked read above found live are in `values`.
      await tx.execute(sql`
        update ${transactions} as t
        set profile_id = v.profile_id,
            category_id = v.category_id,
            tag_ids = v.tag_ids,
            updated_at = now()
        from (values ${values}) as v(id, profile_id, category_id, tag_ids)
        where t.id = v.id
      `);

      const moved = patches.filter((p) => p.moved).map((p) => p.id);
      if (moved.length > 0 && data.profileId) {
        await tx
          .update(transactionAttachments)
          .set({ profileId: data.profileId })
          .where(inArray(transactionAttachments.transactionId, moved));
      }
    }

    return {
      changedIds: patches.map((p) => p.id),
      expenseDates,
      noAccess: ids.length - current.length,
      wrongKind,
      tagLimit,
    };
  });
  scheduleBudgetCheck({ workspaceId, userId, dates: outcome.expenseDates });

  const rows = await getTransactionsByIds(userId, workspaceId, outcome.changedIds);
  return { rows, noAccess: outcome.noAccess, wrongKind: outcome.wrongKind, tagLimit: outcome.tagLimit };
}

/**
 * Insert many transactions from validated API input (`{ items: [...] }`,
 * category referenced by id). Returns the number inserted.
 */
export async function createManyTransactions(
  userId: string,
  workspaceId: string,
  input: unknown,
): Promise<{ count: number }> {
  const { items } = parseOrThrow(bulkTransactionsSchema, input);
  await ensureBootstrap(userId);
  const money = await getWorkspaceMoneyFormat(workspaceId);
  const db = getDb();

  const ownedCats = new Set(
    (
      await db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.workspaceId, workspaceId))
    ).map((c) => c.id),
  );
  const writable = await writableProfileIds(userId, workspaceId);
  if (writable.length === 0) {
    throw forbidden("You don't have permission to add transactions in this workspace");
  }
  const writableSet = new Set(writable);
  const defaultProfileId = writable[0]!;

  // Resolve every tag the batch mentions in one query, then filter each row
  // against the result. `bulkTransactionsSchema` is built from
  // `transactionInputSchema`, so these rows carry `tagIds` like any other
  // create — validating them and then not writing them would accept a client's
  // tags, answer 201, and silently drop them.
  const allowedTags = new Set(
    await workspaceTagIds(workspaceId, [...new Set(items.flatMap((d) => d.tagIds ?? []))]),
  );

  const values = items.map((d) => ({
    userId,
    type: d.type,
    amountMinor: toMinorUnits(d.amount, money.currency, money.locale),
    categoryId: d.categoryId && ownedCats.has(d.categoryId) ? d.categoryId : null,
    profileId: d.profileId && writableSet.has(d.profileId) ? d.profileId : defaultProfileId,
    title: pickTitle(d),
    description: d.description?.trim() ? d.description.trim() : null,
    occurredOn: d.occurredOn,
    tagIds: (d.tagIds ?? []).filter((id) => allowedTags.has(id)),
  }));

  await db.insert(transactions).values(values);
  scheduleBudgetCheck({ workspaceId, userId, dates: expenseDatesOf(values) });
  return { count: values.length };
}

/** The dates of the expenses in a batch about to be (or just) written. */
function expenseDatesOf(values: { type: "income" | "expense"; occurredOn: string }[]): string[] {
  return values.filter((v) => v.type === "expense").map((v) => v.occurredOn);
}

/**
 * Import transactions from free-form drafts (CSV/table paste), resolving
 * category by *name* + kind. Used by the web bulk-add flow. Skips individually
 * invalid rows; throws (with the web action's messages) for whole-batch guards.
 */
export async function createBulkFromDrafts(
  userId: string,
  workspaceId: string,
  drafts: BulkDraft[],
): Promise<{ count: number }> {
  if (!Array.isArray(drafts) || drafts.length === 0) {
    throw badRequest("Nothing to import");
  }
  if (drafts.length > 500) {
    throw badRequest("Too many rows (max 500 at a time)");
  }

  const money = await getWorkspaceMoneyFormat(workspaceId);
  const db = getDb();

  const workspaceCats = await db
    .select({ id: categories.id, name: categories.name, kind: categories.kind })
    .from(categories)
    .where(eq(categories.workspaceId, workspaceId));
  const catMap = new Map<string, string>();
  for (const c of workspaceCats) catMap.set(`${c.kind}:${c.name.toLowerCase()}`, c.id);

  // The workspace's tags, resolved once for the batch. Only fetched when a
  // draft actually carries tags: the text-paste path never does, and this runs
  // on every bulk import.
  //
  // Both a name map and an id set, because a draft may arrive with either.
  // The id set is what makes ids safe to accept from a client: an id is opaque
  // and guessable in the sense that matters, so one that isn't this workspace's
  // is dropped rather than trusted.
  const tagMap = new Map<string, string>();
  const workspaceTagIds = new Set<string>();
  if (drafts.some((d) => d.tagNames?.length || Array.isArray(d.tagIds))) {
    const workspaceTags = await db
      .select({ id: tags.id, name: tags.name })
      .from(tags)
      .where(eq(tags.workspaceId, workspaceId));
    for (const t of workspaceTags) {
      tagMap.set(t.name.toLowerCase(), t.id);
      workspaceTagIds.add(t.id);
    }
  }

  const writable = await writableProfileIds(userId, workspaceId);
  if (writable.length === 0) {
    throw forbidden("You don't have permission to add transactions in this workspace");
  }
  const writableSet = new Set(writable);
  const defaultProfileId = writable[0]!;

  const values = [];
  for (const d of drafts) {
    const parsed = transactionInputSchema
      .pick({ type: true, amount: true, occurredOn: true })
      .safeParse(d);
    if (!parsed.success) continue;
    const categoryId = d.categoryName
      ? (catMap.get(`${d.type}:${d.categoryName.toLowerCase()}`) ?? null)
      : null;
    const profileId =
      d.profileId && writableSet.has(d.profileId) ? d.profileId : defaultProfileId;
    values.push({
      userId,
      type: d.type,
      amountMinor: toMinorUnits(d.amount, money.currency, money.locale),
      categoryId,
      profileId,
      title: pickTitle({ title: d.title, note: d.note }),
      description: d.description?.trim() ? d.description.trim() : null,
      // Deduped and capped here as well as upstream, because this function's
      // only caller is the `addBulkTransactions` server action, which takes raw
      // client input with no Zod schema over it. (`/api/v1/transactions/bulk`
      // does *not* come through here — it goes to `createManyTransactions`,
      // where `bulkTransactionsSchema` and `workspaceTagIds` do this job.)
      // `typeof` guard for the same reason: a non-string would throw on
      // `.trim()` and turn a bad request into a 500.
      tagIds: [
        ...new Set(
          // `Array.isArray`, not `?.length`: a caller that sends `tagIds` is
          // stating the whole set, and an empty one means "no tags" — not
          // "fall back to the names". Truthiness here would let a row whose
          // tags the user just removed be re-tagged from a stale `tagNames`
          // the same payload happened to carry. It doubles as the type guard
          // this function applies everywhere else: `tagIds: "abc"` has a
          // truthy `.length` and no `.filter`, which is a 500, not a 400.
          Array.isArray(d.tagIds)
            ? d.tagIds
                .slice(0, TAGS_PER_TRANSACTION_MAX)
                .filter(
                  (id): id is string => typeof id === "string" && workspaceTagIds.has(id),
                )
            : (Array.isArray(d.tagNames) ? d.tagNames : [])
                .slice(0, TAGS_PER_TRANSACTION_MAX)
                .map((n) =>
                  typeof n === "string" ? tagMap.get(n.trim().toLowerCase()) : undefined,
                )
                .filter((id): id is string => !!id),
        ),
      ].slice(0, TAGS_PER_TRANSACTION_MAX),
      occurredOn: d.occurredOn,
    });
  }

  if (values.length === 0) throw badRequest("No valid rows to import");

  await db.insert(transactions).values(values);
  // Bulk add, CSV import and the AI's confirmed drafts all land here.
  scheduleBudgetCheck({ workspaceId, userId, dates: expenseDatesOf(values) });
  return { count: values.length };
}

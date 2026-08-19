import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { categories, profiles, transactionAttachments, transactions } from "@/db/schema";
import { ensureBootstrap } from "@/lib/auth";
import { badRequest, forbidden, validationError } from "@/lib/errors";
import { toMinorUnits } from "@/lib/money";
import {
  forgetAccessibleProfiles,
  getTransactionById,
  type TransactionRow,
} from "@/lib/queries";
import { setLogContext } from "@/lib/log-context";
import { logger } from "@/lib/logger";
import { time } from "@/lib/timing";
import { parseOrThrow, withId } from "@/lib/api-response";
import { rolesAtLeast } from "@/lib/rbac";
import {
  accessibleProfileIds,
  getEffectiveProfileRole,
  getWorkspaceMoneyFormat,
  getWorkspaceRole,
  requireProfileRole,
} from "@/lib/workspaces";
import {
  transactionInputSchema,
  updateTransactionSchema,
  bulkTransactionsSchema,
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
  if (role === "admin") {
    const db = getDb();
    const [row] = await db
      .insert(profiles)
      .values({ userId, workspaceId, name: "Personal", icon: "👤", sortOrder: 0 })
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
  const [categoryId, profileId] = await Promise.all([
    time("createTransaction.categoryLookup", () =>
      workspaceCategoryId(workspaceId, data.categoryId),
    ),
    time("createTransaction.resolveProfile", () =>
      resolveProfileId(userId, workspaceId, data.profileId),
    ),
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
      })
      .returning({ id: transactions.id }),
  );
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

  const existing = await db.query.transactions.findFirst({
    where: eq(transactions.id, data.id),
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

  return getTransactionById(userId, workspaceId, data.id);
}

/**
 * Delete a transaction (requires editor on its profile, in the current
 * workspace). Returns whether a row was removed — false when it doesn't exist
 * or lives in another workspace. Throws a validation error for a non-UUID id.
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
    where: eq(transactions.id, id),
    columns: { id: true, profileId: true },
  });
  if (!existing) return false;
  if (!(await editableInWorkspace(userId, workspaceId, existing.profileId))) return false;

  const deleted = await db
    .delete(transactions)
    .where(eq(transactions.id, id))
    .returning({ id: transactions.id });
  return deleted.length > 0;
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

  const values = items.map((d) => ({
    userId,
    type: d.type,
    amountMinor: toMinorUnits(d.amount, money.currency, money.locale),
    categoryId: d.categoryId && ownedCats.has(d.categoryId) ? d.categoryId : null,
    profileId: d.profileId && writableSet.has(d.profileId) ? d.profileId : defaultProfileId,
    title: pickTitle(d),
    description: d.description?.trim() ? d.description.trim() : null,
    occurredOn: d.occurredOn,
  }));

  await db.insert(transactions).values(values);
  return { count: values.length };
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
      occurredOn: d.occurredOn,
    });
  }

  if (values.length === 0) throw badRequest("No valid rows to import");

  await db.insert(transactions).values(values);
  return { count: values.length };
}

/**
 * What one bulk edit does to one row — pure, so the rules are tested without a
 * database. `services/transactions.ts` reads the locked rows, runs each through
 * this, and writes back only the ones that changed.
 */

export type BulkRowState = {
  id: string;
  profileId: string;
  type: "income" | "expense";
  categoryId: string | null;
  tagIds: string[];
};

export type BulkChange = {
  /** Move to this profile. */
  profileId?: string;
  /** Set this category; `null` clears it. Absent leaves the category alone. */
  category?: { id: string; kind: "income" | "expense" } | null;
  addTagIds: string[];
  removeTagIds: string[];
};

export type BulkRowPlan = {
  next: BulkRowState;
  changed: boolean;
  /** A category of the other kind was asked for — income rows keep their
   *  category when an expense one is applied, and the other way round. */
  categorySkipped: boolean;
  /** Adding the tags would take the row past the per-transaction cap, so its
   *  tags were left as they were. */
  tagsSkipped: boolean;
};

export function planBulkEdit(row: BulkRowState, change: BulkChange, tagCap: number): BulkRowPlan {
  const next: BulkRowState = { ...row, tagIds: [...row.tagIds] };
  let categorySkipped = false;
  let tagsSkipped = false;

  if (change.profileId !== undefined) next.profileId = change.profileId;

  // Categories are kind-specific everywhere else in the app — the edit dialog
  // only offers the row's own kind — so a mixed selection takes the category on
  // the rows it fits and leaves the rest, rather than filing a salary under an
  // expense category.
  if (change.category !== undefined) {
    if (change.category === null) next.categoryId = null;
    else if (change.category.kind === row.type) next.categoryId = change.category.id;
    else categorySkipped = true;
  }

  if (change.addTagIds.length > 0 || change.removeTagIds.length > 0) {
    const remove = new Set(change.removeTagIds);
    const tags = row.tagIds.filter((id) => !remove.has(id));
    for (const id of change.addTagIds) if (!tags.includes(id)) tags.push(id);
    // All or nothing per row: a row that can't take every added tag keeps the
    // set it had, rather than an arbitrary prefix of the request.
    if (tags.length > tagCap) tagsSkipped = true;
    else next.tagIds = tags;
  }

  const changed =
    next.profileId !== row.profileId ||
    next.categoryId !== row.categoryId ||
    next.tagIds.length !== row.tagIds.length ||
    next.tagIds.some((id, i) => id !== row.tagIds[i]);

  return { next, changed, categorySkipped, tagsSkipped };
}

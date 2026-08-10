# Database Index & Constraint Report

**Scope:** review every table's indexes/constraints, add what's missing (uniqueness,
FK-supporting, search), and reconcile with the stated rules:

- `users`: no duplicate **email**, **user id**, or **firebase uid**.
- `workspaces` / `profiles`: **names may duplicate**, but **ids must not**.

**DB:** `neondb` on the project's Neon branch (via `NEON_POSTGRES_DATABASE_URL`).
**Status:** _proposal — nothing here is applied yet. Apply after approval (see §6)._

---

## 1. Summary

| # | Change | Table | Kind | Priority | Notes |
|---|--------|-------|------|----------|-------|
| 1 | Unique `lower(email)` | `users` | unique | ✅ applied | Migration `0012` — case-insensitive, emails lowercased + backfilled. |
| 2 | `id` unique | `users` | — | done | Already the primary key. |
| 3 | `firebase_uid` unique | `users` | — | done | Already `users_firebase_uid_unique`. |
| 4 | Index `category_id` | `transactions` | b-tree | ✅ applied | Migration `0013`. Speeds category delete (`set null`). |
| 5 | Index `profile_id` | `transactions` | b-tree | ✅ applied | Migration `0013`. |
| 6 | Index `profile_id` | `workspace_invites` | b-tree | ✅ applied | Migration `0013`. |
| 7 | Trigram GIN on `title`, `description` | `transactions` | GIN (`pg_trgm`) | Defer | For `ILIKE '%q%'` search; premature at current volume. |
| 8 | Keep `profiles_workspace_name_uq` | `profiles` | decision | ✅ kept | **You chose to keep it** — profile names stay unique per workspace. See §4. |
| 9 | `id` unique on `workspaces`/`profiles`; names non-unique on `workspaces` | — | — | done | PKs already unique; `workspaces.name` already non-unique. |

---

## 2. `users` uniqueness (your rules)

| Column | Requirement | Current | Action |
|--------|-------------|---------|--------|
| `id` | no duplicates | PRIMARY KEY | ✅ none |
| `firebase_uid` | no duplicates | `UNIQUE` | ✅ none |
| `email` | no duplicates | **none** | **Add unique index** |

**Recommendation — case-insensitive, partial unique on email.** Case-insensitive
because `Foo@x.com` and `foo@x.com` are the same account; partial (`WHERE email IS
NOT NULL`) so future rows without an email aren't forced unique against each other.

Drizzle (in `users`' table callback):
```ts
uniqueIndex("users_email_lower_uq")
  .on(sql`lower(${t.email})`)
  .where(sql`${t.email} is not null`),
```
SQL:
```sql
CREATE UNIQUE INDEX "users_email_lower_uq" ON "users" (lower("email")) WHERE "email" IS NOT NULL;
```

> ✅ **Applied** in migration `0012_loud_black_knight.sql` (after the remap). The
> migration also backfills existing rows to lowercase, and `normalizeEmail()` in
> `src/lib/identity.ts` lowercases every future write. Chose a plain (non-partial)
> `lower(email)` unique index — you wanted "unique all".

---

## 3. Foreign-key supporting indexes (performance)

Postgres does **not** auto-index the referencing side of a FK. An unindexed FK means
a sequential scan every time the parent row is deleted/updated (and for joins). Audit:

| FK | Supporting index today | Verdict |
|----|------------------------|---------|
| `workspace_members.workspace_id` → workspaces | PK leads with `workspace_id` | ✅ ok |
| `profile_access.profile_id` → profiles | PK leads with `profile_id` | ✅ ok |
| `profiles.workspace_id` → workspaces | `profiles_workspace_idx (workspace_id, sort_order)` | ✅ ok |
| `workspace_invites.workspace_id` → workspaces | unique idx leads with `workspace_id` | ✅ ok |
| `transactions.category_id` → categories | only `(user_id, category_id)` — wrong leading col | ❌ **add** |
| `transactions.profile_id` → profiles | only `(user_id, profile_id)` — wrong leading col | ❌ **add** |
| `workspace_invites.profile_id` → profiles | none | ❌ **add** |

A composite index led by `user_id` **cannot** serve a lookup keyed only on the second
column, so the three ❌ rows need their own single-column index.

Drizzle:
```ts
// transactions table callback
index("transactions_category_idx").on(t.categoryId),
index("transactions_profile_idx").on(t.profileId),
// workspace_invites table callback
index("workspace_invites_profile_idx").on(t.profileId),
```
SQL:
```sql
CREATE INDEX "transactions_category_idx"      ON "transactions"     ("category_id");
CREATE INDEX "transactions_profile_idx"       ON "transactions"     ("profile_id");
CREATE INDEX "workspace_invites_profile_idx"  ON "workspace_invites" ("profile_id");
```

Priority: `transactions.*` are Medium (that table grows); the invites one is Low
(tiny table) but cheap and correct.

---

## 4. DECISION — profile name uniqueness

> **DECIDED: keep the constraint.** Profile names remain unique per workspace;
> `profiles_workspace_name_uq` and the `profiles.ts` conflict handling are unchanged.
> The analysis below is retained for context. (This overrides the general "names may
> duplicate" rule specifically for profiles, by your choice.)

**Conflict.** `profiles` currently has:
```
uniqueIndex("profiles_workspace_name_uq").on(workspace_id, name)  -- names unique within a workspace
```
Your rule says **profile names may duplicate**. To honor it, this index must be **dropped**.

**What changes if we drop it:**
- Two profiles named e.g. "Personal" can coexist in one workspace.
- `createProfile` / `updateProfile` (`src/services/profiles.ts`) currently rely on this
  index — they `catch` the unique violation and return `409 "A profile with that name
  already exists"`. After dropping, that branch becomes **dead code** for name
  collisions; I'd remove/adjust it so the API no longer advertises a constraint it
  doesn't enforce.
- The profile switcher/sidebar would show duplicate labels (potentially confusing).
- **Data-safe:** no duplicate profile names exist today, so the drop won't error.

`categories` has an analogous `categories_user_name_kind_uq` (unique name per user+kind).
You didn't mention categories, so I've **left it as-is** — tell me if you want it dropped too.

SQL (only if you confirm):
```sql
DROP INDEX "profiles_workspace_name_uq";
```

**My default:** proceed with the drop (it's your stated rule) **and** clean up the
now-dead conflict handling in `profiles.ts`. Say the word if you'd rather keep names
unique per workspace instead.

---

## 5. Search index (deferred)

Transaction search (`src/lib/queries.ts`) uses:
```ts
or(ilike(transactions.title, `%${q}%`), ilike(transactions.description, `%${q}%`))
```
A leading-wildcard `ILIKE '%q%'` **cannot** use a B-tree. The right tool is a trigram
GIN index:
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "transactions_title_trgm"       ON "transactions" USING gin (title gin_trgm_ops);
CREATE INDEX "transactions_description_trgm" ON "transactions" USING gin (description gin_trgm_ops);
```
**Recommendation: defer.** At current volume (tens of rows) a seq scan is faster than a
GIN probe, and the search is already narrowed by `user_id` first. Revisit when a single
user approaches ~5–10k transactions. When we do, the more selective option is
`btree_gin` so `user_id` + trigram live in one index. Not adding this now.

---

## 6. Apply plan (after approval)

Ordered, because #1 depends on the remap:

1. **Run the UID remap** — `scripts/remap-firebase-user.mjs` (collapses the duplicate email).
2. **Edit `schema.ts`** to add: `users_email_lower_uq` (§2), the 3 FK indexes (§3),
   and — if you confirm §4 — remove `profiles_workspace_name_uq` (+ clean up `profiles.ts`).
3. `pnpm db:generate` → review the generated migration.
4. `doppler run -- pnpm db:migrate`.

Trigram search indexes (§5) are intentionally **not** in this plan.

### Consolidated SQL preview (excl. deferred/decision items)
```sql
-- after remap:
CREATE UNIQUE INDEX "users_email_lower_uq" ON "users" (lower("email")) WHERE "email" IS NOT NULL;
CREATE INDEX "transactions_category_idx"     ON "transactions"      ("category_id");
CREATE INDEX "transactions_profile_idx"      ON "transactions"      ("profile_id");
CREATE INDEX "workspace_invites_profile_idx" ON "workspace_invites" ("profile_id");
-- only if §4 confirmed:
-- DROP INDEX "profiles_workspace_name_uq";
```

---

## Appendix — current index inventory

| Table | Indexes / constraints |
|-------|-----------------------|
| `users` | PK(`id`), UNIQUE(`firebase_uid`) |
| `workspaces` | PK(`id`), `workspaces_owner_idx`(`owner_id`) |
| `workspace_members` | PK(`workspace_id`,`user_id`), `workspace_members_user_idx`(`user_id`) |
| `profile_access` | PK(`profile_id`,`user_id`), `profile_access_user_idx`(`user_id`) |
| `workspace_invites` | PK(`id`), UNIQUE(`workspace_id`,`email`,coalesce(`profile_id`)), `workspace_invites_email_idx`(`email`) |
| `user_settings` | PK(`user_id`) |
| `profiles` | PK(`id`), `profiles_user_sort_idx`(`user_id`,`sort_order`), `profiles_workspace_idx`(`workspace_id`,`sort_order`), UNIQUE(`workspace_id`,`name`) |
| `categories` | PK(`id`), `categories_user_kind_idx`(`user_id`,`kind`), UNIQUE(`user_id`,`name`,`kind`) |
| `transactions` | PK(`id`), `(user_id,occurred_on desc)`, `(user_id,category_id)`, `(user_id,type)`, `(user_id,created_at desc)`, `(user_id,profile_id)` |

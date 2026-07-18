-- Move currency + number format (locale) and categories from per-user to
-- per-workspace. Backfill is LOSSLESS: every workspace inherits its owner's
-- currency/locale and category list, and every transaction is repointed to the
-- matching category IN ITS OWN workspace (copying the category in when the
-- workspace didn't already have it), so no category_id is left dangling.
--
-- Note: amount_minor for a transaction authored by a member whose personal
-- currency differed from the workspace owner's will now render with the
-- workspace currency's decimals — unavoidable, and the common single-user case
-- maps 1:1.

-- 1. Workspaces gain currency + locale. Default first (fills existing rows),
--    then backfill each from its owner's user_settings.
ALTER TABLE "workspaces" ADD COLUMN "currency" text DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "locale" text DEFAULT 'en-US' NOT NULL;--> statement-breakpoint
UPDATE "workspaces" w
SET "currency" = us."currency", "locale" = us."locale"
FROM "user_settings" us
WHERE us."user_id" = w."owner_id";--> statement-breakpoint

-- 2. Categories become workspace-scoped. Drop the old per-user indexes first —
--    the copy-in below reuses an owner's user_id across workspaces and would
--    otherwise violate the (user_id, name, kind) unique index.
DROP INDEX "categories_user_kind_idx";--> statement-breakpoint
DROP INDEX "categories_user_name_kind_uq";--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint

-- 2a. Assign each existing category to its owner's default (earliest) workspace.
UPDATE "categories" c
SET "workspace_id" = dw."id"
FROM (
  SELECT DISTINCT ON ("owner_id") "owner_id", "id"
  FROM "workspaces"
  ORDER BY "owner_id", "created_at", "id"
) dw
WHERE dw."owner_id" = c."user_id";--> statement-breakpoint

-- 2b. Lossless copy-in: for every category a transaction uses whose own
--     workspace doesn't have a matching (name, kind), create it there.
INSERT INTO "categories" ("user_id", "workspace_id", "name", "kind", "icon")
SELECT DISTINCT ON (p."workspace_id", oldc."name", oldc."kind")
       w."owner_id", p."workspace_id", oldc."name", oldc."kind", oldc."icon"
FROM "transactions" t
JOIN "profiles" p ON p."id" = t."profile_id"
JOIN "workspaces" w ON w."id" = p."workspace_id"
JOIN "categories" oldc ON oldc."id" = t."category_id"
WHERE t."category_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "categories" cw
    WHERE cw."workspace_id" = p."workspace_id"
      AND cw."name" = oldc."name"
      AND cw."kind" = oldc."kind"
  )
ORDER BY p."workspace_id", oldc."name", oldc."kind";--> statement-breakpoint

-- 2c. Repoint each transaction to the category in its own workspace.
UPDATE "transactions" t
SET "category_id" = cw."id"
FROM "categories" oldc, "profiles" p, "categories" cw
WHERE t."category_id" = oldc."id"
  AND p."id" = t."profile_id"
  AND cw."workspace_id" = p."workspace_id"
  AND cw."name" = oldc."name"
  AND cw."kind" = oldc."kind"
  AND cw."id" <> oldc."id";--> statement-breakpoint

-- 2d. Defensive: drop any category still unassigned (its owner had no
--     workspace). Its transactions, if any, were already repointed above.
DELETE FROM "categories" WHERE "workspace_id" IS NULL;--> statement-breakpoint

-- 2e. Lock in workspace scoping: NOT NULL, FK, and the new indexes.
ALTER TABLE "categories" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "categories_workspace_kind_idx" ON "categories" USING btree ("workspace_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_workspace_name_kind_uq" ON "categories" USING btree ("workspace_id","name","kind");--> statement-breakpoint

-- 2f. Ensure EVERY workspace has the full default income/expense category list
--     (adds only the ones it's missing; anything already there is kept). Covers
--     workspaces minted by the 0009 backfill, which never seeded categories, and
--     any second+ workspace. Idempotent via ON CONFLICT. Keep this list in sync
--     with DEFAULT_CATEGORIES in src/lib/categories.ts.
INSERT INTO "categories" ("user_id", "workspace_id", "name", "kind", "icon")
SELECT w."owner_id", w."id", d."name", d."kind"::"public"."txn_type", d."icon"
FROM "workspaces" w
CROSS JOIN (VALUES
  ('Food & Dining', 'expense', '🍽️'),
  ('Groceries', 'expense', '🛒'),
  ('Transport', 'expense', '🚆'),
  ('Housing', 'expense', '🏠'),
  ('Utilities', 'expense', '💡'),
  ('Shopping', 'expense', '🛍️'),
  ('Health', 'expense', '⚕️'),
  ('Entertainment', 'expense', '🎬'),
  ('Education', 'expense', '📚'),
  ('Other', 'expense', '📦'),
  ('Salary', 'income', '💼'),
  ('Freelance', 'income', '🧾'),
  ('Investments', 'income', '📈'),
  ('Gifts', 'income', '🎁'),
  ('Other', 'income', '➕')
) AS d("name", "kind", "icon")
ON CONFLICT ("workspace_id", "name", "kind") DO NOTHING;--> statement-breakpoint

-- 3. Currency + locale now live on the workspace; drop the per-user columns.
ALTER TABLE "user_settings" DROP COLUMN "currency";--> statement-breakpoint
ALTER TABLE "user_settings" DROP COLUMN "locale";

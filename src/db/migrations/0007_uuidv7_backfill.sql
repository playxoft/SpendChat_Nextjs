-- Backfill: rows created before migration 0001 still carry gen_random_uuid()
-- (v4) ids. Rewrite every non-v7 id as a UUIDv7 whose embedded timestamp is
-- the row's created_at (uuidv7(shift) generates at now()+shift), so the ids
-- stay time-ordered and consistent with rows minted after 0001.
--
-- The version check reads the version nibble from the text form
-- (substring(...,15,1)) instead of uuid_extract_version() so the migration
-- also runs on the PGlite test database, which predates that function.

-- 1. Categories are referenced by transactions.category_id, so remap through a
--    mapping table with the FK dropped (a non-deferrable FK can't survive the
--    parent PK changing between statements).
CREATE TEMP TABLE "cat_id_map" AS
SELECT "id" AS "old_id", uuidv7("created_at" - clock_timestamp()) AS "new_id"
FROM "categories"
WHERE substring("id"::text, 15, 1) <> '7';
--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_category_id_categories_id_fk";
--> statement-breakpoint
UPDATE "transactions" t
SET "category_id" = m."new_id"
FROM "cat_id_map" m
WHERE t."category_id" = m."old_id";
--> statement-breakpoint
UPDATE "categories" c
SET "id" = m."new_id"
FROM "cat_id_map" m
WHERE c."id" = m."old_id";
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk"
  FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
DROP TABLE "cat_id_map";
--> statement-breakpoint

-- 2. Profiles: same shape, defensively (all current rows are already v7).
CREATE TEMP TABLE "profile_id_map" AS
SELECT "id" AS "old_id", uuidv7("created_at" - clock_timestamp()) AS "new_id"
FROM "profiles"
WHERE substring("id"::text, 15, 1) <> '7';
--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_profile_id_profiles_id_fk";
--> statement-breakpoint
UPDATE "transactions" t
SET "profile_id" = m."new_id"
FROM "profile_id_map" m
WHERE t."profile_id" = m."old_id";
--> statement-breakpoint
UPDATE "profiles" p
SET "id" = m."new_id"
FROM "profile_id_map" m
WHERE p."id" = m."old_id";
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_profile_id_profiles_id_fk"
  FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
DROP TABLE "profile_id_map";
--> statement-breakpoint

-- 3. Transactions: nothing references transactions.id, rewrite in place.
UPDATE "transactions"
SET "id" = uuidv7("created_at" - clock_timestamp())
WHERE substring("id"::text, 15, 1) <> '7';

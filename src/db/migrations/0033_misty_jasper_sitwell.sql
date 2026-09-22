-- Transaction tags: a workspace-scoped `tags` table, and the `tag_ids` array on
-- `transactions` that carries the many-to-many edges.
--
-- Additive in full — no column is dropped, retyped or backfilled, and every
-- existing row reads exactly as it did.
--
-- **Lock profile, and why it is worse than it looks.** `drizzle-kit migrate`
-- runs this whole file in one transaction, so every lock it takes is held to
-- commit. Statement 2 (`ALTER TABLE transactions ADD COLUMN`) takes ACCESS
-- EXCLUSIVE on `transactions`, and that lock is therefore still held through
-- the non-concurrent GIN build at the end. For the duration of that build,
-- reads *and* writes on `transactions` block — not the "writes queue, reads
-- pass" that a bare `CREATE INDEX` would cost. Reordering the statements does
-- not help: any ALTER in the same transaction re-escalates on the same table.
--
-- Two things keep that window short today. The `ADD COLUMN` itself does not
-- rewrite the table — the default is a non-volatile constant, so Postgres
-- stores it in `attmissingval` (PG >= 11) and existing rows are untouched. And
-- GIN emits no index entries for an empty array, so every pre-existing row
-- contributes nothing: the build is a heap scan and little else, and the index
-- starts at near-zero bytes. The window grows linearly with the table.
--
-- **On a large `transactions`, do not run this as-is.** Follow 0028/0030's
-- advice and run the two statements by hand, out of band —
--
--     ALTER TABLE transactions
--       ADD COLUMN tag_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];
--     CREATE INDEX CONCURRENTLY transactions_tag_ids_idx
--       ON transactions USING gin (tag_ids);
--
-- — and then record this migration, rather than letting the transaction hold
-- ACCESS EXCLUSIVE across the build. (`CREATE INDEX CONCURRENTLY` cannot run
-- inside a transaction block, which is why it cannot simply be written here.)
--
-- **The operator on the index matters as much as the index.** GIN `array_ops`
-- serves `&&`, `@>` and `<@`. Nothing rewrites a `scalar = ANY(column)` into
-- any of them: measured on Postgres 18.6 with `enable_seqscan = off`, the
-- `= any` form has no index path at all, while `@>` takes a Bitmap Index Scan.
-- Every caller writes `tag_ids @> array[...]` or `tag_ids && array[...]`.
--
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar(20) NOT NULL,
	"color" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "tag_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tags_workspace_name_uq" ON "tags" USING btree ("workspace_id",lower("name"));--> statement-breakpoint
CREATE INDEX "tags_workspace_name_idx" ON "tags" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "transactions_tag_ids_idx" ON "transactions" USING gin ("tag_ids");
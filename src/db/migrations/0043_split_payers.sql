CREATE TABLE "split_expense_payers" (
	"expense_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	CONSTRAINT "split_expense_payers_expense_id_member_id_pk" PRIMARY KEY("expense_id","member_id"),
	CONSTRAINT "split_expense_payers_amount_positive" CHECK ("split_expense_payers"."amount_minor" > 0)
);
--> statement-breakpoint
ALTER TABLE "split_expense_payers" ADD CONSTRAINT "split_expense_payers_expense_id_split_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."split_expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_expense_payers" ADD CONSTRAINT "split_expense_payers_member_id_split_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."split_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "split_expense_payers_member_idx" ON "split_expense_payers" USING btree ("member_id");--> statement-breakpoint
-- ── Backfill (hand-written) ────────────────────────────────────────────────
-- Every expense so far had one payer: give it one payer row for the whole
-- amount. Keep this block at the end if the migration is regenerated.
INSERT INTO "split_expense_payers" ("expense_id", "member_id", "amount_minor")
SELECT "id", "paid_by_member_id", "amount_minor" FROM "split_expenses"
ON CONFLICT DO NOTHING;

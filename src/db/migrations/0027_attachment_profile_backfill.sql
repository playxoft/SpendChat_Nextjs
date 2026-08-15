-- Data-only backfill (no schema change): re-point every attachment row whose
-- denormalized profile disagrees with the transaction it belongs to.
--
-- `transaction_attachments.profile_id` is a copy of the parent transaction's
-- profile. It is what scopes an attachment read, and it is ON DELETE cascade.
-- Until 0.4.0, changing one transaction's profile (the transaction dialog's
-- profile select, PATCH /api/v1/transactions/{id}) updated only the
-- transaction, so its receipts kept naming the old profile: invisible against
-- the transaction to anyone whose access comes from a per-profile grant, and
-- destroyed — row *and* stored object — the moment that old profile was
-- deleted, even though the transaction itself was alive somewhere else.
--
-- The delete path now repairs such rows on its way past, so this is a repair of
-- the read scoping rather than a prerequisite for safety. Idempotent: rows that
-- already agree are not touched.
UPDATE "transaction_attachments" a
SET "profile_id" = t."profile_id"
FROM "transactions" t
WHERE a."transaction_id" = t."id"
  AND a."profile_id" <> t."profile_id";

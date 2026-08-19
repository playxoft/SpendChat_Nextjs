-- Narrow `transactions.created_at` to millisecond precision.
--
-- It is the middle term of the tracker feed's keyset cursor, and the cursor
-- round-trips through the client as a JavaScript `Date`, which holds
-- milliseconds. Against a microsecond column the returned cursor names an
-- instant fractionally *earlier* than the row it came from, so every row that
-- ties with that row sorts after the cursor and is skipped — and a bulk import
-- shares `created_at` to the microsecond across its whole batch, so importing
-- 100 rows dated the same day made everything past the first feed page
-- unreachable by scrolling. Rounding the stored value to milliseconds makes the
-- round trip lossless: ties stay ties, and `id` breaks them the way the
-- ordering already says it does.
--
-- Nothing observable narrows. The API already serialised this column through a
-- `Date`, so every client has only ever seen milliseconds.
--
-- This rewrites the table under ACCESS EXCLUSIVE. Instant at the current size
-- (production holds a few hundred rows); on a large table, do it out of band.
ALTER TABLE "transactions" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "created_at" SET DEFAULT now();

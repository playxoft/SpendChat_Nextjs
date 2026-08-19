-- Narrow the `transactions` timestamps to millisecond precision.
--
-- `created_at` is the middle term of the tracker feed's keyset cursor, and the
-- cursor round-trips through the client as a JavaScript `Date`, which holds
-- milliseconds. Against a microsecond column the returned cursor names an
-- instant fractionally *earlier* than the row it came from, so every row that
-- ties with that row sorts after the cursor and is skipped — and a bulk import
-- shares `created_at` to the microsecond across its whole batch, so importing
-- 100 rows dated the same day made everything past the first feed page
-- unreachable by scrolling. Rounding the stored value to milliseconds makes the
-- round trip lossless: ties stay ties, and `id` breaks them the way the
-- ordering already says it does.
--
-- `updated_at` is narrowed only to stay comparable with it. Rounding one column
-- and not the other would leave rows that were never edited reporting an
-- `updated_at` fractionally before their own `created_at`. Rounding is monotone,
-- so narrowing both preserves the ordering between them.
--
-- Nothing observable narrows: the API already serialised `created_at` through a
-- `Date`, so every client has only ever seen milliseconds. One wrinkle, because
-- it is the kind of thing that surprises someone later — Postgres **rounds**
-- when it narrows precision, while node-postgres was **truncating**. So a row
-- written before this migration whose hidden microseconds were ≥ 500µs now
-- reports a `created_at` one millisecond later than it used to (and a value like
-- `…59.999999` rounds up across the second, so the date can move with it).
-- Bounded, one time, and documented in the API changelog as spec 5.9.3.
--
-- This rewrites the table under ACCESS EXCLUSIVE. Instant at the current size
-- (production holds a few hundred rows); on a large table, do it out of band.
ALTER TABLE "transactions" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "updated_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "updated_at" SET DEFAULT now();

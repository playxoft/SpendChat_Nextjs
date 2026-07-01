import { sql } from "drizzle-orm";
import {
  bigint,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** Time-ordered UUIDv7 default (Postgres 18 built-in). Use for all our PKs. */
const uuidV7 = sql`uuidv7()`;

/** Income vs. expense. Used by both categories and transactions. */
export const txnTypeEnum = pgEnum("txn_type", ["income", "expense"]);

/**
 * Per-user preferences. `user_id` is the Neon Auth (Stack) user id.
 * One row per user; created on first sign-in (bootstrap).
 */
export const userSettings = pgTable("user_settings", {
  userId: text("user_id").primaryKey(),
  currency: text("currency").notNull().default("USD"),
  locale: text("locale").notNull().default("en-US"),
  theme: text("theme").notNull().default("system"),
  // How the transaction composer lays out its inputs:
  //   amount_title — amount field, then title (default / original layout)
  //   title_amount — title field, then amount
  //   combined     — one field parsed as "<amount> <title>" (e.g. "100 fruits")
  inputMode: text("input_mode").notNull().default("amount_title"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A "profile" groups transactions like a chat thread (Personal, Company, Home…).
 * Every user has at least one ("Personal"), created on bootstrap. Single currency
 * per user still applies — profiles do not carry their own currency.
 */
export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").primaryKey().default(uuidV7),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    icon: text("icon"),
    color: text("color"),
    // Manual ordering for the sidebar (drag-to-sort).
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("profiles_user_sort_idx").on(t.userId, t.sortOrder),
    uniqueIndex("profiles_user_name_uq").on(t.userId, t.name),
  ],
);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().default(uuidV7),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    kind: txnTypeEnum("kind").notNull(),
    icon: text("icon"),
    color: text("color"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Filter categories by user + income/expense.
    index("categories_user_kind_idx").on(t.userId, t.kind),
    // Prevent duplicate category names per user/kind.
    uniqueIndex("categories_user_name_kind_uq").on(t.userId, t.name, t.kind),
  ],
);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().default(uuidV7),
    userId: text("user_id").notNull(),
    type: txnTypeEnum("type").notNull(),
    // Amount stored as a positive integer in the currency's minor units (e.g. cents).
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    // Which profile (thread) this transaction belongs to. Backfilled to "Personal".
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    // Short headline for the transaction (was `note`).
    title: text("title"),
    // Longer free-text body shown on expand / in the detail dialog.
    description: text("description"),
    occurredOn: date("occurred_on").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Primary list + date-range filtering (most common query).
    index("transactions_user_date_idx").on(t.userId, t.occurredOn.desc()),
    // Filter by category.
    index("transactions_user_category_idx").on(t.userId, t.categoryId),
    // Filter by income/expense.
    index("transactions_user_type_idx").on(t.userId, t.type),
    // Chat feed ordering (newest first by entry time).
    index("transactions_user_created_idx").on(t.userId, t.createdAt.desc()),
    // Filter a user's transactions by profile (thread).
    index("transactions_user_profile_idx").on(t.userId, t.profileId),
  ],
);

export type UserSettings = typeof userSettings.$inferSelect;
export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;

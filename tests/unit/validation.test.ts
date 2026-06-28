import { describe, it, expect } from "vitest";
import {
  txnTypeSchema,
  amountSchema,
  transactionInputSchema,
  updateTransactionSchema,
  bulkTransactionsSchema,
  settingsSchema,
  categoryInputSchema,
  updateCategorySchema,
  profileInputSchema,
  updateProfileSchema,
  reorderProfilesSchema,
} from "@/lib/validation";

// A valid RFC 4122 v4 UUID (Zod's .uuid() checks the version/variant nibbles).
const UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("txnTypeSchema", () => {
  it("accepts income/expense only", () => {
    expect(txnTypeSchema.parse("income")).toBe("income");
    expect(txnTypeSchema.parse("expense")).toBe("expense");
    expect(txnTypeSchema.safeParse("transfer").success).toBe(false);
  });
});

describe("amountSchema", () => {
  it("accepts positive finite numbers within range", () => {
    expect(amountSchema.parse(0.01)).toBe(0.01);
    expect(amountSchema.parse(1_000_000_000)).toBe(1_000_000_000);
  });
  it("coerces numeric strings", () => {
    expect(amountSchema.parse("12.5")).toBe(12.5);
  });
  it("rejects zero, negatives, NaN/Infinity, and oversize values", () => {
    expect(amountSchema.safeParse(0).success).toBe(false);
    expect(amountSchema.safeParse(-1).success).toBe(false);
    expect(amountSchema.safeParse(Infinity).success).toBe(false);
    expect(amountSchema.safeParse(1_000_000_001).success).toBe(false);
  });
});

describe("transactionInputSchema", () => {
  it("applies defaults for title/description", () => {
    const parsed = transactionInputSchema.parse({
      type: "expense",
      amount: 5,
      occurredOn: "2026-06-01",
    });
    expect(parsed.title).toBe("");
    expect(parsed.description).toBe("");
  });

  it("accepts null category/profile and a deprecated note", () => {
    const parsed = transactionInputSchema.parse({
      type: "income",
      amount: 5,
      occurredOn: "2026-06-01",
      categoryId: null,
      profileId: null,
      note: "legacy",
    });
    expect(parsed.note).toBe("legacy");
  });

  it("rejects a bad date format", () => {
    expect(
      transactionInputSchema.safeParse({
        type: "income",
        amount: 5,
        occurredOn: "2026/06/01",
      }).success,
    ).toBe(false);
  });

  it("rejects an over-long title and a non-UUID category", () => {
    expect(
      transactionInputSchema.safeParse({
        type: "income",
        amount: 5,
        occurredOn: "2026-06-01",
        title: "x".repeat(101),
      }).success,
    ).toBe(false);
    expect(
      transactionInputSchema.safeParse({
        type: "income",
        amount: 5,
        occurredOn: "2026-06-01",
        categoryId: "not-a-uuid",
      }).success,
    ).toBe(false);
  });
});

describe("updateTransactionSchema", () => {
  it("requires a valid id", () => {
    const base = { type: "expense", amount: 5, occurredOn: "2026-06-01" };
    expect(updateTransactionSchema.safeParse({ ...base, id: UUID }).success).toBe(true);
    expect(updateTransactionSchema.safeParse({ ...base, id: "nope" }).success).toBe(false);
  });
});

describe("bulkTransactionsSchema", () => {
  const item = { type: "expense" as const, amount: 1, occurredOn: "2026-06-01" };
  it("accepts 1..500 items", () => {
    expect(bulkTransactionsSchema.safeParse({ items: [item] }).success).toBe(true);
    expect(
      bulkTransactionsSchema.safeParse({ items: Array(500).fill(item) }).success,
    ).toBe(true);
  });
  it("rejects empty and >500", () => {
    expect(bulkTransactionsSchema.safeParse({ items: [] }).success).toBe(false);
    expect(
      bulkTransactionsSchema.safeParse({ items: Array(501).fill(item) }).success,
    ).toBe(false);
  });
});

describe("settingsSchema", () => {
  it("accepts a supported currency/locale/theme", () => {
    expect(
      settingsSchema.safeParse({ currency: "USD", locale: "en-US", theme: "dark" })
        .success,
    ).toBe(true);
  });
  it("rejects an unsupported currency or theme", () => {
    expect(
      settingsSchema.safeParse({ currency: "ZZZ", locale: "en-US", theme: "dark" })
        .success,
    ).toBe(false);
    expect(
      settingsSchema.safeParse({ currency: "USD", locale: "en-US", theme: "neon" })
        .success,
    ).toBe(false);
  });
});

describe("category schemas", () => {
  it("validates name length and kind", () => {
    expect(categoryInputSchema.safeParse({ name: "Food", kind: "expense" }).success).toBe(
      true,
    );
    expect(categoryInputSchema.safeParse({ name: "", kind: "expense" }).success).toBe(
      false,
    );
    expect(
      categoryInputSchema.safeParse({ name: "x".repeat(41), kind: "expense" }).success,
    ).toBe(false);
  });
  it("allows partial updates keyed by id", () => {
    expect(updateCategorySchema.safeParse({ id: UUID, name: "New" }).success).toBe(true);
    expect(updateCategorySchema.safeParse({ id: "bad" }).success).toBe(false);
  });
});

describe("profile schemas", () => {
  it("validates name", () => {
    expect(profileInputSchema.safeParse({ name: "Personal" }).success).toBe(true);
    expect(profileInputSchema.safeParse({ name: "" }).success).toBe(false);
  });
  it("allows partial updates keyed by id", () => {
    expect(updateProfileSchema.safeParse({ id: UUID, color: null }).success).toBe(true);
    expect(updateProfileSchema.safeParse({ id: "bad" }).success).toBe(false);
  });
  it("reorder accepts 1..100 UUIDs", () => {
    expect(reorderProfilesSchema.safeParse({ ids: [UUID] }).success).toBe(true);
    expect(reorderProfilesSchema.safeParse({ ids: [] }).success).toBe(false);
    expect(
      reorderProfilesSchema.safeParse({ ids: Array(101).fill(UUID) }).success,
    ).toBe(false);
    expect(reorderProfilesSchema.safeParse({ ids: ["nope"] }).success).toBe(false);
  });
});

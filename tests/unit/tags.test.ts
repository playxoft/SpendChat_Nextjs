import { describe, it, expect } from "vitest";
import { TAG_COLORS, defaultTagColor, serializeTxnTag } from "@/lib/tags";
import { VAULT_COLORS } from "@/lib/files";
import {
  TAG_NAME_MAX,
  TAGS_PER_TRANSACTION_MAX,
  accentColorSchema,
  createTxnTagSchema,
  setTransactionTagsSchema,
  transactionInputSchema,
  txnTagIdsSchema,
  updateTxnTagSchema,
  vaultColorSchema,
} from "@/lib/validation";
import type { Tag } from "@/db/schema";

const uuid = (n: number) => `0199a000-0000-7000-8000-${String(n).padStart(12, "0")}`;

describe("TAG_COLORS", () => {
  // The create popup renders the palette as a fixed 10x2 grid and the product
  // decision was "twenty colors". A swatch added or dropped silently reflows it.
  it("is exactly 20 swatches", () => {
    expect(TAG_COLORS).toHaveLength(20);
  });

  it("is all 6-digit lowercase hex, and every value is distinct", () => {
    for (const color of TAG_COLORS) expect(color).toMatch(/^#[0-9a-f]{6}$/);
    expect(new Set(TAG_COLORS).size).toBe(TAG_COLORS.length);
  });

  // Every swatch has to survive the schema that guards the column, or the
  // picker can offer a color the server then rejects.
  it("every swatch passes the color schema", () => {
    for (const color of TAG_COLORS) {
      expect(accentColorSchema.safeParse(color).success).toBe(true);
    }
  });

  // One palette, two names. The vault re-exports this array rather than keeping
  // its own copy, so a folder tint and a transaction tag can't drift apart.
  it("is the same array the vault uses", () => {
    expect(VAULT_COLORS).toBe(TAG_COLORS);
    expect(vaultColorSchema).toBe(accentColorSchema);
  });
});

describe("defaultTagColor", () => {
  it("is deterministic and always a palette swatch", () => {
    for (const name of ["Travel", "Reimbursable", "", "🎧 gear", "a".repeat(40)]) {
      const color = defaultTagColor(name);
      expect(TAG_COLORS).toContain(color);
      expect(defaultTagColor(name)).toBe(color);
    }
  });

  // The popup pre-fills from whatever the user has typed so far, which may be
  // mid-word or padded; "Travel" and "travel " must not open on two colors.
  it("ignores case and surrounding space", () => {
    expect(defaultTagColor("Travel")).toBe(defaultTagColor("  travel  "));
  });

  it("spreads different names across the palette", () => {
    const names = ["travel", "food", "rent", "fuel", "gifts", "health", "books"];
    expect(new Set(names.map(defaultTagColor)).size).toBeGreaterThan(1);
  });
});

describe("serializeTxnTag", () => {
  it("renders timestamps as ISO strings", () => {
    const row = {
      id: uuid(1),
      userId: uuid(2),
      workspaceId: uuid(3),
      name: "Travel",
      color: "#ef4444",
      createdAt: new Date("2026-09-21T10:00:00.000Z"),
      updatedAt: new Date("2026-09-22T10:00:00.000Z"),
    } satisfies Tag;
    expect(serializeTxnTag(row)).toEqual({
      id: uuid(1),
      name: "Travel",
      color: "#ef4444",
      createdAt: "2026-09-21T10:00:00.000Z",
      updatedAt: "2026-09-22T10:00:00.000Z",
    });
  });

  // The DTO crosses to client components; leaking the workspace or the creator
  // would put ids on the wire that nothing on that side is entitled to.
  it("carries no workspace or author id", () => {
    const row = {
      id: uuid(1),
      userId: uuid(2),
      workspaceId: uuid(3),
      name: "Travel",
      color: "#ef4444",
      createdAt: new Date(),
      updatedAt: new Date(),
    } satisfies Tag;
    expect(Object.keys(serializeTxnTag(row)).sort()).toEqual([
      "color",
      "createdAt",
      "id",
      "name",
      "updatedAt",
    ]);
  });
});

describe("txnTagIdsSchema", () => {
  it("dedupes, preserving first-seen order", () => {
    const parsed = txnTagIdsSchema.parse([uuid(2), uuid(1), uuid(2)]);
    expect(parsed).toEqual([uuid(2), uuid(1)]);
  });

  it("caps the count", () => {
    const ids = Array.from({ length: TAGS_PER_TRANSACTION_MAX + 1 }, (_, i) => uuid(i));
    expect(txnTagIdsSchema.safeParse(ids).success).toBe(false);
    expect(txnTagIdsSchema.safeParse(ids.slice(0, -1)).success).toBe(true);
  });

  // Dedupe runs after the cap, so eleven ids that are really three must not be
  // rejected... and must not sneak past it either. Pin the order of operations.
  it("rejects on the raw count, before dedupe", () => {
    const ids = Array.from({ length: TAGS_PER_TRANSACTION_MAX + 1 }, () => uuid(1));
    expect(txnTagIdsSchema.safeParse(ids).success).toBe(false);
  });

  it("rejects anything that isn't a uuid", () => {
    expect(txnTagIdsSchema.safeParse(["travel"]).success).toBe(false);
    expect(txnTagIdsSchema.safeParse([""]).success).toBe(false);
  });
});

describe("createTxnTagSchema / updateTxnTagSchema", () => {
  it("trims the name and requires one", () => {
    expect(createTxnTagSchema.parse({ name: "  Travel  ", color: "#ef4444" }).name).toBe("Travel");
    expect(createTxnTagSchema.safeParse({ name: "   ", color: "#ef4444" }).success).toBe(false);
  });

  it("caps the name at the column width", () => {
    const ok = "a".repeat(TAG_NAME_MAX);
    expect(createTxnTagSchema.safeParse({ name: ok, color: "#ef4444" }).success).toBe(true);
    expect(createTxnTagSchema.safeParse({ name: ok + "a", color: "#ef4444" }).success).toBe(false);
  });

  // The chip builds its border and fill by appending an alpha suffix to this
  // value, so anything but a 6-digit hex paints a half-styled chip.
  it("rejects colors that aren't 6-digit hex", () => {
    for (const bad of ["red", "#fff", "#GGGGGG", "rgb(0,0,0)", "ef4444", ""]) {
      expect(createTxnTagSchema.safeParse({ name: "Travel", color: bad }).success).toBe(false);
    }
  });

  it("allows a partial update but always needs an id", () => {
    expect(updateTxnTagSchema.safeParse({ id: uuid(1), name: "Trips" }).success).toBe(true);
    expect(updateTxnTagSchema.safeParse({ id: uuid(1), color: "#22c55e" }).success).toBe(true);
    expect(updateTxnTagSchema.safeParse({ name: "Trips" }).success).toBe(false);
  });
});

describe("transactionInputSchema.tagIds", () => {
  const base = { type: "expense", amount: 10, occurredOn: "2026-09-21" } as const;

  // Absent has to stay distinguishable from empty: `updateTransaction` reads
  // `undefined` as "leave the tags alone", so a default of `[]` here would make
  // every partial update strip the row's tags.
  it("is undefined when omitted, never defaulted to an empty array", () => {
    expect(transactionInputSchema.parse(base).tagIds).toBeUndefined();
  });

  it("keeps an explicit empty array, which is how tags are cleared", () => {
    expect(transactionInputSchema.parse({ ...base, tagIds: [] }).tagIds).toEqual([]);
  });

  it("dedupes ids passed with a transaction", () => {
    expect(transactionInputSchema.parse({ ...base, tagIds: [uuid(1), uuid(1)] }).tagIds).toEqual([
      uuid(1),
    ]);
  });
});

describe("setTransactionTagsSchema", () => {
  it("requires both the row id and the tag list", () => {
    expect(setTransactionTagsSchema.safeParse({ id: uuid(1), tagIds: [] }).success).toBe(true);
    expect(setTransactionTagsSchema.safeParse({ id: uuid(1) }).success).toBe(false);
    expect(setTransactionTagsSchema.safeParse({ tagIds: [] }).success).toBe(false);
  });
});

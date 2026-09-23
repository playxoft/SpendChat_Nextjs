import { describe, it, expect } from "vitest";
import {
  TAG_COLORS,
  defaultTagColor,
  sameTagSet,
  serializeTxnTag,
  sortTagsByName,
  stepPickerIndex,
  markerPickerModel,
} from "@/lib/tags";
import { mergeCreatedTags } from "@/components/app/tags/use-created-tags";
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

  // The cap is applied to the raw array, before the dedupe transform runs — so
  // eleven ids that are really one are still rejected. Pinned because the
  // ordering is invisible in the schema and a reader could reasonably assume
  // the opposite; if the product ever wants "dedupe, then count", this is the
  // test that says it was a decision.
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

describe("markerPickerModel", () => {
  const tags = [
    { id: "1", name: "food" },
    { id: "2", name: "fuel" },
    { id: "3", name: "furniture" },
  ];
  const model = (query: string, rawIndex = 0, applied: string[] = []) =>
    markerPickerModel({ options: tags, query, applied, rawIndex });

  it("filters case-insensitively and hides tags already applied", () => {
    expect(model("fu").results.map((t) => t.name)).toEqual(["fuel", "furniture"]);
    expect(model("FU").results.map((t) => t.name)).toEqual(["fuel", "furniture"]);
    expect(model("fu", 0, ["2"]).results.map((t) => t.name)).toEqual(["furniture"]);
  });

  // A bare "#" means "show me the list", so it must not offer to create "".
  it("offers Create only for a new, non-empty name", () => {
    expect(model("").creatable).toBe(false);
    expect(model("   ").creatable).toBe(false);
    expect(model("trav").creatable).toBe(true);
    // Case-insensitive, matching the DB's lower(name) unique index — offering
    // "Create food" beside an existing "food" promises what the server rejects.
    expect(model("food").creatable).toBe(false);
    expect(model("FOOD").creatable).toBe(false);
  });

  it("counts the Create row as the last option", () => {
    const m = model("fu");
    expect(m.optionCount).toBe(3); // fuel, furniture, Create
    expect(markerPickerModel({ options: tags, query: "fu", applied: [], rawIndex: 2 }).onCreateRow).toBe(true);
    expect(markerPickerModel({ options: tags, query: "fu", applied: [], rawIndex: 1 }).onCreateRow).toBe(false);
    // No create row when the name exists: only the matches are options.
    expect(model("food").optionCount).toBe(1);
  });

  // The bug this function exists for. The raw index survives the list shrinking
  // as the query narrows; read directly it highlights a row that isn't there.
  it("clamps an index left over from a longer list", () => {
    // "#fu" → [fuel, furniture] + Create = 3 options, highlight the last.
    expect(model("fu", 2).activeIndex).toBe(2);
    // Type "e" → "#fue" → [fuel] + Create = 2. The stale 2 must clamp to 1.
    const narrowed = model("fue", 2);
    expect(narrowed.optionCount).toBe(2);
    expect(narrowed.activeIndex).toBe(1);
  });

  it("is safe on an empty list and on a negative index", () => {
    expect(markerPickerModel({ options: [], query: "", applied: [], rawIndex: 5 })).toMatchObject({
      optionCount: 0,
      activeIndex: 0,
      onCreateRow: false,
    });
    expect(model("fu", -3).activeIndex).toBe(0);
  });
});

describe("stepPickerIndex", () => {
  it("wraps in both directions", () => {
    expect(stepPickerIndex(0, 3, 1)).toBe(1);
    expect(stepPickerIndex(2, 3, 1)).toBe(0);
    expect(stepPickerIndex(0, 3, -1)).toBe(2);
    expect(stepPickerIndex(1, 3, -1)).toBe(0);
  });

  // Stepping from the *clamped* index is what makes the first arrow press move
  // after the list shrank. From a raw 2 with 2 options, both directions compute
  // 1 — which is where the highlight already was, so the press looked ignored.
  it("moves on the first press after the list shrank", () => {
    const { activeIndex, optionCount } = markerPickerModel({
      options: [{ id: "1", name: "fuel" }],
      query: "fue",
      applied: [],
      rawIndex: 2,
    });
    expect(activeIndex).toBe(1);
    expect(stepPickerIndex(activeIndex, optionCount, 1)).toBe(0);
    expect(stepPickerIndex(activeIndex, optionCount, -1)).toBe(0);
  });

  it("returns 0 when there is nothing to step through", () => {
    expect(stepPickerIndex(0, 0, 1)).toBe(0);
  });
});

describe("sortTagsByName", () => {
  const t = (name: string) => ({ id: name, name, color: "#ef4444" });

  it("orders by lower(name), matching the SQL the read uses", () => {
    // A C-collation database sorts every capital before every lowercase and
    // en_US.UTF-8 doesn't; the embed in `queries.ts` uses `lower(name)`, so
    // this has to as well or the optimistic patch disagrees with the refetch.
    expect(sortTagsByName([t("zebra"), t("Apple"), t("mango")]).map((x) => x.name)).toEqual([
      "Apple",
      "mango",
      "zebra",
    ]);
  });

  it("does not mutate its input", () => {
    const input = [t("b"), t("a")];
    sortTagsByName(input);
    expect(input.map((x) => x.name)).toEqual(["b", "a"]);
  });
});

describe("sameTagSet", () => {
  it("ignores order", () => {
    // The stored array's order is real in the column and invisible everywhere
    // else, so a reorder must not make a form dirty: untick a tag and tick it
    // again and the saved row is identical.
    expect(sameTagSet(["a", "b"], ["b", "a"])).toBe(true);
  });

  it("notices an added, removed or swapped id", () => {
    expect(sameTagSet(["a"], ["a", "b"])).toBe(false);
    expect(sameTagSet(["a", "b"], ["a"])).toBe(false);
    expect(sameTagSet(["a", "b"], ["a", "c"])).toBe(false);
    expect(sameTagSet([], [])).toBe(true);
  });
});

describe("mergeCreatedTags", () => {
  const tag = (id: string, name: string) => ({
    id,
    name,
    color: "#ef4444",
    createdAt: "",
    updatedAt: "",
  });

  it("appends a locally created tag the server hasn't caught up with", () => {
    const merged = mergeCreatedTags([tag("1", "Apple")], [tag("2", "New")]);
    expect(merged.map((t) => t.id)).toEqual(["1", "2"]);
  });

  it("lets the server copy win once it arrives", () => {
    // A rename made in another tab must not be masked by the stale local copy.
    const merged = mergeCreatedTags([tag("1", "Renamed")], [tag("1", "Original")]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.name).toBe("Renamed");
  });

  it("returns the server array untouched when there is nothing local", () => {
    const server = [tag("1", "Apple")];
    expect(mergeCreatedTags(server, [])).toBe(server);
  });
});

describe("markerPickerModel drives the category picker too", () => {
  // Single-valued marker: nothing is ever "already applied", so `applied` is
  // omitted. The list and the trailing Create row have to work the same way.
  const categories = [
    { id: "1", name: "Food" },
    { id: "2", name: "Fuel" },
  ];

  it("filters and still offers a Create row for an unknown name", () => {
    const m = markerPickerModel({ options: categories, query: "fu", rawIndex: 0 });
    expect(m.results.map((c) => c.name)).toEqual(["Fuel"]);
    expect(m.creatable).toBe(true);
    expect(m.optionCount).toBe(2);
  });

  it("offers no Create row for a name that already exists", () => {
    expect(markerPickerModel({ options: categories, query: "food", rawIndex: 0 }).creatable).toBe(
      false,
    );
  });

  it("shows everything for a bare marker, with nothing to create", () => {
    const m = markerPickerModel({ options: categories, query: "", rawIndex: 0 });
    expect(m.results).toHaveLength(2);
    expect(m.creatable).toBe(false);
  });
});

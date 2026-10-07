import { describe, expect, it } from "vitest";
import { SPLIT_GROUP_MAX_PEOPLE } from "@/lib/plans";
import { mapImportExpense, SPLIT_IMPORT_EXPENSES_MAX, type SplitImportExpense } from "@/lib/split-import";
import { computeShares } from "@/lib/split-math";
import {
  buildImportInput,
  computeLedger,
  defaultDraft,
  DRAFT_AMOUNT_MAX,
  DRAFT_EXPENSES_MAX,
  DRAFT_NAME_MAX,
  DRAFT_PEOPLE_MAX,
  DRAFT_PERSON_NAME_MAX,
  DRAFT_TITLE_MAX,
  exampleDraft,
  expenseShares,
  draftHash,
  emailProblems,
  importOrder,
  importStart,
  isBlankDraft,
  looksLikeEmail,
  readyToImport,
  resolveMe,
  UNNAMED_GROUP,
  nextId,
  peopleInUse,
  personLabel,
  sanitizeDraft,
  settleUpText,
  splitSummary,
  UNTITLED_EXPENSE,
  type DraftExpense,
  type SplitDraft,
} from "@/lib/tools/split-bill";
import {
  SPLIT_EXPENSE_TITLE_MAX,
  SPLIT_GROUP_NAME_MAX,
  SPLIT_MEMBER_NAME_MAX,
  splitExpenseSchema,
  splitImportSchema,
  TRANSACTION_AMOUNT_MAX,
} from "@/lib/validation";

const TODAY = "2026-10-07";

function draft(patch: Partial<SplitDraft> = {}): SplitDraft {
  return {
    ...defaultDraft("INR"),
    name: "Goa trip",
    people: [
      { id: "p0001", name: "Asha" },
      { id: "p0002", name: "Ben" },
      { id: "p0003", name: "Chloe" },
    ],
    ...patch,
  };
}

function expense(patch: Partial<DraftExpense> & Pick<DraftExpense, "id">): DraftExpense {
  return {
    title: "Dinner",
    amountMinor: 300_000,
    paidBy: "p0001",
    on: TODAY,
    split: { type: "equal", ids: ["p0001", "p0002", "p0003"] },
    ...patch,
  };
}

describe("the tool's caps match the app's", () => {
  it("pins every limit to validation.ts / plans.ts", () => {
    expect(DRAFT_NAME_MAX).toBe(SPLIT_GROUP_NAME_MAX);
    expect(DRAFT_PERSON_NAME_MAX).toBe(SPLIT_MEMBER_NAME_MAX);
    expect(DRAFT_TITLE_MAX).toBe(SPLIT_EXPENSE_TITLE_MAX);
    expect(DRAFT_AMOUNT_MAX).toBe(TRANSACTION_AMOUNT_MAX);
    expect(DRAFT_PEOPLE_MAX).toBe(SPLIT_GROUP_MAX_PEOPLE);
    expect(DRAFT_EXPENSES_MAX).toBe(SPLIT_IMPORT_EXPENSES_MAX);
  });
});

describe("defaultDraft / isBlankDraft / exampleDraft", () => {
  it("starts with two unnamed people and nothing spent", () => {
    const d = defaultDraft("EUR");
    expect(d).toMatchObject({ v: 2, name: "", currency: "EUR", expenses: [] });
    expect(d.people).toHaveLength(2);
    expect(isBlankDraft(d)).toBe(true);
  });

  it("falls back to USD for a currency the app doesn't know", () => {
    expect(defaultDraft("XYZ").currency).toBe("USD");
  });

  it("is no longer blank once anything is named or spent", () => {
    expect(isBlankDraft({ ...defaultDraft(), name: "Trip" })).toBe(false);
    expect(isBlankDraft(draft())).toBe(false);
  });

  it("builds an example with one expense of each kind that adds up, in the currency's own decimals", () => {
    for (const currency of ["INR", "JPY", "KWD"]) {
      const ex = exampleDraft(currency, TODAY);
      expect(ex.expenses.map((e) => e.split.type)).toEqual(["equal", "exact", "percent"]);
      const ledger = computeLedger(ex);
      expect(ledger.invalid).toEqual([]);
      expect(ledger.balances.reduce((a, b) => a + b.netMinor, 0)).toBe(0);
      expect(sanitizeDraft(JSON.parse(JSON.stringify(ex)))).toEqual(ex);
    }
    expect(exampleDraft("JPY", TODAY).expenses[0]!.amountMinor).toBe(300);
    expect(exampleDraft("KWD", TODAY).expenses[0]!.amountMinor).toBe(300_000);
  });
});

describe("ids and labels", () => {
  it("nextId is one past the highest, zero-padded so it sorts in add order", () => {
    expect(nextId("p", [])).toBe("p0001");
    expect(nextId("p", [{ id: "p0001" }, { id: "p0009" }])).toBe("p0010");
    expect(nextId("e", [{ id: "p0040" }, { id: "e0002" }])).toBe("e0003");
    expect(["p0009", "p0010"].sort()).toEqual(["p0009", "p0010"]);
  });

  it("labels an unnamed person by position, and an unknown id as Someone", () => {
    const people = [
      { id: "p0001", name: "  Asha " },
      { id: "p0002", name: "" },
    ];
    expect(personLabel(people, "p0001")).toBe("Asha");
    expect(personLabel(people, "p0002")).toBe("Person 2");
    expect(personLabel(people, "p0099")).toBe("Someone");
  });

  it("knows who's on an expense", () => {
    const d = draft({
      expenses: [expense({ id: "e0001", paidBy: "p0003", split: { type: "exact", shares: [{ id: "p0002", minor: 300_000 }] } })],
    });
    expect([...peopleInUse(d)].sort()).toEqual(["p0002", "p0003"]);
  });

  it("summarises a split in words", () => {
    expect(splitSummary({ type: "equal", ids: ["a", "b", "c"] })).toBe("split equally between 3");
    expect(splitSummary({ type: "exact", shares: [{ id: "a", minor: 1 }, { id: "b", minor: 0 }] })).toBe(
      "exact amounts for 1",
    );
    expect(splitSummary({ type: "percent", shares: [{ id: "a", bp: 10_000 }] })).toBe("by percent for 1");
  });
});

describe("sanitizeDraft", () => {
  it("round-trips a good draft", () => {
    const d = draft({ expenses: [expense({ id: "e0001" })] });
    expect(sanitizeDraft(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });

  it("refuses what isn't a draft at all", () => {
    for (const raw of [null, "x", [], { v: 3, currency: "INR", people: [{ id: "p0001", name: "A" }], expenses: [] }]) {
      expect(sanitizeDraft(raw)).toBeNull();
    }
    expect(sanitizeDraft({ ...draft(), currency: "XYZ" })).toBeNull();
    expect(sanitizeDraft({ ...draft(), people: [] })).toBeNull();
    expect(sanitizeDraft({ ...draft(), expenses: "nope" })).toBeNull();
  });

  it("drops bad people and duplicate ids, and cuts names to the cap", () => {
    const d = sanitizeDraft({
      ...draft(),
      name: "x".repeat(99),
      people: [
        { id: "p0001", name: "A".repeat(99) },
        { id: "p0001", name: "dupe" },
        { id: "BAD ID", name: "x" },
        { id: "p0002", name: 7 },
        "nope",
      ],
    })!;
    expect(d.name).toHaveLength(DRAFT_NAME_MAX);
    expect(d.people).toEqual([
      { id: "p0001", name: "A".repeat(DRAFT_PERSON_NAME_MAX) },
      { id: "p0002", name: "" },
    ]);
  });

  it("drops an expense that doesn't parse and keeps the rest", () => {
    const good = expense({ id: "e0001" });
    const d = sanitizeDraft({
      ...draft(),
      expenses: [
        good,
        { ...good, id: "e0001" }, // duplicate id
        { ...good, id: "e0002", amountMinor: 0 },
        { ...good, id: "e0003", amountMinor: 1.5 },
        { ...good, id: "e0004", paidBy: "p0099" },
        { ...good, id: "e0005", on: "7 Oct" },
        { ...good, id: "e0006", split: { type: "equal", ids: ["p0099"] } },
        { ...good, id: "e0007", split: { type: "percent", shares: [{ id: "p0001", bp: 10_001 }] } },
        { ...good, id: "e0008", split: { type: "weird" } },
      ],
    })!;
    expect(d.expenses).toEqual([good]);
  });

  it("filters unknown people out of a split rather than dropping the expense", () => {
    const d = sanitizeDraft({
      ...draft(),
      expenses: [expense({ id: "e0001", split: { type: "equal", ids: ["p0001", "p0099", "p0001", "p0002"] } })],
    })!;
    expect(d.expenses[0]!.split).toEqual({ type: "equal", ids: ["p0001", "p0002"] });
  });

  it("caps people and expenses at the app's limits", () => {
    const people = Array.from({ length: 60 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
    const expenses = Array.from({ length: 250 }, (_, i) =>
      expense({ id: `e${i}`, paidBy: "p0", split: { type: "equal", ids: ["p0", "p1"] } }),
    );
    const d = sanitizeDraft({ ...draft(), people, expenses })!;
    expect(d.people).toHaveLength(DRAFT_PEOPLE_MAX);
    expect(d.expenses).toHaveLength(DRAFT_EXPENSES_MAX);
  });
});

describe("computeLedger", () => {
  it("nets balances and lists who pays whom (the page's worked example)", () => {
    const d = draft({
      expenses: [
        expense({ id: "e0001", title: "Cabin", amountMinor: 300_000 }),
        expense({ id: "e0002", title: "Groceries", amountMinor: 60_000, paidBy: "p0002" }),
      ],
    });
    const ledger = computeLedger(d);
    expect(ledger.totalMinor).toBe(360_000);
    expect(ledger.balances).toEqual([
      { id: "p0001", paidMinor: 300_000, shareMinor: 120_000, netMinor: 180_000 },
      { id: "p0002", paidMinor: 60_000, shareMinor: 120_000, netMinor: -60_000 },
      { id: "p0003", paidMinor: 0, shareMinor: 120_000, netMinor: -120_000 },
    ]);
    expect(ledger.payments).toEqual([
      { from: "p0003", to: "p0001", amountMinor: 120_000 },
      { from: "p0002", to: "p0001", amountMinor: 60_000 },
    ]);
  });

  it("handles exact and percent splits, and leaves out one that doesn't add up", () => {
    const d = draft({
      expenses: [
        expense({
          id: "e0001",
          amountMinor: 9_000,
          paidBy: "p0002",
          split: { type: "exact", shares: [{ id: "p0001", minor: 2_000 }, { id: "p0002", minor: 7_000 }] },
        }),
        expense({
          id: "e0002",
          amountMinor: 1_000,
          paidBy: "p0003",
          split: { type: "percent", shares: [{ id: "p0001", bp: 2_500 }, { id: "p0003", bp: 7_500 }] },
        }),
        expense({
          id: "e0003",
          amountMinor: 5_000,
          split: { type: "exact", shares: [{ id: "p0001", minor: 1 }] },
        }),
      ],
    });
    const ledger = computeLedger(d);
    expect(ledger.invalid).toEqual(["e0003"]);
    expect(ledger.totalMinor).toBe(10_000);
    expect(Object.fromEntries(ledger.balances.map((b) => [b.id, b.netMinor]))).toEqual({
      p0001: -2_250,
      p0002: 2_000,
      p0003: 250,
    });
  });

  it("breaks a leftover-cent tie by position, the way the app's member ids do", () => {
    // 100 between three, paid by someone outside the split: one extra paisa,
    // and it goes to whoever comes first in the order.
    const d = draft({
      expenses: [expense({ id: "e0001", amountMinor: 100, paidBy: "p0003", split: { type: "equal", ids: ["p0001", "p0002"] } })],
    });
    // Draft order: Asha first takes the extra paisa.
    const shares = expenseShares(d.expenses[0]!, d.people.map((p) => p.id));
    expect(shares).toEqual([
      { memberId: "p0001", amountMinor: 50 },
      { memberId: "p0002", amountMinor: 50 },
    ]);
    const odd = draft({
      expenses: [expense({ id: "e0001", amountMinor: 101, paidBy: "p0003", split: { type: "equal", ids: ["p0001", "p0002"] } })],
    });
    expect(computeLedger(odd).balances.map((b) => b.shareMinor)).toEqual([51, 50, 0]);
    // With Ben imported as "you" he's created first, so the app gives him the paisa.
    expect(computeLedger(odd, importOrder(odd, "p0002")).balances.map((b) => b.shareMinor)).toEqual([50, 51, 0]);
  });

  it("matches what computeShares gives for uuid-like ids in creation order", () => {
    const d = draft({
      expenses: [
        expense({ id: "e0001", amountMinor: 1_000, paidBy: "p0002", split: { type: "percent", shares: [
          { id: "p0001", bp: 3_333 },
          { id: "p0002", bp: 3_333 },
          { id: "p0003", bp: 3_334 },
        ] } }),
      ],
    });
    const ids = { p0001: "m-1", p0002: "m-2", p0003: "m-3" } as const;
    const app = computeShares(1_000, ids.p0002, {
      type: "percent",
      shares: [
        { memberId: ids.p0001, bp: 3_333 },
        { memberId: ids.p0002, bp: 3_333 },
        { memberId: ids.p0003, bp: 3_334 },
      ],
    });
    const tool = computeLedger(d).balances.map((b) => b.shareMinor);
    expect(tool).toEqual([app.find((s) => s.memberId === "m-1")!.amountMinor, app.find((s) => s.memberId === "m-2")!.amountMinor, app.find((s) => s.memberId === "m-3")!.amountMinor]);
  });

  it("reads 'settled up' when everyone paid their own way", () => {
    const d = draft({
      expenses: [expense({ id: "e0001", amountMinor: 500, split: { type: "equal", ids: ["p0001"] } })],
    });
    expect(computeLedger(d).payments).toEqual([]);
  });
});

describe("buildImportInput — the draft as the import action takes it", () => {
  const d = draft({
    expenses: [
      expense({ id: "e0001", title: "  " }),
      expense({
        id: "e0002",
        title: "Taxi",
        amountMinor: 1_050,
        paidBy: "p0002",
        split: { type: "exact", shares: [{ id: "p0002", minor: 50 }, { id: "p0003", minor: 1_000 }] },
      }),
      expense({
        id: "e0003",
        amountMinor: 999,
        paidBy: "p0003",
        split: { type: "percent", shares: [{ id: "p0001", bp: 1_250 }, { id: "p0003", bp: 8_750 }] },
      }),
      expense({ id: "e0004", amountMinor: 10, split: { type: "exact", shares: [{ id: "p0001", minor: 1 }] } }),
    ],
  });
  const input = buildImportInput({
    draft: d,
    name: "  Goa trip ",
    meId: "p0002",
    emails: { p0001: " Asha@Example.com ", p0003: "chloe@example.com" },
  });

  it("makes the chosen person the creator and invites everyone else in order", () => {
    expect(input).toMatchObject({ name: "Goa trip", icon: null, currency: "INR", me: { ref: "p0002", name: "Ben" } });
    expect(input.people).toEqual([
      { ref: "p0001", name: "Asha", email: "asha@example.com" },
      { ref: "p0003", name: "Chloe", email: "chloe@example.com" },
    ]);
  });

  it("sends amounts in major units, percents as typed, and leaves out what doesn't add up", () => {
    expect(input.expenses).toEqual([
      { title: UNTITLED_EXPENSE, amount: 3_000, paidBy: "p0001", occurredOn: TODAY, splitType: "equal", memberIds: ["p0001", "p0002", "p0003"] },
      {
        title: "Taxi",
        amount: 10.5,
        paidBy: "p0002",
        occurredOn: TODAY,
        splitType: "exact",
        shares: [
          { memberId: "p0002", amount: 0.5 },
          { memberId: "p0003", amount: 10 },
        ],
      },
      {
        title: "Dinner",
        amount: 9.99,
        paidBy: "p0003",
        occurredOn: TODAY,
        splitType: "percent",
        shares: [
          { memberId: "p0001", percent: 12.5 },
          { memberId: "p0003", percent: 87.5 },
        ],
      },
    ]);
  });

  it("passes the server's import schema", () => {
    expect(splitImportSchema.safeParse(input).success).toBe(true);
  });

  it("maps to inputs the app's own expense schema accepts", () => {
    const ids: Record<string, string> = {
      p0001: "0199b1a0-0000-7000-8000-000000000001",
      p0002: "0199b1a0-0000-7000-8000-000000000002",
      p0003: "0199b1a0-0000-7000-8000-000000000003",
    };
    for (const e of input.expenses) {
      const mapped = mapImportExpense(e, (ref) => ids[ref]);
      expect(mapped).not.toBeNull();
      expect(splitExpenseSchema.safeParse(mapped).success).toBe(true);
    }
  });
});

describe("mapImportExpense", () => {
  const ids: Record<string, string> = { a: "id-a", b: "id-b" };
  const idOf = (ref: string) => ids[ref];
  const base = { title: "x", amount: 1, occurredOn: TODAY };

  it("swaps every person key for a member id", () => {
    const equal: SplitImportExpense = { ...base, paidBy: "a", splitType: "equal", memberIds: ["a", "b"] };
    expect(mapImportExpense(equal, idOf)).toEqual({ ...equal, paidBy: "id-a", memberIds: ["id-a", "id-b"] });
    const exact: SplitImportExpense = { ...base, paidBy: "b", splitType: "exact", shares: [{ memberId: "a", amount: 1 }] };
    expect(mapImportExpense(exact, idOf)).toEqual({ ...exact, paidBy: "id-b", shares: [{ memberId: "id-a", amount: 1 }] });
    const percent: SplitImportExpense = {
      ...base,
      paidBy: "a",
      splitType: "percent",
      shares: [{ memberId: "b", percent: 100 }],
    };
    expect(mapImportExpense(percent, idOf)).toEqual({ ...percent, paidBy: "id-a", shares: [{ memberId: "id-b", percent: 100 }] });
  });

  it("refuses a key that isn't someone in the import", () => {
    expect(mapImportExpense({ ...base, paidBy: "z", splitType: "equal", memberIds: ["a"] }, idOf)).toBeNull();
    expect(mapImportExpense({ ...base, paidBy: "a", splitType: "equal", memberIds: ["a", "z"] }, idOf)).toBeNull();
    expect(
      mapImportExpense({ ...base, paidBy: "a", splitType: "exact", shares: [{ memberId: "z", amount: 1 }] }, idOf),
    ).toBeNull();
    expect(
      mapImportExpense({ ...base, paidBy: "a", splitType: "percent", shares: [{ memberId: "z", percent: 1 }] }, idOf),
    ).toBeNull();
  });
});

describe("splitImportSchema", () => {
  const ok = {
    key: "d-test01",
    name: "Trip",
    currency: "INR",
    me: { ref: "p0001", name: "Asha" },
    people: [{ ref: "p0002", name: "Ben", email: "ben@example.com" }],
    expenses: [],
  };

  it("accepts a minimal import", () => {
    expect(splitImportSchema.safeParse(ok).success).toBe(true);
  });

  it("refuses duplicate keys, duplicate emails, bad keys and too many people", () => {
    expect(splitImportSchema.safeParse({ ...ok, people: [{ ...ok.people[0], ref: "p0001" }] }).success).toBe(false);
    expect(
      splitImportSchema.safeParse({
        ...ok,
        people: [ok.people[0], { ref: "p0003", name: "B2", email: "BEN@example.com" }],
      }).success,
    ).toBe(false);
    expect(splitImportSchema.safeParse({ ...ok, me: { ref: "../x", name: "A" } }).success).toBe(false);
    const fifty = Array.from({ length: SPLIT_GROUP_MAX_PEOPLE }, (_, i) => ({
      ref: `p${i + 10}`,
      name: `P${i}`,
      email: `p${i}@example.com`,
    }));
    expect(splitImportSchema.safeParse({ ...ok, people: fifty }).success).toBe(false);
    expect(splitImportSchema.safeParse({ ...ok, people: fifty.slice(1) }).success).toBe(true);
  });

  it("refuses more expenses than one import carries", () => {
    const e = { title: "x", amount: 1, paidBy: "p0001", occurredOn: TODAY, splitType: "equal", memberIds: ["p0001"] };
    expect(
      splitImportSchema.safeParse({ ...ok, expenses: Array.from({ length: SPLIT_IMPORT_EXPENSES_MAX + 1 }, () => e) }).success,
    ).toBe(false);
  });
});

describe("settleUpText", () => {
  it("reads like a message for the group chat", () => {
    const d = draft({ expenses: [expense({ id: "e0001", amountMinor: 300 })] });
    const text = settleUpText(d, computeLedger(d), (m) => `₹${m / 100}`, "https://example.com/tool");
    expect(text).toBe(
      ["Goa trip — ₹3 in total. To settle up:", "Ben pays Asha ₹1", "Chloe pays Asha ₹1", "", "Worked out with https://example.com/tool"].join("\n"),
    );
  });

  it("says so when everyone is settled", () => {
    const d = draft({ name: "", expenses: [] });
    expect(settleUpText(d, computeLedger(d), String, "link")).toContain("Our group — 0 in total");
    expect(settleUpText(d, computeLedger(d), String, "link")).toContain("Everyone is settled up.");
  });
});

describe("optional emails (draft v2)", () => {
  it("reads a v1 draft as v2 with no emails, and keeps v2 emails", () => {
    const v1 = { ...draft(), v: 1 };
    const migrated = sanitizeDraft(JSON.parse(JSON.stringify(v1)))!;
    expect(migrated.v).toBe(2);
    expect(migrated.people.every((p) => p.email === undefined)).toBe(true);

    const v2 = draft({ people: [{ id: "p0001", name: "Asha", email: " asha@example.com " }, { id: "p0002", name: "Ben", email: "" }] });
    const read = sanitizeDraft(JSON.parse(JSON.stringify(v2)))!;
    expect(read.people).toEqual([
      { id: "p0001", name: "Asha", email: " asha@example.com " },
      { id: "p0002", name: "Ben" },
    ]);
    expect(sanitizeDraft({ ...v2, people: [{ id: "p0001", name: "A", email: "x".repeat(300) }] })!.people[0]!.email).toHaveLength(100);
  });

  it("counts an email as content, so a draft with only an email isn't blank", () => {
    const d = defaultDraft();
    expect(isBlankDraft({ ...d, people: [{ id: "p0001", name: "", email: "a@b.co" }] })).toBe(false);
  });

  it("checks emails lightly", () => {
    expect(looksLikeEmail("asha@example.com")).toBe(true);
    expect(looksLikeEmail(" Asha@Example.COM ")).toBe(true);
    for (const bad of ["asha", "asha@", "asha@example", "a b@example.com", `${"x".repeat(95)}@example.com`]) {
      expect(looksLikeEmail(bad), bad).toBe(false);
    }
  });

  it("flags bad, duplicate (same inbox) and your own emails — never blank ones", () => {
    const people = [
      { id: "p0001", name: "Me", email: "me@example.com" },
      { id: "p0002", name: "Asha", email: "asha.rao@gmail.com" },
      { id: "p0003", name: "Ben", email: "ashara.o+trip@googlemail.com" },
      { id: "p0004", name: "Chloe", email: "chloe@" },
      { id: "p0005", name: "Dev", email: "" },
      { id: "p0006", name: "Eve", email: "ME@example.com" },
    ];
    expect(emailProblems(people)).toEqual({
      p0003: "Same inbox as Asha",
      p0004: "Check this email",
      p0006: "Same inbox as Me",
    });
    expect(emailProblems(people, { skip: "p0001", mine: "me@example.com" })).toEqual({
      p0003: "Same inbox as Asha",
      p0004: "Check this email",
      p0006: "That's you — pick this row as “you” instead",
    });
  });

  it("works out who's you: by your own email, else the first row if it has no email, else asks", () => {
    const base = draft();
    expect(resolveMe(base, "me@example.com")).toBe("p0001");
    const withEmails = draft({
      people: [
        { id: "p0001", name: "Asha", email: "asha@example.com" },
        { id: "p0002", name: "Ben", email: "ben@example.com" },
        { id: "p0003", name: "Chloe" },
      ],
    });
    expect(resolveMe(withEmails, "BEN@example.com")).toBe("p0002");
    // The "You" row has someone's address that isn't yours: ask.
    expect(resolveMe(withEmails, "chloe@example.com")).toBeNull();
    expect(resolveMe(withEmails, null)).toBeNull();
    const twice = draft({
      people: [
        { id: "p0001", name: "A", email: "me@example.com" },
        { id: "p0002", name: "B", email: "me+2@example.com" },
      ],
    });
    expect(resolveMe(twice, "me@example.com")).toBeNull();
  });

  it("is ready to import with no form only when everything is in place", () => {
    const ready = draft({
      people: [
        { id: "p0001", name: "Asha" },
        { id: "p0002", name: "Ben", email: "ben@example.com" },
        { id: "p0003", name: "Chloe", email: "chloe@example.com" },
      ],
      expenses: [expense({ id: "e0001" })],
    });
    expect(readyToImport(ready, "p0001", "asha@example.com")).toBe(true);
    expect(readyToImport(ready, null, "asha@example.com")).toBe(false);
    expect(readyToImport(ready, "p0002", "asha@example.com")).toBe(false); // Asha has no email
    expect(readyToImport(ready, "p0001", "ben@example.com")).toBe(false); // that's your own address on Ben's row
    const dupe = { ...ready, people: ready.people.map((p) => (p.id === "p0003" ? { ...p, email: "ben@example.com" } : p)) };
    expect(readyToImport(dupe, "p0001", null)).toBe(false);
    const broken = { ...ready, expenses: [expense({ id: "e0001", split: { type: "exact", shares: [{ id: "p0001", minor: 1 }] } })] };
    expect(readyToImport(broken, "p0001", null)).toBe(false);
  });

  it("builds the import from the draft's own emails, and names an unnamed group", () => {
    const d = draft({
      name: "",
      people: [
        { id: "p0001", name: "Asha" },
        { id: "p0002", name: "Ben", email: " Ben@Example.com " },
        { id: "p0003", name: "Chloe", email: "chloe@example.com" },
      ],
    });
    const input = buildImportInput({ draft: d, name: d.name, meId: "p0001", emails: { p0003: "c2@example.com" } });
    expect(input.name).toBe(UNNAMED_GROUP);
    expect(input.people.map((p) => p.email)).toEqual(["ben@example.com", "c2@example.com"]);
  });
});

describe("draftHash — the intent's draft and the import's idempotency key", () => {
  it("is the same for the copy in memory and the one read back from storage", () => {
    const d = draft({ people: [{ id: "p0001", name: "Asha", email: "" }, { id: "p0002", name: "Ben" }] });
    const stored = sanitizeDraft(JSON.parse(JSON.stringify(d)))!;
    expect(draftHash(stored)).toBe(draftHash(d));
    expect(draftHash(d)).toMatch(/^d-[a-z0-9]{6,20}$/);
  });

  it("changes when anything in the group changes", () => {
    const d = draft({ expenses: [expense({ id: "e0001" })] });
    const hashes = new Set([
      draftHash(d),
      draftHash({ ...d, name: "Goa trip 2" }),
      draftHash({ ...d, people: d.people.map((p, i) => (i === 1 ? { ...p, email: "ben@example.com" } : p)) }),
      draftHash({ ...d, expenses: [expense({ id: "e0001", amountMinor: 300_001 })] }),
    ]);
    expect(hashes.size).toBe(4);
  });

  it("is what buildImportInput sends as the key", () => {
    const d = draft();
    expect(buildImportInput({ draft: d, name: "x", meId: "p0001" }).key).toBe(draftHash(d));
  });
});

describe("importStart — no invites without a fresh intent", () => {
  const ready = draft({
    people: [
      { id: "p0001", name: "Asha" },
      { id: "p0002", name: "Ben", email: "ben@example.com" },
    ],
    expenses: [expense({ id: "e0001", split: { type: "equal", ids: ["p0001", "p0002"] } })],
  });

  it("sends only when an intent was claimed and nothing is missing", () => {
    expect(importStart(ready, "asha@example.com", true)).toBe("send");
  });

  it("asks for a confirm, never sends, when there's no intent — however ready the draft is", () => {
    expect(importStart(ready, "asha@example.com", false)).toBe("confirm");
  });

  it("asks only 'which one is you?' when that's all that's unclear — with an intent", () => {
    const unclear = { ...ready, people: ready.people.map((p, i) => (i === 0 ? { ...p, email: "someone@example.com" } : p)) };
    expect(importStart(unclear, "asha@example.com", true)).toBe("ask-me");
    expect(importStart(unclear, "asha@example.com", false)).toBe("form");
  });

  it("falls back to the form when an email is missing, intent or not", () => {
    const missing = { ...ready, people: ready.people.map((p) => ({ ...p, email: undefined })) };
    expect(importStart(missing, null, true)).toBe("form");
    expect(importStart(missing, null, false)).toBe("form");
  });
});

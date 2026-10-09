import { describe, expect, it } from "vitest";
import { aiActionsSpent } from "@/lib/ai-limits";

/**
 * The composers (SpendChat AI, the AI actions line) lock only when the
 * workspace is truly out: the month's allowance *and* its top-ups (C4).
 */
describe("aiActionsSpent", () => {
  it("C4: a spent monthly allowance with top-ups left is not spent — SpendChat AI keeps working", () => {
    expect(aiActionsSpent({ remaining: 0, limit: 300, topUpRemaining: 450 })).toBe(false);
  });

  it("is spent once both are gone", () => {
    expect(aiActionsSpent({ remaining: 0, limit: 300, topUpRemaining: 0 })).toBe(true);
    expect(aiActionsSpent({ remaining: 0, limit: 50 })).toBe(true);
  });

  it("isn't spent with monthly actions left, or with nothing known", () => {
    expect(aiActionsSpent({ remaining: 3, limit: 50 })).toBe(false);
    expect(aiActionsSpent(null)).toBe(false);
  });
});

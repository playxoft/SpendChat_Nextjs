import { describe, it, expect } from "vitest";
import { CATEGORY_MARKER_RE, TAG_MARKER_RE } from "@/lib/composer-markers";

/** What the picker would show for this text, or null if it wouldn't open. */
const query = (re: RegExp, text: string): string | null => text.match(re)?.[1] ?? null;

describe("the / category marker", () => {
  it("opens on a slash at the start or after a space", () => {
    expect(query(CATEGORY_MARKER_RE, "/foo")).toBe("foo");
    expect(query(CATEGORY_MARKER_RE, "lunch /foo")).toBe("foo");
    // A bare slash is "show me the list".
    expect(query(CATEGORY_MARKER_RE, "lunch /")).toBe("");
  });

  it("does not open inside a date or a fraction", () => {
    // The same rule the AI prompt states: a slash between digits is a date,
    // never a category.
    expect(query(CATEGORY_MARKER_RE, "paid 12/05")).toBeNull();
    expect(query(CATEGORY_MARKER_RE, "1/2 share")).toBeNull();
  });

  it("closes once the token ends", () => {
    // The token is anchored to the end — a space after it means the pick is
    // over, which is what lets the two markers never be open at once.
    expect(query(CATEGORY_MARKER_RE, "lunch /Food ")).toBeNull();
  });
});

describe("the # tag marker", () => {
  it("opens on a hash at the start or after a space", () => {
    expect(query(TAG_MARKER_RE, "#travel")).toBe("travel");
    expect(query(TAG_MARKER_RE, "lunch #tra")).toBe("tra");
    expect(query(TAG_MARKER_RE, "lunch #")).toBe("");
  });

  /**
   * The bug this guard exists for. `flight #204` used to open the picker on
   * "204"; an open picker answers for Enter, so the key offered to create a tag
   * called "204" instead of sending the transaction (or, in the AI note, instead
   * of starting a new line). The prompt and the published API contract both say
   * a hash followed by a *letter* is a tag and `#1` is not — this is the UI
   * agreeing with them.
   */
  it("does not open on a hash followed by a digit", () => {
    expect(query(TAG_MARKER_RE, "flight #204")).toBeNull();
    expect(query(TAG_MARKER_RE, "#1 priority")).toBeNull();
    expect(query(TAG_MARKER_RE, "seat #7")).toBeNull();
  });

  it("still opens on a name that merely contains digits", () => {
    expect(query(TAG_MARKER_RE, "#q4")).toBe("q4");
  });

  it("closes once the token ends", () => {
    expect(query(TAG_MARKER_RE, "lunch #travel ")).toBeNull();
  });
});

describe("the two markers never match the same text", () => {
  // Both pickers read the same field, and each is gated only on its own match —
  // so a string matching both would open two popovers over each other.
  const samples = ["", "lunch", "/", "#", "lunch /Foo", "lunch #bar", "12/05", "flight #204"];
  it.each(samples)("at most one opens for %j", (text) => {
    const open = [CATEGORY_MARKER_RE, TAG_MARKER_RE].filter((re) => re.test(text));
    expect(open.length).toBeLessThanOrEqual(1);
  });
});

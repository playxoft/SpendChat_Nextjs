import { describe, expect, it } from "vitest";
import { MORE_ID, SIDEBAR_NAV_IDS, defaultSidebarNav, normalizeSidebarNav } from "@/lib/sidebar-nav";

/** Every section once, and More once in the list — what any read must hand the sidebar. */
function expectWellFormed(layout: ReturnType<typeof normalizeSidebarNav>) {
  expect(layout.main.filter((id) => id === MORE_ID)).toHaveLength(1);
  expect([...layout.main.filter((id) => id !== MORE_ID), ...layout.more].sort()).toEqual([...SIDEBAR_NAV_IDS].sort());
}

describe("normalizeSidebarNav", () => {
  it("starts with Invoices and Split under More", () => {
    const d = defaultSidebarNav();
    expect(d.more).toEqual(["invoices", "split"]);
    expect(d.main.at(-1)).toBe(MORE_ID);
    expectWellFormed(d);
  });

  it("keeps an arrangement as saved, More anywhere in the list", () => {
    const saved = {
      main: ["split", MORE_ID, "files", "tracker", "ask", "transactions", "analytics", "budgets", "invoices"],
      more: [],
    };
    expect(normalizeSidebarNav(saved)).toEqual(saved);
  });

  it("drops unknown and repeated entries, keeping the first place", () => {
    const layout = normalizeSidebarNav({
      main: ["files", "files", "nope", 7, MORE_ID, MORE_ID, "tracker"],
      more: ["files", "split", "more"],
    });
    // The kept entries keep their order; sections it lacked slot in above More.
    expect(layout.main.filter((id) => ["files", MORE_ID, "tracker"].includes(id))).toEqual(["files", MORE_ID, "tracker"]);
    expect(layout.more[0]).toBe("split");
    expectWellFormed(layout);
  });

  it("puts a section the layout predates where the default does", () => {
    // Saved before Invoices existed: it joins More, the rest keep their order.
    const layout = normalizeSidebarNav({
      main: ["files", "tracker", "ask", "transactions", "analytics", "budgets", MORE_ID],
      more: ["split"],
    });
    expect(layout.main).toEqual(["files", "tracker", "ask", "transactions", "analytics", "budgets", MORE_ID]);
    expect(layout.more).toEqual(["split", "invoices"]);
  });

  it("adds a missing list section just above More, and More itself if it's gone", () => {
    const layout = normalizeSidebarNav({ main: ["tracker"], more: ["invoices", "split"] });
    expect(layout.main.at(-1)).toBe(MORE_ID);
    expect(layout.main[0]).toBe("tracker");
    expectWellFormed(layout);
  });

  it("reads anything that isn't a layout as the default", () => {
    for (const junk of [undefined, null, "x", 3, [], { main: "x", more: [] }, { main: [] }]) {
      expect(normalizeSidebarNav(junk)).toEqual(defaultSidebarNav());
    }
  });
});

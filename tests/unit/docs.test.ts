import { describe, it, expect } from "vitest";
import { docsSections } from "@/lib/docs";

/**
 * The docs content is data with two readers — the `/docs` page and
 * `/llms.txt`, which links each section by its `id`. Both depend on the ids
 * being stable anchors and on every section having something to say.
 */
describe("docsSections", () => {
  it("has unique, anchor-safe ids and a title for every section", () => {
    const ids = docsSections.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of docsSections) {
      expect(s.id).toMatch(/^[a-z0-9-]+$/);
      expect(s.title).toBeTruthy();
      expect(s.blocks.length).toBeGreaterThan(0);
    }
  });

  it("opens with getting started and keeps the self-hosting anchor llms.txt links to", () => {
    expect(docsSections[0]?.id).toBe("getting-started");
    expect(docsSections.some((s) => s.id === "self-hosting")).toBe(true);
  });

  it("never ships an empty paragraph or list item", () => {
    for (const s of docsSections) {
      for (const b of s.blocks) {
        if (b.kind === "p") expect(b.text.trim()).toBeTruthy();
        else for (const item of b.items) expect(item.trim()).toBeTruthy();
      }
    }
  });
});

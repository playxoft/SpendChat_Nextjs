import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Since 0.43.0 the web app neither shows nor edits vault tags or the preset
 * document category — descriptions replaced them. The data, the columns and the
 * `/api/v1/file-tags` endpoints stay for API clients; only the app's surfaces
 * let go. This keeps them from creeping back into those surfaces unnoticed.
 */

const ROOT = join(__dirname, "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

/** Every source file of the vault's web surfaces: the Files page, its
 * components, and the public share page. */
const SURFACES = [
  ...readdirSync(join(ROOT, "src/components/app/files"))
    .filter((f) => /\.tsx?$/.test(f))
    .map((f) => `src/components/app/files/${f}`),
  "src/app/app/files/page.tsx",
  "src/app/share/[token]/page.tsx",
  "src/app/share/[token]/share-views.tsx",
];

describe("the vault's web surfaces carry no tags or preset categories", () => {
  it("found the surfaces it checks", () => {
    expect(SURFACES.length).toBeGreaterThanOrEqual(8);
    expect(SURFACES).toContain("src/components/app/files/files-page.tsx");
  });

  it("deleted the tag picker module", () => {
    expect(existsSync(join(ROOT, "src/components/app/files/vault-tags.tsx"))).toBe(false);
  });

  it.each(SURFACES)("%s references no tag or category UI", (path) => {
    const source = read(path);
    for (const banned of [
      "vault-tags",
      "TagPicker",
      "TagChip",
      "TagDTO",
      "tagIds",
      "tagFilter",
      "tagById",
      "FILE_CATEGORIES",
      ".category",
      "Color & tags",
      "Color &amp; tags",
    ]) {
      expect(source, `${path} mentions ${banned}`).not.toContain(banned);
    }
  });

  it("keeps no web action for vault tags", () => {
    const actions = read("src/actions/files.ts");
    for (const name of ["createTag", "updateTag", "deleteTag"]) {
      expect(actions).not.toMatch(new RegExp(`export async function ${name}\\b`));
    }
  });

  it("still serves the tag endpoints to API clients", () => {
    expect(existsSync(join(ROOT, "src/app/api/v1/file-tags/route.ts"))).toBe(true);
    expect(existsSync(join(ROOT, "src/app/api/v1/file-tags/[id]/route.ts"))).toBe(true);
  });
});

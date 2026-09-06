import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * The blog's covers and figures are static PNGs rendered ahead of time from
 * `scripts/blog-image.html` and `scripts/blog-figure.html` (both deliberately
 * so — generating them at runtime with `next/og` drags @vercel/og + resvg.wasm
 * into the Worker). The cost of that choice is a second, hand-maintained copy
 * of each post's frontmatter inside the generator, and a picture that keeps
 * saying whatever it said when it was last rendered.
 *
 * It has already drifted once: the open-source post's cover printed 2 June
 * against a post dated 2 September, because its row here was never updated.
 * Nothing caught it, because a PNG has no opinion about the page it sits on.
 *
 * So the duplication is treated as an interface with a test behind it, the way
 * `version.test.ts` guards the changelog and `env-example.test.ts` guards
 * `.env.example`. When this fails it is telling you which of the two files you
 * forgot — and, for the image checks, that a PNG needs re-rendering (the Chrome
 * command is in each script's header comment).
 */

const ROOT = join(import.meta.dirname, "../..");
const POSTS_DIR = join(ROOT, "src/content/blog");
const PUBLIC_DIR = join(ROOT, "public");

/**
 * The cover card sets the excerpt in a fixed box, so it runs shorter than the
 * post's own `excerpt` (which is the meta description, 125-160 chars). They are
 * *not* the same string and shouldn't be — this is the ceiling that keeps a
 * card line from overflowing its box.
 */
const COVER_EXCERPT_MAX = 120;

type Meta = {
  title: string;
  date: string;
  tag: string;
  readingMinutes: number;
  image?: string;
};

/** The `export const meta = {…}` block, read as text — `.mdx` can't be imported
 *  under the unit project (no MDX plugin), and text is all this needs. */
function readMeta(file: string): Meta {
  const src = readFileSync(join(POSTS_DIR, file), "utf8");
  const start = src.indexOf("export const meta = {");
  expect(start, `${file}: no 'export const meta'`).toBeGreaterThan(-1);
  const block = src.slice(start, src.indexOf("\n};", start));
  const str = (field: string) => {
    const m = new RegExp(`\\n  ${field}:\\s*\\n?\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(block);
    expect(m, `${file}: no ${field} in meta`).not.toBeNull();
    return m![1];
  };
  const num = (field: string) => {
    const m = new RegExp(`\\n  ${field}: (\\d+)`).exec(block);
    expect(m, `${file}: no ${field} in meta`).not.toBeNull();
    return Number(m![1]);
  };
  const image = /\n  image: "([^"]+)"/.exec(block)?.[1];
  return { title: str("title"), date: str("date"), tag: str("tag"), readingMinutes: num("readingMinutes"), image };
}

/** One `"<id>": { … }` table, keyed by id — the shape both generators use. */
function readTable(script: string, marker: string): Map<string, string> {
  const src = readFileSync(join(ROOT, "scripts", script), "utf8");
  const body = src.slice(src.indexOf(marker));
  const out = new Map<string, string>();
  for (const m of body.matchAll(/^        "([a-z0-9-]+(?:--[a-z0-9-]+)?)": \{([\s\S]*?)\n        \},?$/gm)) {
    out.set(m[1], m[2]);
  }
  expect(out.size, `${script}: parsed no entries`).toBeGreaterThan(0);
  return out;
}

const files = readdirSync(POSTS_DIR).filter((f) => f.endsWith(".mdx"));
const metas = new Map(files.map((f) => [f.replace(/\.mdx$/, ""), readMeta(f)]));

describe("blog covers (scripts/blog-image.html)", () => {
  const covers = readTable("blog-image.html", "const POSTS");

  it("has a row for every post, and no rows for posts that don't exist", () => {
    expect([...covers.keys()].sort()).toEqual([...metas.keys()].sort());
  });

  it.each([...metas.keys()])("%s: title, date, tag and reading time match the post", (slug) => {
    const block = covers.get(slug)!;
    const meta = metas.get(slug)!;
    const field = (name: string) =>
      new RegExp(`\\n          ${name}:\\s*\\n?\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(block)?.[1];
    expect(field("title")).toBe(meta.title);
    expect(field("date")).toBe(meta.date);
    expect(field("tag")).toBe(meta.tag);
    expect(Number(/\n          readingMinutes: (\d+)/.exec(block)?.[1])).toBe(meta.readingMinutes);
  });

  it.each([...covers.keys()])("%s: the card's excerpt fits its box", (slug) => {
    const excerpt = /\n          excerpt:\s*\n?\s*"((?:[^"\\]|\\.)*)"/.exec(covers.get(slug)!)?.[1];
    expect(excerpt, `${slug}: no excerpt on the cover`).toBeTruthy();
    expect(excerpt!.length).toBeLessThanOrEqual(COVER_EXCERPT_MAX);
  });

  it.each([...metas.entries()].filter(([, m]) => m.image))("%s: its cover has been rendered", (slug, meta) => {
    expect(existsSync(join(PUBLIC_DIR, meta.image!)), `${slug}: ${meta.image} is missing`).toBe(true);
  });
});

describe("blog figures (scripts/blog-figure.html)", () => {
  const figures = readTable("blog-figure.html", "const FIGURES");
  const used = new Set<string>();
  for (const file of files) {
    const src = readFileSync(join(POSTS_DIR, file), "utf8");
    for (const m of src.matchAll(/src="\/blog\/([a-z0-9-]+--[a-z0-9-]+)\.png"/g)) used.add(m[1]);
  }

  it("renders exactly the figures the posts embed", () => {
    expect([...figures.keys()].sort()).toEqual([...used].sort());
  });

  it.each([...used])("%s: has been rendered", (id) => {
    expect(existsSync(join(PUBLIC_DIR, "blog", `${id}.png`)), `public/blog/${id}.png is missing`).toBe(true);
  });

  it.each([...used])("%s: belongs to a post that exists", (id) => {
    expect(metas.has(id.split("--")[0])).toBe(true);
  });
});

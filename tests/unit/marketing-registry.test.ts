import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { publishedFeatures } from "@/lib/features";
import { FEATURE_SCENARIOS, SCENARIOS } from "@/lib/scenarios";

/**
 * The marketing pages hang three slug-keyed maps off the feature registry: the
 * hub's panel per feature, its extra sentence, and the scenarios at the foot of
 * each feature page. All three are `Record<string, …>`, because `Feature.slug`
 * is a `string` and there is no union to constrain them against.
 *
 * That makes a slug rename silent in the worst way: typecheck passes, lint
 * passes, the page still builds, and the panel quietly falls back to a generic
 * icon while the whole "Where this earns its keep" section disappears. Nothing
 * fails — the page just gets worse. These tests are the missing constraint.
 */

const HUB = path.join(process.cwd(), "src/app/(marketing)/features/page.tsx");

/** The keys of a `const NAME: Record<string, …> = { … }` literal in the hub. */
function mapKeys(source: string, name: string): string[] {
  const start = source.indexOf(`const ${name}`);
  expect(start, `${name} not found in the hub page`).toBeGreaterThan(-1);
  const open = source.indexOf("= {", start) + 2;
  let depth = 0;
  let end = open;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = source.slice(open, end);
  // Keys at depth 1 only: `"slug":` or `slug:`, never a nested object's.
  const keys: string[] = [];
  let level = 0;
  for (const line of body.split("\n")) {
    const m = level === 1 ? /^\s{2}"?([a-z0-9-]+)"?:/.exec(line) : null;
    if (m) keys.push(m[1]!);
    for (const ch of line) {
      if (ch === "{") level++;
      if (ch === "}") level--;
    }
  }
  return keys;
}

describe("feature-keyed marketing maps", () => {
  const slugs = publishedFeatures().map((f) => f.slug);
  const source = fs.readFileSync(HUB, "utf8");

  it("has a bento panel for every published feature", () => {
    const panels = mapKeys(source, "FEATURE_PANELS");
    for (const slug of slugs) {
      expect(panels, `no FEATURE_PANELS entry for "${slug}"`).toContain(slug);
    }
  });

  it("has at least one scenario for every published feature", () => {
    for (const slug of slugs) {
      expect(
        FEATURE_SCENARIOS[slug]?.length ?? 0,
        `no FEATURE_SCENARIOS entry for "${slug}"`,
      ).toBeGreaterThan(0);
    }
  });

  it("keys nothing on a slug the registry doesn't have", () => {
    // The other direction: a stale key is a panel or a spotlight written for a
    // page that no longer exists, and it renders nowhere.
    const known = new Set(publishedFeatures().map((f) => f.slug));
    for (const key of Object.keys(FEATURE_SCENARIOS)) {
      expect(known.has(key), `FEATURE_SCENARIOS has stale slug "${key}"`).toBe(true);
    }
    for (const name of ["FEATURE_PANELS", "FEATURE_EXTRAS"]) {
      for (const key of mapKeys(source, name)) {
        expect(known.has(key), `${name} has stale slug "${key}"`).toBe(true);
      }
    }
  });
});

describe("scenario copy", () => {
  it("gives every scenario a unique id", () => {
    // Ids are React keys and the seed for each card's accent, so a duplicate
    // is both a warning and two cards that look related when they aren't.
    const all = [...SCENARIOS, ...Object.values(FEATURE_SCENARIOS).flat()];
    const ids = all.map((s) => s.id);
    expect(new Set(ids).size, "duplicate scenario id").toBe(ids.length);
  });

  it("keeps the type free of anything that could attribute a scenario", () => {
    // The wall's defence is structural, not editorial: a `Scenario` has a
    // situation, a place and a body, and no field to hang a person on. A
    // testimonial needs a name to be an endorsement, so the way to keep these
    // from drifting into one is to leave nowhere to put it.
    //
    // (A copy-sniffing test was tried and removed: several bodies legitimately
    // open with a quoted *example of what you'd type*, which is the opposite
    // of a quoted customer.)
    const all = [...SCENARIOS, ...Object.values(FEATURE_SCENARIOS).flat()];
    for (const s of all) {
      expect(Object.keys(s).sort()).toEqual(["body", "icon", "id", "label", "place"]);
    }
  });
});

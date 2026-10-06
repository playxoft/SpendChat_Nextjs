import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Tripwire for the trash rule: **every read of a trashable table excludes the
 * trash, or says why not.**
 *
 * `transactions`, `files`, `folders` and `profiles` carry `deleted_at`. A read
 * of one has to either exclude trashed rows — through `notTrashed()` /
 * `trashedOnly()` (`lib/trash-scope.ts`), `buildConditions()` (which applies it
 * for every transaction list/total), or the access layer
 * (`accessibleProfileIds()` hides trashed profiles) — or carry a
 * `// trash: <reason>` comment saying why it deliberately reads everything (the
 * storage sum, destroy paths, sweeps that must reach trashed rows too).
 *
 * This scans `src/` for the read shapes — `.from(t)`, `…Join(t, …)`,
 * `db.query.t.…` and `${t}` inside a `sql` template — and fails with the exact
 * `file:line` of any that has neither within its statement's window. It's a
 * tripwire, not a proof: the behavioural proof is
 * `tests/integration/trash-reads.test.ts`, which runs every read against
 * seeded trash. This keeps a *new* read from slipping in unnoticed.
 */

const ROOT = join(__dirname, "..", "..");
const SRC = join(ROOT, "src");
const TABLES = ["transactions", "files", "folders", "profiles"] as const;

/** A read of one of the tables: from / join / relational query / raw template. */
const READ = new RegExp(
  [
    String.raw`\.from\((${TABLES.join("|")})\)`,
    String.raw`Join\((${TABLES.join("|")})\s*,`,
    String.raw`\.query\.(${TABLES.join("|")})\.`,
    String.raw`\$\{(${TABLES.join("|")})\}`,
  ].join("|"),
);

/** What counts as handling the trash within the statement. */
const MARKERS = [
  "notTrashed(",
  "trashedOnly(",
  "buildConditions(",
  "feedConditions(",
  "trashConditions(",
  "accessibleProfileIds(",
  "accessibleProfileIdList(",
  "deleted_at",
  ".deletedAt",
  "trash:",
];

/** Lines before / after a match that belong to "its statement". */
const BEFORE = 6;
const AFTER = 14;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      // The schema defines the tables; migrations are SQL history.
      if (path === join(SRC, "db")) continue;
      out.push(...walk(path));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(path);
    }
  }
  return out;
}

function unhandledReads(): string[] {
  const offenders: string[] = [];
  for (const file of walk(SRC)) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (!READ.test(line)) return;
      // Doc comments that merely mention a table aren't reads.
      if (/^\s*(\*|\/\/)/.test(line)) return;
      const window = lines.slice(Math.max(0, i - BEFORE), i + AFTER + 1).join("\n");
      if (MARKERS.some((m) => window.includes(m))) return;
      offenders.push(`${relative(ROOT, file)}:${i + 1}: ${line.trim()}`);
    });
  }
  return offenders;
}

describe("trash coverage (static tripwire)", () => {
  it("every read of a trashable table excludes the trash or says why not", () => {
    const offenders = unhandledReads();
    expect(
      offenders,
      `Reads of a trashable table with no trash handling nearby. Exclude trashed rows ` +
        `(notTrashed()/buildConditions()/accessibleProfileIds()) or add a ` +
        `"// trash: <reason>" comment:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("the scan itself finds the reads it is meant to police", () => {
    // Guards the guard: if a refactor broke the regex, the test above would
    // pass vacuously. queries.ts alone reads `transactions` many times.
    const queries = readFileSync(join(SRC, "lib", "queries.ts"), "utf8").split("\n");
    expect(queries.filter((l) => READ.test(l)).length).toBeGreaterThan(10);
  });
});

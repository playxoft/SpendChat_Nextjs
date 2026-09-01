import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * `.env.example` is the only setup instruction a contributor gets, and it drifts
 * silently: adding `process.env.SOMETHING_NEW` to a route works perfectly on a
 * machine where Doppler already has the value, and fails for everyone else as a
 * feature that is mysteriously switched off. That is exactly how the R2 and
 * ZeptoMail settings went undocumented for months while the README claimed
 * otherwise — a fresh clone got a file vault that answered 503 with no
 * explanation anywhere.
 *
 * So the file is treated as an interface with a test behind it, the same way
 * `version.test.ts` guards the changelog. When this fails it is telling you to
 * document the variable you just added, not to relax the test.
 */

const ROOT = join(import.meta.dirname, "../..");

/** Read by the AI registry helper, which builds the names at runtime from a
 *  feature prefix, so no literal `process.env.X` exists for a grep to find. */
const RESOLVED_DYNAMICALLY = new Set([
  "AI_PARSE_MODEL",
  "AI_PARSE_MODEL_CURRENT",
  "AI_TRANSCRIBE_MODEL",
  "AI_TRANSCRIBE_MODEL_CURRENT",
]);

/** Supplied by the platform, never by a `.env` file. */
const PLATFORM_PROVIDED = new Set(["NODE_ENV", "VITEST"]);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const declared = new Set(
  readFileSync(join(ROOT, ".env.example"), "utf8")
    .split("\n")
    .map((line) => /^([A-Z0-9_]+)=/.exec(line)?.[1])
    .filter((name): name is string => Boolean(name)),
);

const read = new Set<string>();
for (const file of sourceFiles(join(ROOT, "src"))) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/process\.env\.([A-Z0-9_]+)/g)) read.add(m[1]!);
}

describe(".env.example", () => {
  it("documents every environment variable src/ reads", () => {
    const undocumented = [...read]
      .filter((name) => !PLATFORM_PROVIDED.has(name) && !declared.has(name))
      .sort();
    expect(
      undocumented,
      `Read by src/ but missing from .env.example: ${undocumented.join(", ")}. ` +
        "Add each with a comment saying what breaks when it is unset.",
    ).toEqual([]);
  });

  it("documents nothing the app no longer reads", () => {
    const orphaned = [...declared]
      .filter((name) => !read.has(name) && !RESOLVED_DYNAMICALLY.has(name))
      .sort();
    expect(
      orphaned,
      `In .env.example but read nowhere in src/: ${orphaned.join(", ")}. ` +
        "Remove it, or add it to RESOLVED_DYNAMICALLY if it is built at runtime.",
    ).toEqual([]);
  });

  it("carries no real-looking secret values", () => {
    const body = readFileSync(join(ROOT, ".env.example"), "utf8");
    // Placeholders are fine; a value that matches a live credential shape is not.
    expect(body).not.toMatch(/sk-ant-[A-Za-z0-9]/);
    expect(body).not.toMatch(/AIza[0-9A-Za-z_-]{30,}/);
    expect(body).not.toMatch(/Zoho-enczapikey\s+[A-Za-z0-9+/]{20,}/);
    expect(body).not.toMatch(/postgresql:\/\/(?!user:password@)[^\s"]*:[^\s"@]+@/);
  });
});

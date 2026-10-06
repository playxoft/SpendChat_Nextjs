import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

/**
 * Tripwire for the trash rule: **every read of a trashable table excludes the
 * trash, or says why not.**
 *
 * `transactions`, `files`, `folders` and `profiles` carry `deleted_at`. A read
 * of one has to exclude trashed rows *of that table* or carry a
 * `// trash: <reason>` comment saying why it deliberately reads everything (the
 * storage sum, destroy paths, sweeps that must reach trashed rows too).
 *
 * Parsed, not grepped, so the rules are exact:
 *  - **Reads**: `.from(t)`, `.xxxJoin(t, …)` (any spacing or line breaks),
 *    `db.query.t.…`, and `${t}` inside a `sql` template.
 *  - **Window**: the read's own statement (with its comments) — not "some
 *    lines around it", where a neighbouring query's filter would count.
 *  - **What counts**, per table `t`: `notTrashed(t)` / `trashedOnly(t)`; a
 *    `t.deletedAt` reference; the whole word `deleted_at` inside a `sql`
 *    template; for `transactions` the helpers that apply `notTrashed` for it
 *    (`buildConditions`, `feedConditions`, `trashConditions`); for `profiles`
 *    the access layer (`accessibleProfileIds`, `accessibleProfileIdList`),
 *    which hides trashed profiles — and *only* for profiles: it says nothing
 *    about trashed transactions or files. A `// trash:` line comment counts for
 *    any table; the same words in a string don't.
 *
 * It's a tripwire, not a proof — the behavioural proof is
 * `tests/integration/trash-reads.test.ts`, which runs every read against
 * seeded trash. This keeps a *new* read from slipping in unnoticed.
 */

const ROOT = join(__dirname, "..", "..");
const SRC = join(ROOT, "src");
const TABLES = new Set(["transactions", "files", "folders", "profiles"]);

const ROW_HELPERS: Record<string, string[]> = {
  transactions: ["buildConditions", "feedConditions", "trashConditions"],
  files: [],
  folders: [],
  profiles: ["accessibleProfileIds", "accessibleProfileIdList"],
};

type Offender = { line: number; text: string; table: string };

function isSqlTemplate(node: ts.Node): node is ts.TaggedTemplateExpression {
  return ts.isTaggedTemplateExpression(node) && ts.isIdentifier(node.tag) && node.tag.text === "sql";
}

/** The table a node reads, if it is one of the read shapes. */
function tableRead(node: ts.Node): string | null {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const method = node.expression.name.text;
    const arg = node.arguments[0];
    if ((method === "from" || /Join$/.test(method)) && arg && ts.isIdentifier(arg) && TABLES.has(arg.text)) {
      return arg.text;
    }
  }
  if (
    ts.isPropertyAccessExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === "query" &&
    TABLES.has(node.name.text)
  ) {
    return node.name.text;
  }
  if (
    ts.isTemplateSpan(node) &&
    ts.isIdentifier(node.expression) &&
    TABLES.has(node.expression.text) &&
    isSqlTemplate(node.parent.parent)
  ) {
    return node.expression.text;
  }
  return null;
}

function isStatementLike(n: ts.Node): boolean {
  return (
    ts.isVariableStatement(n) ||
    ts.isExpressionStatement(n) ||
    ts.isReturnStatement(n) ||
    ts.isIfStatement(n) ||
    ts.isThrowStatement(n)
  );
}

/** The nearest statement around a read. */
function enclosingStatement(node: ts.Node): ts.Node {
  let n: ts.Node = node;
  while (n.parent && !ts.isSourceFile(n.parent) && !isStatementLike(n)) n = n.parent;
  return n;
}

/**
 * A `// trash:` line comment within the statement, its leading comments
 * included. Read from the comment ranges the parser attaches around each node
 * (a raw scanner loses its place inside `${…}` template spans), so a string
 * that merely contains the words never counts.
 */
function hasTrashComment(sf: ts.SourceFile, stmt: ts.Node): boolean {
  const text = sf.getFullText();
  const isTrash = (r: ts.CommentRange) =>
    r.kind === ts.SyntaxKind.SingleLineCommentTrivia && /^\/\/\s*trash:/.test(text.slice(r.pos, r.end));
  let found = false;
  const visit = (n: ts.Node) => {
    if (found) return;
    for (const at of [n.pos, n.end]) {
      if ((ts.getLeadingCommentRanges(text, at) ?? []).some(isTrash)) found = true;
    }
    ts.forEachChild(n, visit);
  };
  visit(stmt);
  return found;
}

/** Whether the statement handles the trash for `table`. */
function handles(sf: ts.SourceFile, stmt: ts.Node, table: string): boolean {
  if (hasTrashComment(sf, stmt)) return true;
  let found = false;
  const visit = (n: ts.Node) => {
    if (found) return;
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
      const fn = n.expression.text;
      const arg = n.arguments[0];
      if ((fn === "notTrashed" || fn === "trashedOnly") && arg && ts.isIdentifier(arg) && arg.text === table) {
        found = true;
      }
      if (ROW_HELPERS[table]!.includes(fn)) found = true;
    }
    if (
      ts.isPropertyAccessExpression(n) &&
      n.name.text === "deletedAt" &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === table
    ) {
      found = true;
    }
    if (isSqlTemplate(n)) {
      const parts = ts.isNoSubstitutionTemplateLiteral(n.template)
        ? [n.template.text]
        : [n.template.head.text, ...n.template.templateSpans.map((s) => s.literal.text)];
      if (parts.some((p) => /(?<![A-Za-z0-9_])deleted_at(?![A-Za-z0-9_])/.test(p))) found = true;
    }
    ts.forEachChild(n, visit);
  };
  visit(stmt);
  return found;
}

/** Unhandled reads in one source file. */
function unhandledReadsIn(fileName: string, text: string): Offender[] {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  const out: Offender[] = [];
  const visit = (node: ts.Node) => {
    const table = tableRead(node);
    if (table && !handles(sf, enclosingStatement(node), table)) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
      out.push({ line: line + 1, table, text: node.getText().split("\n")[0]!.trim() });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

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

describe("the checker itself", () => {
  const offending = (src: string) => unhandledReadsIn("sample.ts", src).map((o) => o.table);

  it("accepts a read that excludes its own table's trash", () => {
    expect(offending(`const rows = await db.select().from(transactions).where(notTrashed(transactions));`)).toEqual([]);
    expect(offending(`const rows = await db.select().from(files).where(isNull(files.deletedAt));`)).toEqual([]);
  });

  it("access-layer helpers count for profiles only", () => {
    expect(
      offending(`const p = await db.select().from(profiles).where(inArray(profiles.id, accessibleProfileIds(u, w)));`),
    ).toEqual([]);
    expect(
      offending(
        `const t = await db.select().from(transactions).where(inArray(transactions.profileId, accessibleProfileIds(u, w)));`,
      ),
    ).toEqual(["transactions"]);
  });

  it("a filter on another table doesn't count", () => {
    expect(offending(`const t = await db.select().from(transactions).where(notTrashed(files));`)).toEqual([
      "transactions",
    ]);
  });

  it("finds a join whose table is on the next line", () => {
    const src = `const r = await db
      .select()
      .from(transactionAttachments)
      .innerJoin(
        transactions,
        eq(transactions.id, transactionAttachments.transactionId),
      );`;
    expect(offending(src)).toEqual(["transactions"]);
  });

  it("a marker in a neighbouring statement doesn't count", () => {
    const src = `
      const live = await db.select().from(files).where(notTrashed(files));
      const all = await db.select().from(files);`;
    expect(offending(src)).toEqual(["files"]);
  });

  it("deletedAt / deleted_at must be the real thing — not a longer name, not a string", () => {
    expect(offending(`const r = await db.select({ x: folders.deletedAtText }).from(folders);`)).toEqual(["folders"]);
    expect(offending(`const r = await db.select().from(folders).where(eq(note, "deleted_at"));`)).toEqual(["folders"]);
    expect(
      offending("const r = await db.execute(sql`select 1 from ${folders} f where f.deleted_at_old is null`);"),
    ).toEqual(["folders"]);
    expect(
      offending("const r = await db.execute(sql`select 1 from ${folders} f where f.deleted_at is null`);"),
    ).toEqual([]);
  });

  it("`// trash:` must be a real comment in the statement", () => {
    expect(
      offending(`
        // trash: the storage sum counts everything (C6)
        const r = await db.select().from(files);`),
    ).toEqual([]);
    expect(offending(`const r = await db.select({ n: "// trash: not a comment" }).from(files);`)).toEqual([
      "files",
    ]);
  });

  it("sees relational queries and raw templates", () => {
    expect(offending(`const t = await db.query.transactions.findFirst({ where: eq(transactions.id, id) });`)).toEqual([
      "transactions",
    ]);
    expect(offending("const r = await db.execute(sql`select * from ${profiles}`);")).toEqual(["profiles"]);
  });
});

describe("trash coverage (static tripwire)", () => {
  it("every read of a trashable table excludes the trash or says why not", () => {
    const offenders = walk(SRC).flatMap((file) =>
      unhandledReadsIn(file, readFileSync(file, "utf8")).map(
        (o) => `${relative(ROOT, file)}:${o.line} (${o.table}): ${o.text}`,
      ),
    );
    expect(
      offenders,
      `Reads of a trashable table with no trash handling in the same statement. Exclude ` +
        `trashed rows (notTrashed(table) / buildConditions / the access layer for profiles) ` +
        `or add a "// trash: <reason>" comment:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("the scan itself finds the reads it is meant to police", () => {
    // Guards the guard: a broken parser would let the test above pass vacuously.
    const sf = ts.createSourceFile(
      "queries.ts",
      readFileSync(join(SRC, "lib", "queries.ts"), "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    let reads = 0;
    const visit = (n: ts.Node) => {
      if (tableRead(n)) reads++;
      ts.forEachChild(n, visit);
    };
    visit(sf);
    expect(reads).toBeGreaterThan(15);
  });
});

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
 *    `db.query.t.…`, and `${t}` inside a `sql` template — where `t` is the
 *    table or an `alias(t, …)` of it.
 *  - **Where it may be excluded**: only in the read's *own* filters — the
 *    `where`/`having` and join `on` arguments of its own builder chain (a
 *    sibling query in the same statement doesn't count, nor does a select list
 *    or an `orderBy`), `findFirst`/`findMany`'s `where`, or a `where`/`on`
 *    clause of its own `sql` template.
 *  - **What counts there**, per table `t` (or its alias): `notTrashed(t)` /
 *    `trashedOnly(t)`; a `t.deletedAt` reference; the whole word `deleted_at`
 *    in a `sql` template; for `transactions` the helpers that apply
 *    `notTrashed` for it (`buildConditions`, `feedConditions`,
 *    `trashConditions`); for `profiles` the access layer
 *    (`accessibleProfileIds`, `accessibleProfileIdList`), which hides trashed
 *    profiles — and *only* for profiles: it says nothing about trashed
 *    transactions or files.
 *  - **`// trash:`** must be a real line comment, and it excuses exactly one
 *    read: the next one after it (within the builder chain it sits in, or its
 *    statement), or — sitting after the last read of its chain, or trailing a
 *    statement on the same line — the one before it.
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

const DELETED_AT = /(?<![A-Za-z0-9_])deleted_at(?![A-Za-z0-9_])/g;

type Offender = { line: number; text: string; table: string };

type Read = {
  table: string;
  /** The identifier the read uses: the table, or an alias of it. */
  ref: string;
  /** Where the read itself sits: the `from`/join name, `query.t`, or `${t}`. */
  at: number;
  /** The builder chain (or `sql` template) the read belongs to. */
  scope: ts.Node;
  /** The read's own filter expressions (chains), or null for a template. */
  filters: ts.Node[] | null;
  stmt: ts.Node;
};

function isSqlTemplate(node: ts.Node): node is ts.TaggedTemplateExpression {
  return ts.isTaggedTemplateExpression(node) && ts.isIdentifier(node.tag) && node.tag.text === "sql";
}

/** `const x = alias(t, "…")` for a trashable `t`: x → t. */
function aliasesIn(sf: ts.SourceFile): Map<string, string> {
  const out = new Map<string, string>();
  const visit = (n: ts.Node) => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.initializer &&
      ts.isCallExpression(n.initializer) &&
      ts.isIdentifier(n.initializer.expression) &&
      n.initializer.expression.text === "alias"
    ) {
      const arg = n.initializer.arguments[0];
      if (arg && ts.isIdentifier(arg) && TABLES.has(arg.text)) out.set(n.name.text, arg.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** The outermost expression of the builder chain `node` is a link of. */
function chainTop(node: ts.Node): ts.Node {
  let n = node;
  for (;;) {
    const p = n.parent;
    if (
      p &&
      ((ts.isPropertyAccessExpression(p) && p.expression === n) ||
        (ts.isCallExpression(p) && p.expression === n) ||
        ts.isNonNullExpression(p))
    ) {
      n = p;
      continue;
    }
    return n;
  }
}

/** The filter arguments of a chain: `where`/`having` arguments and join `on`s. */
function chainFilters(top: ts.Node): ts.Node[] {
  const out: ts.Node[] = [];
  let n: ts.Node = top;
  for (;;) {
    if (ts.isCallExpression(n)) {
      if (ts.isPropertyAccessExpression(n.expression)) {
        const method = n.expression.name.text;
        if (method === "where" || method === "having") out.push(...n.arguments);
        else if (/Join$/.test(method)) out.push(...n.arguments.slice(1));
      }
      n = n.expression;
    } else if (ts.isPropertyAccessExpression(n) || ts.isNonNullExpression(n)) {
      n = n.expression;
    } else {
      return out;
    }
  }
}

/** `db.query.t.findFirst({ where })`: the `where`. */
function queryFilters(top: ts.Node): ts.Node[] {
  if (!ts.isCallExpression(top)) return [];
  return top.arguments.flatMap((arg) =>
    ts.isObjectLiteralExpression(arg)
      ? arg.properties.flatMap((p) =>
          ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === "where"
            ? [p.initializer]
            : [],
        )
      : [],
  );
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

function readsIn(sf: ts.SourceFile): Read[] {
  const aliases = aliasesIn(sf);
  const resolve = (e: ts.Node | undefined) => {
    if (!e || !ts.isIdentifier(e)) return null;
    const table = TABLES.has(e.text) ? e.text : aliases.get(e.text);
    return table ? { table, ref: e.text } : null;
  };
  const out: Read[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      const r = method === "from" || /Join$/.test(method) ? resolve(node.arguments[0]) : null;
      if (r) {
        const top = chainTop(node);
        out.push({
          ...r,
          at: node.expression.name.getStart(),
          scope: top,
          filters: chainFilters(top),
          stmt: enclosingStatement(node),
        });
      }
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "query" &&
      TABLES.has(node.name.text)
    ) {
      const top = chainTop(node);
      out.push({
        table: node.name.text,
        ref: node.name.text,
        at: node.name.getStart(),
        scope: top,
        filters: queryFilters(top),
        stmt: enclosingStatement(node),
      });
    }
    if (ts.isTemplateSpan(node) && isSqlTemplate(node.parent.parent)) {
      const r = resolve(node.expression);
      // A table in a from/join/update position — elsewhere `${t}."col"` is a
      // column reference inside some other read's expression.
      if (r && ["from", "join", "update"].includes(spanClause(node) ?? "")) {
        out.push({
          ...r,
          at: node.expression.getStart(),
          scope: node.parent.parent,
          filters: null,
          stmt: enclosingStatement(node),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out.sort((a, b) => a.at - b.at);
}

/** Whether `nodes` exclude the trash of `read`'s table (see the header). */
function markersIn(nodes: ts.Node[], read: Read): boolean {
  let found = false;
  const visit = (n: ts.Node) => {
    if (found) return;
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
      const fn = n.expression.text;
      const arg = n.arguments[0];
      if ((fn === "notTrashed" || fn === "trashedOnly") && arg && ts.isIdentifier(arg) && arg.text === read.ref) {
        found = true;
      }
      if (ROW_HELPERS[read.table]!.includes(fn)) found = true;
    }
    if (
      ts.isPropertyAccessExpression(n) &&
      n.name.text === "deletedAt" &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === read.ref
    ) {
      found = true;
    }
    if (isSqlTemplate(n) && templateParts(n).some((p) => new RegExp(DELETED_AT.source).test(p))) found = true;
    ts.forEachChild(n, visit);
  };
  for (const n of nodes) visit(n);
  return found;
}

function templateParts(t: ts.TaggedTemplateExpression): string[] {
  return ts.isNoSubstitutionTemplateLiteral(t.template)
    ? [t.template.text]
    : [t.template.head.text, ...t.template.templateSpans.map((s) => s.literal.text)];
}

/** The SQL clause in force at `pos` of `text`, per parenthesis depth (an
 * expression's own parentheses inherit the clause around them). */
function clauseAt(text: string, pos: number): string | null {
  const stack: (string | null)[] = [null];
  const re =
    /\(|\)|\b(select|from|where|on|join|update|order\s+by|group\s+by|having|set|returning|values|limit|offset|union|intersect|except|with|for)\b/gi;
  for (const m of text.slice(0, pos).matchAll(re)) {
    if (m[0] === "(") stack.push(null);
    else if (m[0] === ")") {
      if (stack.length > 1) stack.pop();
    } else stack[stack.length - 1] = m[0].toLowerCase().replace(/\s+/g, " ");
  }
  for (let i = stack.length - 1; i >= 0; i--) if (stack[i]) return stack[i]!;
  return null;
}

/** A template's SQL with each `${…}` as `?`, and where each one sits in it. */
function templateText(t: ts.TaggedTemplateExpression): {
  text: string;
  spans: { pos: number; span: ts.TemplateSpan }[];
} {
  if (ts.isNoSubstitutionTemplateLiteral(t.template)) return { text: t.template.text, spans: [] };
  let text = t.template.head.text;
  const spans: { pos: number; span: ts.TemplateSpan }[] = [];
  for (const span of t.template.templateSpans) {
    spans.push({ pos: text.length, span });
    text += " ? " + span.literal.text;
  }
  return { text, spans };
}

function spanClause(span: ts.TemplateSpan): string | null {
  const { text, spans } = templateText(span.parent.parent as ts.TaggedTemplateExpression);
  return clauseAt(text, spans.find((s) => s.span === span)!.pos);
}

/** For a `${t}` read: a `where`/`on` clause of its template excludes the trash. */
function templateHandles(read: Read): boolean {
  const { text, spans: placed } = templateText(read.scope as ts.TaggedTemplateExpression);
  const spans = placed.map((s) => ({ pos: s.pos, expr: s.span.expression }));
  const filtering = (pos: number) => ["where", "on"].includes(clauseAt(text, pos) ?? "");
  for (const m of text.matchAll(DELETED_AT)) if (filtering(m.index!)) return true;
  return spans.some((s) => filtering(s.pos) && markersIn([s.expr], read));
}

/** The `// trash:` line comments of a file. */
function trashComments(sf: ts.SourceFile): ts.CommentRange[] {
  const text = sf.getFullText();
  const seen = new Map<number, ts.CommentRange>();
  const visit = (n: ts.Node) => {
    for (const at of [n.pos, n.end]) {
      for (const r of [
        ...(ts.getLeadingCommentRanges(text, at) ?? []),
        ...(ts.getTrailingCommentRanges(text, at) ?? []),
      ]) {
        if (r.kind === ts.SyntaxKind.SingleLineCommentTrivia && /^\/\/\s*trash:/.test(text.slice(r.pos, r.end))) {
          seen.set(r.pos, r);
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return [...seen.values()];
}

/** The one read each `// trash:` comment excuses (see the header). */
function excusedReads(sf: ts.SourceFile, reads: Read[]): Set<Read> {
  const stmts: ts.Node[] = [];
  const collect = (n: ts.Node) => {
    if (isStatementLike(n)) stmts.push(n);
    ts.forEachChild(n, collect);
  };
  collect(sf);
  const lineOf = (pos: number) => sf.getLineAndCharacterOfPosition(pos).line;
  const smallest = <T extends ts.Node>(nodes: T[]) =>
    nodes.sort((a, b) => a.end - a.pos - (b.end - b.pos))[0];

  const out = new Set<Read>();
  for (const c of trashComments(sf)) {
    // Trailing a statement on its own line: it's about that statement.
    const trailing = smallest(
      stmts.filter((s) => s.end <= c.pos && lineOf(s.end) === lineOf(c.pos) && !sf.text.slice(s.end, c.pos).trim()),
    );
    let pool: Read[];
    if (trailing) {
      pool = reads.filter((r) => r.stmt === trailing);
    } else {
      const chain = smallest(
        [...new Set(reads.map((r) => r.scope))].filter((k) => k.getStart() <= c.pos && c.end <= k.end),
      );
      if (chain) {
        pool = reads.filter((r) => r.at >= chain.getStart() && r.at < chain.end);
      } else {
        const stmt = smallest(stmts.filter((s) => s.pos <= c.pos && c.end <= s.end));
        pool = stmt ? reads.filter((r) => r.stmt === stmt) : [];
      }
    }
    const next = trailing ? undefined : pool.find((r) => r.at >= c.end);
    const target = next ?? pool.filter((r) => r.at < c.pos).at(-1);
    if (!target) continue;
    // A `sql` template is one statement: excusing it covers each table it names.
    for (const r of target.filters ? [target] : reads.filter((r) => r.scope === target.scope)) out.add(r);
  }
  return out;
}

/** Unhandled reads in one source file. */
function unhandledReadsIn(fileName: string, text: string): Offender[] {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  const reads = readsIn(sf);
  const excused = excusedReads(sf, reads);
  return reads
    .filter((r) => !excused.has(r) && !(r.filters ? markersIn(r.filters, r) : templateHandles(r)))
    .map((r) => {
      const { line } = sf.getLineAndCharacterOfPosition(r.at);
      return { line: line + 1, table: r.table, text: text.split("\n")[line]!.trim() };
    });
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

  it("deletedAt / deleted_at count only in the read's filters — not a select list or orderBy", () => {
    expect(offending(`const r = await db.select({ d: files.deletedAt }).from(files);`)).toEqual(["files"]);
    expect(offending(`const r = await db.select().from(files).orderBy(desc(files.deletedAt));`)).toEqual(["files"]);
    // deleteSpace's shape before it was annotated.
    expect(
      offending(
        "const r = await db.select({ live: sql`${profiles.deletedAt} is null` }).from(profiles).where(eq(profiles.spaceId, s));",
      ),
    ).toEqual(["profiles"]);
    // lockFolderSubtree's shape: deleted_at selected, never filtered.
    expect(
      offending(
        "const r = await tx.execute(sql`select f.id, f.deleted_at::text from ${folders} f where f.id in (select id from sub) for update of f`);",
      ),
    ).toEqual(["folders"]);
    expect(
      offending(
        "const r = await tx.execute(sql`select f.id from ${folders} f where f.id in (select id from sub) and f.deleted_at is null`);",
      ),
    ).toEqual([]);
    expect(
      offending(
        "const r = await tx.execute(sql`select c.id from ${folders} c join sub on c.parent_id = sub.id and c.deleted_at is null`);",
      ),
    ).toEqual([]);
    expect(
      offending(
        `const r = await db.select().from(files).innerJoin(folders, and(eq(folders.id, files.folderId), isNull(folders.deletedAt))).where(notTrashed(files));`,
      ),
    ).toEqual([]);
  });

  it("a sibling query in the same statement doesn't lend its filter", () => {
    expect(
      offending(`const [a, b] = await Promise.all([
        db.select().from(files).where(notTrashed(files)),
        db.select().from(files),
      ]);`),
    ).toEqual(["files"]);
    expect(
      offending(`const r = await db.select().from(files).where(notTrashed(files)).union(db.select().from(files));`),
    ).toEqual(["files"]);
  });

  it("a `// trash:` comment excuses only the read it's attached to", () => {
    expect(
      offending(`const [a, b] = await Promise.all([
        db.select().from(folders),
        // trash: all states on purpose.
        db.select().from(files),
      ]);`),
    ).toEqual(["folders"]);
    expect(
      offending(`const r = await db
        .select()
        .from(page)
        // trash: a display join.
        .leftJoin(profiles, eq(page.profileId, profiles.id))
        .innerJoin(transactions, eq(page.transactionId, transactions.id));`),
    ).toEqual(["transactions"]);
    // After the chain's last read: it's about that read.
    expect(
      offending(`const r = await db
        .select()
        .from(profiles)
        // trash: trashed ones too.
        .where(eq(profiles.workspaceId, w));`),
    ).toEqual([]);
    // A comment for a subquery doesn't cover the query around it.
    expect(
      offending(`const r = await db
        .select({
          // trash: all states.
          bytes: sql\`(\${db.select().from(files).where(eq(files.profileId, profiles.id))})\`,
        })
        .from(profiles);`),
    ).toEqual(["profiles"]);
    // Trailing a statement: that statement's read, not the next one's.
    expect(
      offending(`const a = await db.select().from(files); // trash: all states.
        const b = await db.select().from(folders);`),
    ).toEqual(["folders"]);
  });

  it("resolves alias(table, …) — and the alias's own filter is what counts", () => {
    const head = `const p = alias(profiles, "p");\n`;
    expect(
      offending(head + `const r = await db.select().from(files).leftJoin(p, eq(p.id, files.profileId)).where(notTrashed(files));`),
    ).toEqual(["profiles"]);
    expect(
      offending(
        head +
          `const r = await db.select().from(files).leftJoin(p, and(eq(p.id, files.profileId), isNull(p.deletedAt))).where(notTrashed(files));`,
      ),
    ).toEqual([]);
    expect(
      offending(
        head +
          `const r = await db.select().from(files).leftJoin(p, and(eq(p.id, files.profileId), notTrashed(profiles))).where(notTrashed(files));`,
      ),
    ).toEqual(["profiles"]);
  });

  it("a table interpolated as a column prefix is not a read", () => {
    expect(offending("const x = readOnlyWorkspaceSql(sql`${profiles}.\"workspace_id\"`);")).toEqual([]);
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
      `Reads of a trashable table with no trash handling in their own filters. Exclude ` +
        `trashed rows (notTrashed(table) / buildConditions / the access layer for profiles) ` +
        `or add a "// trash: <reason>" comment:\n${offenders.join("\n")}`,
    ).toEqual([]);
    // Parses every file under src/ with the TypeScript compiler: ~5 s on a CI
    // runner, past vitest's 5 s default.
  }, 60_000);

  it("the scan itself finds the reads it is meant to police", () => {
    // Guards the guard: a broken parser would let the test above pass vacuously.
    const sf = ts.createSourceFile(
      "queries.ts",
      readFileSync(join(SRC, "lib", "queries.ts"), "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    expect(readsIn(sf).length).toBeGreaterThan(15);
  });
});

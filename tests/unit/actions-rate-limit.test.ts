import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

/**
 * `runAction` rate-limits an action only when its meta names the person
 * (`meta.userId`) — without it there's nobody to count, and the limiter is
 * skipped without a word. So this reads every server action's source and
 * checks the call: each exported action goes through `runAction`, and every
 * `runAction` call passes a `userId`. It also pins which actions aren't
 * creates, so moving one between buckets is a deliberate change.
 */

const ACTIONS_DIR = path.resolve(__dirname, "../../src/actions");

/** Exported server actions that don't go through `runAction`, and why that's fine. */
const OUTSIDE_RUN_ACTION: Record<string, string> = {
  "profiles.ts#listProfiles": "unused by the UI, so Next strips its endpoint — it can't be called",
};

type RunActionCall = { label: string; hasUserId: boolean; rateLimit: string | null };
type ExportedAction = { id: string; calls: RunActionCall[] };

function propertyName(p: ts.ObjectLiteralElementLike): string | null {
  if ((ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && ts.isIdentifier(p.name)) {
    return p.name.text;
  }
  return null;
}

/** A `userId` that names someone: not `undefined`, `null`, `void …` or a literal. */
function namesSomeone(p: ts.ObjectLiteralElementLike): boolean {
  if (ts.isShorthandPropertyAssignment(p)) return p.name.text !== "undefined";
  if (!ts.isPropertyAssignment(p)) return false;
  const value = p.initializer;
  if (ts.isIdentifier(value) && value.text === "undefined") return false;
  if (value.kind === ts.SyntaxKind.NullKeyword || ts.isVoidExpression(value)) return false;
  return !ts.isLiteralExpression(value);
}

function runActionCalls(node: ts.Node): RunActionCall[] {
  const calls: RunActionCall[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "runAction") {
      const [label, , meta] = n.arguments;
      const props = meta && ts.isObjectLiteralExpression(meta) ? meta.properties : [];
      const rateLimit = props.find((p) => propertyName(p) === "rateLimit");
      calls.push({
        label: label && ts.isStringLiteral(label) ? label.text : "?",
        hasUserId: props.some((p) => propertyName(p) === "userId" && namesSomeone(p)),
        rateLimit:
          rateLimit && ts.isPropertyAssignment(rateLimit) && ts.isStringLiteral(rateLimit.initializer)
            ? rateLimit.initializer.text
            : null,
      });
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return calls;
}

function exportedActions(): ExportedAction[] {
  return readdirSync(ACTIONS_DIR)
    .filter((f) => f.endsWith(".ts"))
    .sort()
    .flatMap((file) => actionsIn(file, readFileSync(path.join(ACTIONS_DIR, file), "utf8")));
}

/** The exported actions in one file's source, and the `runAction` calls in each. */
function actionsIn(file: string, text: string): ExportedAction[] {
  const out: ExportedAction[] = [];
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  for (const stmt of source.statements) {
    const exported = ts.canHaveModifiers(stmt)
      ? ts.getModifiers(stmt)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      : false;
    if (!exported) continue;
    if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      out.push({ id: `${file}#${stmt.name.text}`, calls: runActionCalls(stmt) });
    } else if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        const fn = decl.initializer;
        if (
          ts.isIdentifier(decl.name) &&
          fn &&
          (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))
        ) {
          out.push({ id: `${file}#${decl.name.text}`, calls: runActionCalls(fn) });
        }
      }
    }
  }
  return out;
}

const actions = exportedActions();

describe("the checker itself", () => {
  const sample = `
    export async function good() { return runAction("good", fn, { userId: user.id }); }
    export async function noMeta() { return runAction("noMeta", fn); }
    export async function undefinedUser() { return runAction("undefinedUser", fn, { userId: undefined }); }
    export async function nullUser() { return runAction("nullUser", fn, { userId: null }); }
    export const arrow = async () => runAction("arrow", fn, { userId: user.id, rateLimit: "read" });
    export const expr = async function () { return runAction("expr", fn, { workspaceId: w.id }); };
    export const skipped = async function () { return list(); };
  `;
  const found = actionsIn("sample.ts", sample);

  it("finds function declarations, arrow functions and function expressions", () => {
    expect(found.map((a) => a.id)).toEqual([
      "sample.ts#good",
      "sample.ts#noMeta",
      "sample.ts#undefinedUser",
      "sample.ts#nullUser",
      "sample.ts#arrow",
      "sample.ts#expr",
      "sample.ts#skipped",
    ]);
    expect(found.find((a) => a.id.endsWith("#skipped"))!.calls).toEqual([]);
  });

  it("C8: only a real userId counts — not a missing, undefined or null one", () => {
    const named = Object.fromEntries(found.flatMap((a) => a.calls.map((c) => [c.label, c.hasUserId])));
    expect(named).toEqual({
      good: true,
      noMeta: false,
      undefinedUser: false,
      nullUser: false,
      arrow: true,
      expr: false,
    });
    expect(found.find((a) => a.id.endsWith("#arrow"))!.calls[0]!.rateLimit).toBe("read");
  });
});

describe("every server action is rate limited", () => {
  it("finds the actions (sanity)", () => {
    expect(actions.length).toBeGreaterThan(60);
  });

  it("C8: every exported server action goes through runAction", () => {
    const outside = actions.filter((a) => a.calls.length === 0).map((a) => a.id);
    expect(outside).toEqual(Object.keys(OUTSIDE_RUN_ACTION));
  });

  it("C8: every runAction call names the person (meta.userId), so it's counted", () => {
    const missing = actions.flatMap((a) =>
      a.calls.filter((c) => !c.hasUserId).map((c) => `${a.id} → runAction("${c.label}")`),
    );
    expect(missing).toEqual([]);
  });

  it("C8: the actions that aren't creates say so — and only those", () => {
    const byBucket = (bucket: string) =>
      actions
        .flatMap((a) => a.calls.filter((c) => c.rateLimit === bucket).map((c) => c.label))
        .sort();
    expect(byBucket("read")).toEqual(
      [
        // read-only
        "countTransactionsForTag",
        "getProfileDeletionImpact",
        "getSpaceAccess",
        "listAttachments",
        "listFileShares",
        "loadMoreTransactions",
        "loadOlderFeed",
        // the person's own UI preferences
        "dismissInviteNudge",
        "patchSettings",
        "recordHeardFrom",
        "setCollapsedSpaces",
        "switchWorkspace",
        "updateComposerDensity",
        "updateInputMode",
        "updateVoiceLanguages",
      ].sort(),
    );
    expect(byBucket("ai")).toEqual(["parseTransactionsWithAI", "transcribeVoiceNote"]);
    // Anything else spelled out is a typo the limiter would read as "create".
    const odd = actions.flatMap((a) =>
      a.calls.filter((c) => c.rateLimit !== null && !["read", "ai", "create"].includes(c.rateLimit)),
    );
    expect(odd).toEqual([]);
  });
});

#!/usr/bin/env node
// Regenerates the inputs the /design-sync converter needs from this repo.
// Referenced as `buildCmd` in config.json — run it before package-build.mjs.
//
// SpendChat is a Next.js app, not a published component package, so there is
// no `dist/` to bundle. This script stands in for that build:
//
//   1. `.design-sync/ds-entry.ts` — a curated barrel of the browser-safe
//      component surface, derived from `componentSrcMap` in config.json.
//   2. `.design-sync/.cache/tailwind.css` — the compiled stylesheet. The app's
//      `globals.css` is Tailwind v4 *source*; without this step every preview
//      card renders with no utilities and no `@theme` tokens.
//   3. `.design-sync/.cache/stubs/actions/*.ts` — no-op stand-ins for the
//      `"use server"` modules under `src/actions/`, wired in by the `paths`
//      map in `tsconfig.sync.json`. Shells like AppSidebar and
//      TransactionComposer import server actions transitively; bundling the
//      real modules would pull `pg`, `drizzle` and node builtins into a
//      browser bundle. This mirrors production: Next replaces a `"use server"`
//      import with an RPC reference, so the browser never holds those bodies
//      either. Design-system consumers wire their own handlers.
//      (The browser-side modules that are stubbed the same way — Firebase and
//      pdf.js — are hand-written and checked in under `.design-sync/stubs/`,
//      since there are three of them rather than a directory's worth.)
//   4. `dist/types/` — the emitted declaration tree plus its `index.d.ts`.
//
// Adding a component to the design system = add it to `componentSrcMap` in
// config.json. Everything below is derived from that map: the barrel, the
// declaration entry, and the card grouping. The only hand-kept list is
// EXTRAS — files that ship in the bundle without claiming a card.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(REPO);

const die = (msg) => {
  console.error(`[REGEN] ${msg}`);
  process.exit(1);
};

// Local binaries, never `npx`. `npx --yes <pkg>@4` resolves the newest 4.x over
// the network on every run: it fails outright on a cold offline cache, and it
// silently drifts from the version the app itself builds with — which for the
// Tailwind CLI means the design bundle's stylesheet stops being the app's
// stylesheet. Both tools are devDependencies; use the installed ones.
const bin = (name) => {
  const p = resolve(REPO, 'node_modules/.bin', name);
  if (!existsSync(p)) die(`node_modules/.bin/${name} is missing — run \`pnpm install\``);
  return p;
};

const cfg = JSON.parse(readFileSync('.design-sync/config.json', 'utf8'));
const cards = Object.entries(cfg.componentSrcMap ?? {});
if (!cards.length) die('config.json has no componentSrcMap — nothing to build');

// Bundled but not carded, so not derivable from `componentSrcMap`:
//  * `app/pending-messages` — TransactionComposer calls usePendingMessages(),
//    which throws outside this provider. It ships so the preview wrapper (and
//    any design composing the composer) can supply the context.
//  * `theme-provider` — the app's real theme root. It is nested inside
//    `.design-sync/preview-providers.tsx`, and it is what a design built from
//    this system should wrap its own tree in.
const EXTRAS = [
  'src/components/app/pending-messages.tsx',
  'src/components/theme-provider.tsx',
];

const FILES = [...new Set([...cards.map(([, file]) => file), ...EXTRAS])].sort();
const absent = FILES.filter((f) => !existsSync(f));
if (absent.length) die(`componentSrcMap/EXTRAS name files that don't exist: ${absent.join(', ')}`);

// `export *` silently drops a name exported by two files — fail loudly instead.
// The pattern list has to stay as wide as the export syntax actually in use
// (`export type`, `export async function`, `export default class`, …): a name
// the guard can't see is a name it can't protect, and the breakage surfaces
// only as a missing symbol in the design agent's .d.ts. Keep it in step with
// the action-stub scanner below. `preview-providers.tsx` is re-exported into
// the same namespace by `ds-entry.ts`, so it is scanned too.
const EXPORT_DECL =
  /export\s+(?:declare\s+)?(?:async\s+)?(?:default\s+)?(?:abstract\s+)?(?:function|const|let|var|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g;
const owner = new Map();
const dupes = [];
for (const f of [...FILES, '.design-sync/preview-providers.tsx']) {
  const src = readFileSync(f, 'utf8');
  const names = new Set();
  for (const m of src.matchAll(EXPORT_DECL)) names.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const t = part.trim();
      if (!t) continue;
      const as = /\bas\s+([\w$]+)$/.exec(t);
      names.add(as ? as[1] : t.replace(/^type\s+/, ''));
    }
  }
  for (const n of names) {
    if (owner.has(n)) dupes.push(`${n}: ${owner.get(n)} vs ${f}`);
    else owner.set(n, f);
  }
}
if (dupes.length) die(`duplicate exports across entry files:\n  ${dupes.join('\n  ')}`);

writeFileSync(
  '.design-sync/ds-entry.ts',
  '// GENERATED by .design-sync/regen.mjs — do not edit by hand.\n' +
    '// Curated browser-safe surface of the SpendChat component library.\n' +
    // Must stay first: ES module imports evaluate in source order, and the
    // shim has to install `globalThis.process` before Next's client runtime
    // reads `process.env.*` at module scope. See browser-shim.ts.
    'import "./browser-shim";\n' +
    FILES.map((f) => `export * from "@/${f.replace(/^src\//, '').replace(/\.tsx$/, '')}";`).join('\n') +
    '\nexport * from "./preview-providers";\n',
);

// ── server-action stubs ──────────────────────────────────────────────────
const STUB_DIR = '.design-sync/.cache/stubs/actions';
mkdirSync(STUB_DIR, { recursive: true });
let stubCount = 0;
for (const f of readdirSync('src/actions').filter((n) => n.endsWith('.ts'))) {
  const src = readFileSync(`src/actions/${f}`, 'utf8');
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) {
    names.add(m[1]);
  }
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const t = part.trim();
      if (!t || t.startsWith('type ')) continue;
      const as = /\bas\s+([\w$]+)$/.exec(t);
      names.add(as ? as[1] : t);
    }
  }
  // Return type is `any`, not `never`: callers destructure the real action's
  // result (`{ ok, error, count }`), and `never` would make every one of those
  // reads a declaration-emit error.
  const body = [...names]
    .sort()
    .map(
      (n) =>
        `// eslint-disable-next-line @typescript-eslint/no-explicit-any\n` +
        `export async function ${n}(..._args: unknown[]): Promise<any> {\n` +
        `  throw new Error(\n` +
        `    "${n}() is a server action. The SpendChat design-system bundle ships a stub — " +\n` +
        `      "wire your own handler when composing with this component.",\n` +
        `  );\n}`,
    )
    .join('\n\n');
  writeFileSync(
    `${STUB_DIR}/${f}`,
    `// GENERATED by .design-sync/regen.mjs — no-op stand-in for src/actions/${f}.\n` +
      `// See the header of regen.mjs for why these are stubbed.\n\n` +
      (body || 'export {};') +
      '\n',
  );
  stubCount += names.size;
}

// ── stylesheet ───────────────────────────────────────────────────────────
// The CLI ships its own copy of the Tailwind engine, so "same major" is not
// enough: if it compiles on a different 4.x than the app's PostCSS plugin, the
// cards — and every design built from them — silently stop matching production
// on whatever changed between the two patches. `@tailwindcss/cli` and
// `tailwindcss` are published in lockstep, so equal versions is the check.
const pkgVersion = (name) => JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8')).version;
const appTailwind = pkgVersion('tailwindcss');
const cliTailwind = pkgVersion('@tailwindcss/cli');
if (appTailwind !== cliTailwind) {
  die(
    `@tailwindcss/cli is ${cliTailwind} but the app builds with tailwindcss ${appTailwind} — ` +
      `the design bundle's stylesheet would not be the app's. Pin both to the same 4.x in package.json.`,
  );
}
execFileSync(
  bin('tailwindcss'),
  ['-i', '.design-sync/tailwind-entry.css', '-o', '.design-sync/.cache/tailwind.css'],
  { stdio: 'inherit' },
);

// ── declaration tree ─────────────────────────────────────────────────────
// The converter reads `<Name>Props` from the package's shipped .d.ts; with no
// declarations every emitted contract collapses to `[key: string]: unknown`,
// which is what the claude.ai/design agent would then code against.
//
// `index.d.ts` is the types entry (package.json `types`): the converter reads
// the component list AND each component's props from it. Only the card set is
// re-exported, so sub-parts (CardHeader, DialogTrigger, …) stay importable
// from the bundle without each claiming its own preview card.
const byModule = new Map();
for (const [name, file] of cards) {
  const mod = './' + file.replace(/\.tsx$/, '');
  if (!byModule.has(mod)) byModule.set(mod, []);
  byModule.get(mod).push(name);
}

// Two different failures hide behind a non-zero `tsc`, and only one of them is
// tolerable. A *type* error still emits declarations for everything it could
// check, so it is reported and the build continues. A failure to emit at all —
// tsc missing, tsconfig unparseable, `ds-entry.ts` unlexable — must be fatal,
// or the sync silently ships the `[key: string]: unknown` contracts this whole
// step exists to prevent. The output streams don't separate them (diagnostics
// go to stdout, spawn and config failures to stderr), so the emitted files are
// what decides: every card module must have landed a `.d.ts`.
rmSync('dist/types', { recursive: true, force: true });
let tscOutput = '';
try {
  execFileSync(bin('tsc'), ['-p', '.design-sync/tsconfig.emit.json'], { stdio: 'pipe' });
} catch (e) {
  tscOutput = `${String(e.stdout ?? '')}\n${String(e.stderr ?? '')}`.trim();
}
const unemitted = [...byModule.keys()].filter((mod) => !existsSync(`dist/types/${mod.slice(2)}.d.ts`));
if (unemitted.length) {
  die(
    `tsc emitted no declarations for ${unemitted.length}/${byModule.size} card module(s), ` +
      `starting with ${unemitted[0]} — the sync would ship empty prop contracts.\n` +
      (tscOutput || '(tsc produced no output)'),
  );
}
if (tscOutput) {
  const lines = tscOutput.split('\n').filter(Boolean);
  console.error(`[REGEN] tsc reported ${lines.length} diagnostic(s) — declarations still emitted`);
}

mkdirSync('dist/types', { recursive: true });
writeFileSync(
  'dist/types/index.d.ts',
  '// GENERATED by .design-sync/regen.mjs — types entry for the design-system sync.\n' +
    [...byModule.entries()]
      .sort()
      .map(([mod, names]) => `export { ${names.sort().join(', ')} } from "${mod}";`)
      .join('\n') +
    '\n',
);

// ── card grouping ────────────────────────────────────────────────────────
// The converter derives a component's group from its source directory, but
// `ui/` and `components/` are both on its generic-name skip list — so every
// shadcn primitive, plus the two marks sitting directly under `components/`,
// would collapse into "general". Group is the picker's only navigation
// affordance, so those two cases get an explicit group.
//
// The mechanism is a frontmatter-only `<Name>.md` in `cfg.docsDir`: the
// converter reads `category` from it, and because the body is empty it still
// synthesizes the real `.prompt.md` from the props + authored preview. A doc
// with actual prose would REPLACE that synthesis — so keep these stubs empty.
//
// A doc category only wins where the directory-derived group came out generic,
// which is precisely the two cases below. Everything else already groups by its
// own directory — app/, attachments/, files/, icons/, marketing/ — which
// mirrors the repo and needs no override; a doc written for one of those looks
// authoritative and is silently ignored. That's why the rules are *paths* and
// not a list of names: the path is the thing the converter reacts to.
const GROUP_RULES = [
  ['primitives', /^src\/components\/ui\//],
  ['brand', /^src\/components\/[^/]+\.tsx$/],
];
const grouped = new Map();
for (const [name, file] of cards) {
  const rule = GROUP_RULES.find(([, re]) => re.test(file));
  if (rule) grouped.set(name, rule[0]);
}
const emptyGroups = GROUP_RULES.map(([g]) => g).filter((g) => ![...grouped.values()].includes(g));
if (emptyGroups.length) {
  die(`no cards matched group rule(s): ${emptyGroups.join(', ')} — did src/components move?`);
}

rmSync('.design-sync/docs', { recursive: true, force: true });
mkdirSync('.design-sync/docs', { recursive: true });
for (const [name, group] of grouped) {
  writeFileSync(`.design-sync/docs/${name}.md`, `---\ncategory: ${group}\n---\n`);
}

console.error(
  `[REGEN] ${FILES.length} files, ${owner.size} exports, ${stubCount} action stubs, ` +
    `${cards.length} typed cards, ${grouped.size} regrouped ` +
    `→ ds-entry.ts + .cache/{tailwind.css,stubs/} + dist/types/ + docs/`,
);

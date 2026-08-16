// Loaded as the FIRST import of the generated `ds-entry.ts`, so it runs before
// any bundled module body.
//
// Components that use `next/link` or `next/navigation` pull in Next's client
// runtime, which reads `process.env.__NEXT_ROUTER_BASEPATH`,
// `process.env.NEXT_RUNTIME` and friends at module scope. The converter's
// esbuild pass only defines `process.env.NODE_ENV`, so every other read stays a
// real runtime lookup — and in a plain browser page there is no `process`.
// Without this shim all 63 preview cards die on `ReferenceError: process is not
// defined` before React renders anything.
//
// Defining the object (rather than each variable) keeps this independent of
// which Next internals a future component happens to touch: unset keys read
// back as `undefined`, which is exactly what Next's defaults expect.

const g = globalThis as unknown as {
  process?: { env?: Record<string, string | undefined> };
};

g.process ??= {};
g.process.env ??= { NODE_ENV: "production" };

export {};

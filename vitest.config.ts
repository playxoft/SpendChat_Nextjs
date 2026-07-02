import { defineConfig } from "vitest/config";
import path from "node:path";

const r = (p: string) => path.resolve(__dirname, p);

export default defineConfig({
  resolve: {
    alias: {
      "@": r("src"),
      // `server-only` throws when imported outside an RSC graph. In tests we run
      // those modules directly under Node, so swap it for an empty module.
      "server-only": r("tests/stubs/server-only.ts"),
    },
  },
  test: {
    globals: true,
    // Two suites, both Node: pure logic (fast, no I/O) and DB-backed integration.
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          setupFiles: ["tests/integration/setup.ts"],
          // One shared in-process Postgres; serialize files to avoid cross-talk.
          fileParallelism: false,
          pool: "forks",
          // Each file boots PGlite + runs migrations in its beforeAll; under the
          // parallel unit project that cold start can exceed the default 10s.
          hookTimeout: 30000,
          testTimeout: 20000,
        },
      },
    ],
    coverage: {
      provider: "v8",
      all: true,
      reportsDirectory: "coverage",
      reporter: ["text", "text-summary", "html"],
      // The enforced core: money/validation/security logic, server actions,
      // queries, and the CSV export route. Everything here is held to the gate.
      include: [
        "src/lib/**/*.ts",
        "src/actions/**/*.ts",
        "src/app/api/transactions/export/route.ts",
      ],
      exclude: [
        // Thin third-party wiring — nothing of ours to assert.
        "src/lib/neon-auth.ts",
        "src/lib/neon-auth-client.ts",
        // Logging I/O wiring (console + BetterStack HTTP shipping), same rationale.
        "src/lib/logger.ts",
        // MDX-backed; covered behaviourally, not held to the branch gate
        // (the `isProd` draft filter short-circuits and can't both-branch).
        "src/lib/blog.ts",
        "**/*.d.ts",
      ],
      thresholds: {
        // "100% coverage" in the conventional sense: every line, statement, and
        // function is exercised. Branches are held high but not at 100 — real
        // defensive code (`a?.b ?? c`) has alternatives that can't be reached
        // without contortion. Tuned to the achieved level so the gate is honest.
        lines: 100,
        functions: 100,
        statements: 100,
        branches: 97,
      },
    },
  },
});

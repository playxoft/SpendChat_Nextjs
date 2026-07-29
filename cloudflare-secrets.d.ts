// Ambient augmentation for runtime secrets read off the Cloudflare Worker
// binding (`getCloudflareContext().env`).
//
// Secrets are provisioned via `wrangler secret put` / Doppler, NOT declared in
// wrangler.toml, so `wrangler types` never emits them onto `CloudflareEnv`. The
// generated `cloudflare-env.d.ts` is gitignored and only knows the wrangler.toml
// bindings, so a fresh checkout (CI) sees a `CloudflareEnv` without them and
// `tsc` fails on any `env.<SECRET>` access — here, `src/db/index.ts` reads the
// database URL off the binding as a fallback to `process.env`.
//
// This file is committed, so the type exists in CI too. Declared optional: the
// value comes from the environment and may be unset (the caller throws when it
// is). Add a line here whenever code reads a new secret through the binding.
//
// No import/export above — this stays an ambient (global) script so the
// interface merges with the generated `CloudflareEnv`, matching how
// cloudflare-env.d.ts and @opennextjs/cloudflare declare it.
interface CloudflareEnv {
  NEON_POSTGRES_DATABASE_URL?: string;
}

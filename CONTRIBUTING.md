# Contributing to MoneyTracker

Thanks for your interest in contributing! This document covers how to get set up,
the conventions we follow, and how to submit changes.

## Getting started

See the [README](./README.md#-getting-started) for full setup. In short:

- Node.js ≥ 20 and **pnpm**
- The **Doppler** CLI (provides all secrets) and a **Neon** project
- `pnpm install`, then `doppler setup`, then `pnpm dev`

## Before you open a pull request

Both of these must pass — CI will reject changes that don't:

```bash
pnpm lint
pnpm typecheck
```

If you changed the database schema, regenerate migrations with `pnpm db:generate`
and include the generated files in your PR.

## Conventions

Please read [`AGENTS.md`](./AGENTS.md) — it's the source of truth for project
conventions. The most important ones:

- **Money** is stored as integer minor units (`amount_minor`). Convert via
  `src/lib/money.ts`; never use floats for amounts.
- **Single currency per user** — don't introduce per-transaction currency.
- **Every query is scoped to the authenticated user.** Reads go in
  `src/lib/queries.ts`, mutations in `src/actions/*`, both validated with Zod.
- Keep the UI minimal and neutral — no gradients; income uses the single emerald accent.

## Commits

We follow [Conventional Commits](https://www.conventionalcommits.org/), e.g.:

```
feat(transactions): add CSV export
fix(auth): handle expired OTP codes
chore: bump dependencies
```

### Developer Certificate of Origin (DCO)

Sign off each commit to certify you wrote the code or have the right to submit it
under the project license (see the [DCO](https://developercertificate.org/)):

```bash
git commit -s -m "feat: ..."
```

This adds a `Signed-off-by:` line to your commit message.

## License

By contributing, you agree that your contributions are licensed under the
[Apache License 2.0](./LICENSE), the same license that covers this project
(per section 5 of the license).

## Reporting issues

Open a GitHub issue with steps to reproduce, what you expected, and what happened.
For security issues, please **do not** open a public issue — contact the
maintainers privately instead.

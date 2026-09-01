# Contributing to SpendChat

Thanks for your interest in contributing! This document covers how to get set up,
the conventions we follow, and how to submit changes.

## Getting started

See the [README](./README.md#-getting-started) for full setup. In short:

- Node.js ≥ 22 and **pnpm**
- A **Neon** project (the free tier is enough) and a **Firebase** project with
  Authentication enabled

```bash
pnpm install
cp .env.example .env.local   # then fill in your own values
pnpm db:migrate:local
pnpm dev:local
```

The `*:local` scripts read `.env.local` directly — **you do not need Doppler.**
Doppler is only the maintainers' secret store, and the unsuffixed scripts
(`pnpm dev`, `pnpm deploy:*`, `pnpm db:*:dev`) are the ones that wrap it.
Everything it injects is documented in [`.env.example`](./.env.example);
anything marked optional there simply disables its feature when unset.

## Before you open a pull request

All three must pass — CI will reject changes that don't:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

The test suite needs no database of its own: the integration tests run Postgres
in-process (PGlite) and apply the real migrations to it.

If you changed the database schema, regenerate migrations with `pnpm db:generate`
and include the generated files in your PR.

## Conventions

Please read [`AGENTS.md`](./AGENTS.md) — it's the source of truth for project
conventions. The most important ones:

- **Money** is stored as integer minor units (`amount_minor`). Convert via
  `src/lib/money.ts`; never use floats for amounts.
- **Single currency per workspace** — read it from the workspace, not from
  `user_settings`, and don't introduce per-transaction currency.
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

## Contributor License Agreement (CLA)

SpendChat is **open core**: the code in this repository is open source under
AGPL-3.0, and Playxoft also offers a commercial/SaaS product built on top of it
(see [Open core & commercial use](#open-core--commercial-use) below).

Because of this, before your first pull request can be merged you'll be asked to
sign our [**Contributor License Agreement**](./CLA.md). The CLA is handled
automatically by a bot on your PR — it takes a moment and only needs to be done once.

By signing, you confirm you wrote the contribution (or have the right to submit
it) and you grant Playxoft a broad license to use it, including in the commercial
product. **You keep the copyright to your work** — this is a license grant, not a
transfer of ownership.

## Open core & commercial use

The contents of this repository are and will remain open source under
[AGPL-3.0](./LICENSE). Playxoft maintains a separate commercial offering (hosted
SaaS and/or premium features) built on top of this open core. We will **never
paywall or remove a feature that has already been released as open source** here.

## Code of Conduct

Participation in this project is governed by our
[Code of Conduct](./CODE_OF_CONDUCT.md). Please read it.

## Reporting issues

Open a GitHub issue with steps to reproduce, what you expected, and what happened.
For security issues, please **do not** open a public issue — follow the private
reporting process in [`SECURITY.md`](./SECURITY.md) instead.

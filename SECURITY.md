# Security Policy

## Supported versions

SpendChat is under active development. Security fixes are applied to the
`master` branch. There are no long-term support branches yet.

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues,
discussions, or pull requests.**

Instead, report them privately using **GitHub's private vulnerability reporting**:

1. Go to the [**Security** tab](https://github.com/playxoft/SpendChat_Nextjs/security/advisories/new) of this repository.
2. Click **"Report a vulnerability"**.
3. Fill in the details — what you found, how to reproduce it, and the potential impact.

<!--
MAINTAINER NOTE: enable private reports first, or the link above 404s:
  Repo → Settings → Code security and analysis → Private vulnerability reporting → Enable.
-->

We will acknowledge your report as quickly as we can and keep you updated on the
fix. Please give us a reasonable window to address the issue before any public
disclosure.

## Scope

This project handles personal financial data, so we take the following
especially seriously:

- Authentication and session handling (Firebase Authentication — ID tokens are
  verified statelessly against Google's JWKS and bridged to an httpOnly
  `__session` cookie; the mobile API accepts the same token as a bearer)
- Cross-account data access (every query must be scoped to the authenticated
  user's workspace/profile access)
- Injection (queries are parameterized via Drizzle; input is validated with Zod)
- Secret exposure (secrets are injected from the environment and never committed)

Thank you for helping keep SpendChat and its users safe.

# Changelog

## 0.2.0 — 2026-10-24

- Add a Chinese setup wizard with account labels, Event/custom model selection, Chinese comma support and optional console-backed quota. Provider/account labels include 超算互联网 and an embedded icon identifies the provider. Same-label sign-in updates that account; distinct accounts require distinct labels.
- Read the selected SCNet console subscription through its session cookie and report remaining/used/total Credits plus expiry. Never combine unrelated subscriptions, guess missing balances, follow credential redirects or let a quota failure expire inference authentication. The cookie is optional and is cleared when quota is skipped.
- Add Chinese default documentation, an English guide, upgrade instructions, session-connection steps, a real Magpie screenshot using synthetic data, and source/acceptance notes for the internal console API.
- Extend the isolated integration harness with a fixture web UI, dynamic subscription selection, account labels and quota checks. Existing API keys/model lists remain usable; legacy anonymous accounts need the new setup to gain labels and quota metadata.

CHECKS_RUN: 22 unit tests; isolated Magpie 0.1.1364 CLI install/login/account update/quota/logout and 12 mock protocol cases; real-browser Event/quota and custom-model/no-quota flows, invalid input checks, masked Cookie field, two named accounts, quota meter and zero browser errors; package dry-run; whitespace check.

CHECKS_NOT_RUN: real authenticated SCNet quota, paid inference, native OpenCode.

WHY_NOT: No real SCNet credential/session was supplied; Magpie is the target runtime. Public console bundles and an anonymous login-required response establish the quota adapter contract, while successful response/UI acceptance uses synthetic fixtures.

EVIDENCE_PATH: `test/setup.test.mjs`; `test/plugin.test.mjs`; `scripts/test-magpie.mjs`; `docs/account-quota.png`; `docs/quota-api.md`; GitHub Actions for this commit.

## 2026-10-24 — Rename to scnet-auth

- Rename the package and GitHub repository to `scnet-auth`, and update installation, removal, repository and issue links.
- Keep the provider ID `scnet-token-plan` and OpenCode discovery keywords so existing account/model configuration and Magpie discovery remain compatible.

## 0.1.0 — 2026-10-24

- Add the `scnet-token-plan` provider using Magpie's documented OpenCode plugin hooks, with dedicated API-key sign-in and model IDs scoped to each account.
- Default to `DeepSeek-V4.1-Flash-1017-Event`, preserving its exact Event suffix. Other plans can enter the IDs their own SCNet console lists.
- Send requests only to SCNet's HTTPS Chat Completions endpoint, with fresh account credentials, redirects disabled, and response streams/errors preserved.
- Include MIT licensing, GitHub distribution metadata, a Node.js 22/24 CI matrix, unit tests, and a macOS integration harness.

CHECKS_RUN: 11 Node.js unit tests; Magpie 0.1.1364 with Bun 1.4.4 in isolated XDG directories and a macOS process/filesystem sandbox; actual add/list/login/logout; 12 mock gateway cases covering Chat, Anthropic and Responses, JSON/SSE, text/tool calls.

CHECKS_NOT_RUN: live SCNet inference, real credits/expiry lookup, native OpenCode execution.

WHY_NOT: No real SCNet credential was supplied; the documented plan pages do not establish a credits API; Magpie is the target host for this release.

EVIDENCE_PATH: `test/plugin.test.mjs`; `scripts/test-magpie.mjs`; `.github/workflows/test.yml`; official references linked in `README.md`.

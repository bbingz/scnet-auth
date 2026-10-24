# Changelog

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

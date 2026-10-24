# Changelog

## 0.3.5 — 2026-10-25

- Browser sign-in completes by itself, as WorkBuddy's does: once SCNet accepts the default browser's session, the account, existing key, plan and models are saved. The local "连接到 Magpie" confirmation page, its loopback listener and `signin.html` are removed at the user's request. SCNet allows one Token Plan per account, so the enabled, unexpired plan with Credits left is chosen (the one ending first when several have Credits); a plan whose models cannot be read fails with a pointer to manual setup instead of a model form.
- Mark every Token Plan model as reasoning-capable. SCNet's plan page lists all models with deep thinking; only DeepSeek IDs were marked before.
- Write the remaining English loader error and the quota hint for unconnected accounts in Chinese, without pointing manual/non-macOS users at the macOS browser sign-in.

CHECKS_RUN: new sign-in, plan-choice and reasoning tests failed on 0.3.4; 46 unit tests pass; isolated real Magpie 0.1.1364 run passes manual/browser sign-in (browser completing without a page), repeat login, quota, plugin account removal and 12 gateway cases.

CHECKS_NOT_RUN: Chromium/WebKit account-management UI run (that code is unchanged); a live SCNet browser sign-in through the new flow (needs the user's browser session and Keychain consent).

## 0.3.4 — 2026-10-24

- Add a plugin-owned Chinese account-management option to Magpie's existing method picker. Users can select and confirm removal of any saved SCNet record, including the first and last, without changing Magpie, opening another browser page or signing in again. The original website login and confirmation flow are unchanged.
- Enumerate SCNet entries from the host-provided credential file and delegate deletion to `client.auth.remove`, preserving host locking, backups and cache invalidation. Show names or masked key suffixes. Confirmation tokens expire, stale records fail closed, and repeated/concurrent prompt requests share one deletion. Another slot carrying the same key and other providers' records stay intact.
- Keep management in the prompt flow without credential authorization or a dummy sign-in. The host's Cancel control closes the completion message; users reopen the provider to refresh its list. Document the entry path and this existing host limitation in Chinese and English.
- Verify against the installed, unmodified Magpie 0.1.1364 in an isolated macOS sandbox using fake credentials.

CHECKS_RUN: missing-entry regression failed before implementation; 48 unit tests passed; real-host prompt API first/last removal, cancellation and duplicate-request checks; Chromium 1100px and WebKit 420px UI removal/cancel/refresh checks; existing manual/browser login, repeat login, quota and 12 gateway cases passed; package dry-run and whitespace checks passed.

CHECKS_NOT_RUN: hosted CI and public-commit installation are post-push checks, tracked in GitHub Actions and the workspace release record; Windows/Linux account management and other host versions (only the available macOS Magpie 0.1.1364 was exercised); removal of real credentials (synthetic fixtures were used); installed-plugin update (publication does not update the running installation).

WHY_NOT: These are prepublication validation results. Live account deletion, gateway restart and Magpie source deployment are outside this plugin release.

EVIDENCE_PATH: `.verification/accounts-red.txt`; `.verification/accounts-tests.txt`; `.verification/accounts-magpie.txt`; `.verification/accounts-ui-final.txt`; `.verification/accounts-package.json`; `output/playwright/accounts-*-confirm.png`; `output/playwright/accounts-*-done.png`.

## 0.3.3 — 2026-10-24

- Use the official homepage's desktop SSO entry instead of the compact ACM login page, preserving the Token Plan destination and default-browser session import.
- Update the public GitHub repository description with 超算互联网 and SCNet. Magpie's GitHub discovery searches this description, not the package description; document its roughly ten-minute list cache.
- Correct the Chinese browser-login documentation anchor. Validate the desktop URL and destination with an initially failing regression, 45 passing tests, the real isolated Magpie integration and an anonymous browser rendering of the official desktop login page.

## 0.3.2 — 2026-10-24

- Open SCNet's official login page in the default browser. Replace the rejected local SMS form with read-only import of that browser's SCNet session on macOS; retain only a post-login account/subscription confirmation page. Remove the SMS module and its endpoints.
- Resolve only the default Chrome/Edge/Brave browser and its last-used profile. Query exact SCNet hosts and console paths in read-only SQLite, excluding partitioned/expired cookies. Never copy the whole browser database, scan other profiles, or read other sites/passwords/history. Use macOS Keychain with its normal authorization; keep the secret/derived key transient, validate Chromium hostname binding, and stop on refusal or unsupported storage. No dependencies or browser security changes.
- Recheck identity/key/plan before saving, reject stale confirmations after account switching, and allow explicit reread. Preserve manual accounts, exact model matching and selected-plan quota. Update Chinese/English support limits and privacy explanations. Node's SQLite path requires Node >=22.13; Magpie uses Bun's built-in SQLite.
- Verified real current-default Chrome Beta session import, official identity and existing key, one subscription's model mapping, and real Credits through the production quota reader under Bun. No phone/code/password input, real inference, key reset or purchase was performed. Live evidence stores only sanitized outcomes.

CHECKS_RUN: 45 passing unit tests; initially failing official-page and Chromium 64-bit expiry regressions; isolated real Magpie CLI encrypted-browser fixture import, confirmation persistence, repeat login, existing-account preservation, selected-plan quota and 12 mock gateway cases; rendered confirmation/reread/success checks; real Chrome Beta session and quota read-only probes; package dry-run; whitespace check.

CHECKS_NOT_RUN: fresh signed-out website login followed by cookie flush/import; other browser live accounts; native OpenCode; unsupported Safari/Windows/Linux automatic import; long-term session expiry.

WHY_NOT: Live verification used the user's already authenticated default Chrome Beta profile; other environments and a fresh interactive login were not exercised. No broad compatibility claim is made.

EVIDENCE_PATH: `.verification/official-browser-red.txt`; `.verification/browser-timestamp-red.txt`; `.verification/tests-0.3.2.txt`; `.verification/magpie-0.3.2.txt`; `.verification/live-browser-session.json`; `.verification/live-browser-quota.json`; `output/playwright/official-browser-confirm.png`; `docs/quota-api.md`.

## 0.3.1 — 2026-10-24

- Replace isolated Chrome/Edge sign-in with Magpie's default-browser opener and a temporary loopback page. Remove the Playwright runtime dependency. No browser extension or password is required.
- Use the SMS endpoints independently verified in the official SCNet 3.2.1 desktop artifact: request a code only on user action, establish the session, read identity/existing key/subscriptions, and require confirmation before Magpie saves the account. The page clearly identifies itself as a local community-plugin UI; it does not reuse the browser's existing website login. Phone numbers and SMS codes are not persisted or logged.
- Bind the listener to 127.0.0.1, validate Host/Origin and a random per-attempt capability, bound request bodies, forbid framing/external scripts, scope cookies, throttle SMS sends and abort work on cancellation/timeout. Preserve legacy accounts, exact model matching and selected-plan quota.
- Update Chinese/English instructions, source evidence and the real Magpie integration harness for the SMS flow.

CHECKS_RUN: 37 unit tests, including the initially failing default-browser regression; isolated Magpie CLI SMS/manual persistence, repeat login, selected-plan quota and twelve mocked gateway protocol cases; actual Chrome SMS/confirmation/success flow with synthetic data and zero console errors/warnings; official desktop source inspection and anonymous missing-parameter checks; package dry-run and whitespace validation.

CHECKS_NOT_RUN: real authenticated SMS sign-in/remaining Credits, Windows/Linux browser opening, native OpenCode.

WHY_NOT: Real SMS and subscription acceptance require the user's phone and interaction. No real SMS was sent during verification. macOS is the available desktop environment.

EVIDENCE_PATH: `test/browser-login.test.mjs`; `test/current-browser.test.mjs`; `scripts/test-magpie.mjs`; `docs/quota-api.md`; local-only `.verification/tests-0.3.1.txt`, `.verification/magpie-0.3.1.txt`, `.verification/desktop-login-anonymous.json`, `output/playwright/current-browser-confirm.png`.

## 0.3.0 — 2026-10-24

- Make browser sign-in the default: open SCNet's official login page in an isolated installed Chrome/Edge browser, then read the user's identity, existing Token Plan key and subscriptions. Confirm the subscription in a Chinese page before returning credentials to Magpie. Passwords and verification codes remain on the official page; no manual Cookie/API-key copying is required.
- Resolve models only through the subscription's matching package code. Ask for exact IDs when discovery is unavailable. Preserve multiple accounts, legacy credentials and the advanced manual method; repeated browser sign-in updates its matching identity. Duplicate subscription names remain distinguishable.
- Scope session capture to the new context and SCNet console origin. Close the temporary browser on success, cancellation or timeout. Refuse missing/masked keys, never create/reset keys or buy subscriptions, and keep credentials out of the confirmation page and error messages. Add pinned playwright-core, with no browser download.
- Update Chinese and English setup/upgrade instructions, actionable quota errors, endpoint evidence, unit coverage and the isolated Magpie integration harness.

CHECKS_RUN: 31 Node.js unit tests, including the original failing default-login reproduction; actual Magpie CLI manual/browser callback storage and repeat-login checks; selected-plan quota; twelve mocked gateway protocol cases; actual Chrome confirmation-page visual check and synthetic confirmation click; package dry-run and whitespace checks.

CHECKS_NOT_RUN: real authenticated SCNet browser login and quota, Windows/Linux browser launch, native OpenCode.

WHY_NOT: Real sign-in requires the user's interaction with the official page. Synthetic browser and gateway results do not establish real account balances. Desktop validation used macOS and Chrome.

EVIDENCE_PATH: `test/browser-login.test.mjs`; `scripts/test-magpie.mjs`; `docs/quota-api.md`; local-only `.verification/tests-0.3.0.txt` and `.verification/magpie-0.3.0.txt`.

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

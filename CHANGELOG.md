# Changelog

## 0.3.6 — 2026-10-25

- The plugin market card shows SCNet's own mark (the red "SCNet" of its website icon) instead of a generic puzzle piece; it is set in `package.json`'s `magpie.icon`. The provider and its accounts use the same picture in place of the blue "S" drawn for 0.2.0.

## Documentation — 2026-10-25

- Rewrite the Chinese and English READMEs around installing, signing in, Credits and removing accounts, and turn `docs/quota-api.md` into a plain description of how sign-in and Credits work.

## 0.3.5 — 2026-10-25

- Browser sign-in finishes by itself: once SCNet accepts the browser's session, the account, key, plan and models are saved. The local "连接到 Magpie" confirmation page is gone.
- SCNet allows one Token Plan per account, so the plan is chosen automatically: enabled, not expired, with Credits left, ending first. If its models can't be read, sign-in fails and points to manual setup.
- All Token Plan models are marked as supporting reasoning (SCNet lists every one with deep thinking); only DeepSeek models were before.
- Remaining English error text is now Chinese, and the hint for accounts without Credits no longer sends manual users to the macOS browser sign-in.

## 0.3.4 — 2026-10-24

- Add **管理已保存账号（移除旧 KEY）** to the sign-in methods: pick a saved SCNet account and confirm to remove it, including the first or the only one, which Magpie's own account list doesn't offer. Only Magpie's local record is removed.

## 0.3.3 — 2026-10-24

- Open SCNet's desktop login page (the one its homepage uses) instead of the compact mobile-style page.
- Add a Chinese GitHub description so searching 超算 or 超算互联网 in Magpie's plugin market finds the plugin.

## 0.3.2 — 2026-10-24

- Sign in on SCNet's official page in the default browser and read that browser's SCNet session (macOS Chrome, Edge, Brave), with the macOS Keychain prompt. Replaces the local SMS form of 0.3.1.

## 0.3.1 — 2026-10-24

- Sign in through a local SMS page opened in the default browser, replacing the separate browser window of 0.3.0. Remove the Playwright dependency.

## 0.3.0 — 2026-10-24

- Browser sign-in becomes the default: sign in on SCNet in a separate browser window, and the account name, existing key, plan models and Credits are filled in automatically.

## 0.2.0 — 2026-10-24

- Chinese setup wizard with account labels, Event or custom models, and optional Credits through the console cookie.
- Accounts and the provider are named 超算互联网, with their own icon.

## Rename — 2026-10-24

- Rename the package and repository to `scnet-auth` (still 0.1.0). The provider ID stays `scnet-token-plan`, so existing accounts keep working.

## 0.1.0 — 2026-10-24

- First release: the `scnet-token-plan` provider with API-key sign-in, per-account model IDs (default `DeepSeek-V4.1-Flash-1017-Event`), streaming and tool calls, sending requests only to SCNet's Chat Completions endpoint.

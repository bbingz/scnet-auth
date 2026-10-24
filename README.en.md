# SCNet Token Plan for Magpie

[简体中文](README.md)

An independent MIT-licensed plugin connecting your own SCNet Token Plan to Magpie. Version 0.3.0 defaults to browser sign-in, automatically importing account identity, an existing Token Plan key, subscription models and a session for Credits usage. It uses pinned `playwright-core` with an installed Chrome/Edge browser; no browser download or build step.

![Account and quota in real Magpie](docs/account-quota.png)

*The screenshot uses an isolated Magpie instance and synthetic account/balance data.*

## Installation and setup

Search **scnet** in Magpie's Plugins discovery. This is the **Unofficial, on GitHub** section, not a maintainer-reviewed registry listing. Direct installation:

```sh
magpie plugin add github:bbingz/scnet-auth
magpie plugin login scnet-token-plan
```

Choose **浏览器登录超算互联网（推荐）**. Complete sign-in on the official SCNet website in the isolated browser window, then select your subscription and confirm **连接到 Magpie**. No developer tools, Cookie copying, or API key entry is needed. Passwords and verification codes remain on the official site. The plugin reads an existing key; it never creates/resets keys or purchases plans.

The plugin reads only its fresh temporary browser context, never your existing browser profile. It closes that browser after confirmation, cancellation or a five-minute deadline. Install Chrome or Edge first; an existing Playwright Chromium is also supported. Headless/remote hosts can use the advanced manual API-key method.

Subscription `resourceId` is matched to its package code for exact model IDs. If discovery cannot establish the models, the confirmation page asks for them. Public catalog entries alone do not establish account entitlement.

Update the plugin to 0.3.0, then sign in through the browser. Old anonymous/manual accounts remain intact; verify the new account before signing the old one out. Repeated browser sign-in for the same username and subscription updates that browser account. Session expiry requires another browser sign-in and does not invalidate a working inference key.

## Advanced manual setup

**手动配置 API Key（高级 / 无桌面环境）** retains account labels, Event/custom models and optional manual Cookie entry for machines without a desktop browser. Browser sign-in is the normal setup path.

## Optional Credits usage

Quota uses the SCNet console's internal endpoint, **not** the inference API key:

```text
https://www.scnet.cn/acx/charge/account/currentuser/tokenplan/list
```

In your browser, sign in to the [Token Plan console](https://www.scnet.cn/ui/console/index.html#/llm/token-plan), open Developer Tools → Network, refresh, and filter `tokenplan/list`. Copy the **Cookie request-header value** into the wizard's masked field. Do not include `Cookie:`, response `Set-Cookie` headers or a complete cURL command. Select the subscription matching the API key you will enter. The plugin does not combine unrelated subscriptions or verify cookie/key ownership automatically.

Cookies are login credentials. Keep them out of issues, chat and screenshots. The plugin stores the cookie only in the account's Magpie credential metadata and sends it only to the fixed HTTPS console endpoint, with redirects disabled and a ten-second timeout. It is never sent to inference. Select “暂不查询额度” on a same-label sign-in to clear it.

Usage reports remaining Credits, consumed/total Credits, percentage and reported expiry. Reset time is reported only when supplied. Credits are not tokens; no local token-count estimate is used. Missing sessions, expired cookies, incomplete responses and network failures produce actionable Chinese messages and never mark inference credentials as expired. This internal console API may change. The earlier API-key version passed a bounded live inference request; the new browser sign-in and real authenticated quota still require separate acceptance; automated tests use synthetic data grounded in the current console schema.

## Requests and storage

- Provider: `scnet-token-plan`.
- Base URL: `https://api.scnet.cn/api/llm/v1`.
- Inference: only `/chat/completions`, using the account's fresh Bearer key. Foreign destinations and redirects are refused.
- Magpie translates Chat, Responses and Anthropic client protocols. Streams and tool-call payloads pass through.
- Credentials: `$XDG_CONFIG_HOME/magpie/plugin-auth.json`, normally `~/.config/magpie/plugin-auth.json`.
- Saving a key locally does not prove SCNet authentication or model entitlement. A dedicated Token Plan key is required to use plan Credits.
- Magpie is the target host; dynamic prompts and password inputs use its extensions. Native OpenCode execution is unverified.

## Development

```sh
npm ci --ignore-scripts
npm test
npm pack --dry-run --ignore-scripts
# macOS only, with Magpie and Bun installed:
SCNET_TEST_BUN=/absolute/path/to/bun npm run test:magpie
SCNET_TEST_UI=1 SCNET_TEST_BUN=/absolute/path/to/bun npm run test:magpie
```

The harness isolates XDG paths and blocks existing home credentials/process access with macOS sandbox-exec. It tests the real CLI, selected-plan quota and twelve mock gateway cases: Chat/Anthropic/Responses × JSON/SSE × text/tool calls. UI mode starts a temporary browser-accessible Magpie with fake upstream data; Ctrl-C cleans it up. No Docker or real SCNet request is required.

See [quota source notes](docs/quota-api.md), [Magpie's plugin guide](https://usemagpie.ai/docs/plugins), and [SCNet's Token Plan documentation](https://www.scnet.cn/help/docs/mainsite/mass/plans/token-plan.html).

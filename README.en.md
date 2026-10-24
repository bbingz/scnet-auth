# SCNet Token Plan for Magpie

[简体中文](README.md)

An independent MIT-licensed plugin connecting your own SCNet Token Plan to Magpie. Version 0.3.3 defaults to browser sign-in, automatically importing account identity, an existing Token Plan key, subscription models and a session for Credits usage. It uses Node.js built-ins and the default browser; no extension, Playwright, browser download or build step.

![Account and quota in real Magpie](docs/account-quota.png)

*The screenshot uses an isolated Magpie instance and synthetic account/balance data.*

## Installation and setup

Search **scnet**, **超算** or **超算互联网** in Magpie's Plugins discovery. This is the **Unofficial, on GitHub** section, not a maintainer-reviewed registry listing. Magpie caches the GitHub list for about ten minutes; reopen discovery afterward if an old description remains. Direct installation:

```sh
magpie plugin add github:bbingz/scnet-auth
magpie plugin login scnet-token-plan
```

Choose **浏览器登录超算互联网（macOS 官网）**. Magpie opens SCNet's official desktop login page in the default browser. Sign in normally, or use its existing website session. If macOS asks for browser Keychain access, allow this attempt. A local confirmation page then shows the account and subscriptions; only confirmation saves the existing Token Plan key and quota session. The plugin never creates/resets keys or purchases plans.

Automatic import currently supports macOS Chrome (stable/Beta/Dev/Canary), Edge and Brave. Real account/key/model/quota reads were verified with Chrome Beta; other supported browser mappings have not had live-account acceptance. Safari, Windows, Linux and headless environments use the advanced manual method. Private/incognito browser sessions are not supported.

Only the default browser's last-used profile is accessed. Read-only SQL selects exact SCNet hosts and console paths before cookie data leaves the database. No other profiles are scanned; no whole database is copied; other sites, passwords and browsing history are not read. The macOS browser Keychain secret is used only in memory to decrypt SCNet cookies, then cleared. Refused OS access ends the attempt; no security settings are modified. This is scoped browser-session import, not a claim of official SCNet OAuth support.

The official login page collects credentials. The later loopback page only confirms the identity/subscription and collects no phone number, OTP or password. For a different account, switch accounts on SCNet and click the confirmation page's reload button. Identity is rechecked before saving. The listener binds only to `127.0.0.1`, requires a per-attempt capability and exact Origin/Host, rejects cross-site requests, and closes on success, cancellation or a five-minute timeout. Refreshing the confirmation page requires a new attempt. No extension or separate browser is launched.

## Remove a saved account

Version 0.3.4 adds **管理已保存账号（移除旧 KEY）** to the plugin's method picker. Open the SCNet provider, choose **Add another account**, then this management option. Select a record and confirm its removal. Cancel before confirmation changes nothing; after the completion message, Cancel closes management. Reopen the provider to refresh its list.

This flow does not add an account or open a browser. It can remove the first or last saved SCNet account on unmodified Magpie 0.1.1364. Only the selected local key/cookie record is removed; other records, including another slot carrying the same key, and the vendor's key remain intact. Removing the last account makes its models unavailable until another account is added. The original browser sign-in and confirmation flow are unchanged.

## Advanced manual setup

**手动配置 API Key（高级 / 无桌面环境）** retains account labels, Event/custom models and optional manual Cookie entry for machines without a desktop browser. Browser sign-in is the normal setup path.

## Optional Credits usage

Quota uses the SCNet console's internal endpoint, **not** the inference API key:

```text
https://www.scnet.cn/acx/charge/account/currentuser/tokenplan/list
```

In your browser, sign in to the [Token Plan console](https://www.scnet.cn/ui/console/index.html#/llm/token-plan), open Developer Tools → Network, refresh, and filter `tokenplan/list`. Copy the **Cookie request-header value** into the wizard's masked field. Do not include `Cookie:`, response `Set-Cookie` headers or a complete cURL command. Select the subscription matching the API key you will enter. The plugin does not combine unrelated subscriptions or verify cookie/key ownership automatically.

Cookies are login credentials. Keep them out of issues, chat and screenshots. The plugin stores the cookie only in the account's Magpie credential metadata and sends it only to the fixed HTTPS console endpoint, with redirects disabled and a ten-second timeout. It is never sent to inference. Select “暂不查询额度” on a same-label sign-in to clear it.

Usage reports remaining Credits, consumed/total Credits, percentage and reported expiry. Reset time is reported only when supplied. Credits are not tokens; no local token-count estimate is used. Missing sessions, expired cookies, incomplete responses and network failures produce actionable Chinese messages and never mark inference credentials as expired. This internal console API may change. The earlier API-key version passed a bounded live inference request; Chrome Beta session import and real quota were independently checked; automated tests use synthetic data grounded in the current console schema.

## Requests and storage

- Provider: `scnet-token-plan`.
- Base URL: `https://api.scnet.cn/api/llm/v1`.
- Inference: only `/chat/completions`, using the account's fresh Bearer key. Foreign destinations and redirects are refused.
- Magpie translates Chat, Responses and Anthropic client protocols. Streams and tool-call payloads pass through.
- Credentials: `$XDG_CONFIG_HOME/magpie/plugin-auth.json`, normally `~/.config/magpie/plugin-auth.json`.
- Saving a key locally does not prove SCNet authentication or model entitlement. A dedicated Token Plan key is required to use plan Credits.
- Magpie is the target host; dynamic prompts and masked secret inputs use its extensions. Native OpenCode execution is unverified.

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

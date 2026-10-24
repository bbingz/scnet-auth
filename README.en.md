# SCNet Token Plan for Magpie

[简体中文](README.md)

An independent MIT-licensed plugin connecting your own SCNet Token Plan to Magpie. Version 0.2.0 adds a Chinese setup wizard, recognizable account names, an embedded provider icon, and optional console-backed Credits usage. No runtime dependencies or build step.

![Account and quota in real Magpie](docs/account-quota.png)

*The screenshot uses an isolated Magpie instance and synthetic account/balance data.*

## Installation and setup

Search **scnet** in Magpie's Plugins discovery. This is the **Unofficial, on GitHub** section, not a maintainer-reviewed registry listing. Direct installation:

```sh
magpie plugin add github:bbingz/scnet-auth
magpie plugin login scnet-token-plan
```

The Chinese wizard asks for an account label, Event/custom models, optional quota connection, and a masked dedicated Token Plan key. Labels become `超算互联网 · <label>`. Use distinct labels for distinct accounts: Magpie replaces an existing account with the same label. Reuse the original label when updating models or the console session; use Magpie's account-name editor to change its display name.

The Event preset uses the exact ID `DeepSeek-V4.1-Flash-1017-Event`. Custom model IDs support English/Chinese commas and line breaks. Copy IDs from your plan console; the public model catalog does not establish account entitlements. Existing model limits are preserved; unspecified limits remain zero.

Update `scnet-auth` in Magpie's Plugins page. If the app keeps old code loaded, toggle this plugin off and on when idle. Accounts created by 0.1.0 still work but have no label/session metadata: add a named account with this wizard, verify its models, then remove the old anonymous `API key …` account.

## Optional Credits usage

Quota uses the SCNet console's internal endpoint, **not** the inference API key:

```text
https://www.scnet.cn/acx/charge/account/currentuser/tokenplan/list
```

In your browser, sign in to the [Token Plan console](https://www.scnet.cn/ui/console/index.html#/llm/token-plan), open Developer Tools → Network, refresh, and filter `tokenplan/list`. Copy the **Cookie request-header value** into the wizard's masked field. Do not include `Cookie:`, response `Set-Cookie` headers or a complete cURL command. Select the subscription matching the API key you will enter. The plugin does not combine unrelated subscriptions or verify cookie/key ownership automatically.

Cookies are login credentials. Keep them out of issues, chat and screenshots. The plugin stores the cookie only in the account's Magpie credential metadata and sends it only to the fixed HTTPS console endpoint, with redirects disabled and a ten-second timeout. It is never sent to inference. Select “暂不查询额度” on a same-label sign-in to clear it.

Usage reports remaining Credits, consumed/total Credits, percentage and reported expiry. Reset time is reported only when supplied. Credits are not tokens; no local token-count estimate is used. Missing sessions, expired cookies, incomplete responses and network failures produce actionable Chinese messages and never mark inference credentials as expired. This internal console API may change. Real authenticated quota and paid inference have not been acceptance-tested; automated tests use synthetic data grounded in the current console schema.

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
npm test
npm pack --dry-run --ignore-scripts
# macOS only, with Magpie and Bun installed:
SCNET_TEST_BUN=/absolute/path/to/bun npm run test:magpie
SCNET_TEST_UI=1 SCNET_TEST_BUN=/absolute/path/to/bun npm run test:magpie
```

The harness isolates XDG paths and blocks existing home credentials/process access with macOS sandbox-exec. It tests the real CLI, selected-plan quota and twelve mock gateway cases: Chat/Anthropic/Responses × JSON/SSE × text/tool calls. UI mode starts a temporary browser-accessible Magpie with fake upstream data; Ctrl-C cleans it up. No Docker or real SCNet request is required.

See [quota source notes](docs/quota-api.md), [Magpie's plugin guide](https://usemagpie.ai/docs/plugins), and [SCNet's Token Plan documentation](https://www.scnet.cn/help/docs/mainsite/mass/plans/token-plan.html).

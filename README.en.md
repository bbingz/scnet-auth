# SCNet Token Plan for Magpie

[简体中文](README.md)

Connects your [SCNet (超算互联网) Token Plan](https://www.scnet.cn/help/docs/mainsite/mass/plans/token-plan.html) to [Magpie](https://usemagpie.ai). Sign in on SCNet's website in your browser; the plugin picks up the account, its existing plan key, the plan's models and the Credits left, and every agent in Magpie can use those models.

- Browser sign-in on SCNet's official page that finishes by itself; no key or cookie to copy
- Accounts show as "超算互联网 · user · plan", with Credits left, a usage bar and the plan's end date
- Several accounts, and removal of old ones from within the plugin
- Streaming and tool calls; Magpie carries OpenAI Chat, Responses and Anthropic Messages clients to SCNet

An independent MIT-licensed community project, not an official SCNet or Magpie plugin.

<img src="docs/account-quota.png" width="600" alt="Account and quota in Magpie">

*Example screenshot of a manually configured demo account with demo balances. Browser sign-in names accounts "超算互联网 · user · plan".*

## Install

In Magpie open **Plugins → Discover**, search for `scnet`, `超算` or `超算互联网`, and install `scnet-auth` from the **Unofficial, on GitHub** section. That section lists plugins their authors publish on GitHub; Magpie has not reviewed them.

Or from the command line:

```sh
magpie plugin add github:bbingz/scnet-auth
```

**Updating:** open **Plugins → Installed** and press **Update** on `scnet-auth`. An update reloads the plugin host, so do it while no agent is mid-request.

## Sign in (recommended: browser, macOS)

1. Follow Magpie's prompt after installing, or open **Providers**:
   - first account: **Add a provider → From plugins → 超算互联网 · SCNet Token Plan**
   - more accounts: **Add another … account** on that provider
2. Choose **浏览器登录超算互联网（macOS 官网）**. Magpie opens SCNet's official login page in your default browser. Password, SMS and QR sign-in all work, and an existing website session is fine too.
3. When macOS asks for Keychain access, press **Allow**. The plugin needs it to decrypt the browser's SCNet session.
4. Wait. It usually finishes within a few seconds to half a minute (the browser writes its session to disk with a short delay); the account, models and Credits then appear in Magpie.

Notes:

- Supported: Chrome (including Beta/Dev/Canary), Edge and Brave on macOS, as the **default browser**, in a normal window. Private windows can't be read. Only Chrome Beta has been tried with a real account so far.
- Whatever SCNet account the browser is signed in to is the one connected. To use another, sign out or switch on SCNet first, then start the browser sign-in again.
- Signing in again with the same user and plan updates that account rather than adding a second one.
- With no session after five minutes the attempt times out and saves nothing.

On Windows, Linux, Safari or a machine without a desktop, use manual setup.

## Manual setup (Windows / Linux / Safari / headless)

Choose **手动配置 API Key（高级 / 无桌面环境）** and answer the wizard:

| Step | What to enter |
| --- | --- |
| Account label | e.g. 主账号, shown as "超算互联网 · 主账号". Signing in again with the same label updates that account. |
| Models | **Event** for the DeepSeek event plan (`DeepSeek-V4.1-Flash-1017-Event`); otherwise **custom**, with the exact model IDs from your console, separated by commas or new lines. |
| Credits | **连接额度查询** to show Credits, or **暂不查询额度** to skip. |
| Console cookie | Only when showing Credits; see below. |
| Plan | The plan your API key belongs to. |
| API key | The plan's own key from the Token Plan page (starts with `sk-tp-`). A pay-as-you-go key doesn't draw on plan Credits. |

<details>
<summary>Getting the console cookie (manual setup only)</summary>

1. Sign in to the [Token Plan console](https://www.scnet.cn/ui/console/index.html#/llm/token-plan).
2. Open developer tools (`⌥⌘I` on macOS, `F12` elsewhere) → **Network**.
3. Reload and filter for `tokenplan/list`.
4. Open that request and copy the **value** of its `Cookie` request header (no `Cookie:` prefix, not `Set-Cookie`, not a whole cURL command).
5. Paste it into the wizard's masked field.

A cookie is a login credential: keep it out of issues, chats and screenshots.

</details>

## Models

- Browser sign-in uses the models included in your plan.
- Pick `scnet-token-plan/<model ID>` in an agent, e.g. `scnet-token-plan/DeepSeek-V4.1-Flash-1017-Event`.
- Only your plan's models are listed, not SCNet's whole catalog.
- SCNet publishes no context or output limits, so none are set (shown as 0, unspecified).

## Credits

Each account shows Credits left, used/total, a percentage and the plan's end date.

- Credits are SCNet's per-model conversion, not tokens.
- Credits are read for the plan chosen at sign-in. If you **buy a new plan** after one runs out, sign in through the browser again to follow it.
- A failed Credits read (expired website session, network) only affects the display, never model requests. Signing in again restores it.

## Removing an account

1. Open the SCNet provider and press **Add another … account**.
2. Choose **管理已保存账号（移除旧 KEY）** and pick the account.
3. Check its name or key ending and press **确认移除这个账号**. Cancel before that removes nothing.
4. After 「已移除」, press Cancel to close, then reopen the provider.

Only Magpie's local record is removed; SCNet's key and your other accounts are untouched. The first and the last account can both be removed.

To remove every account, or the plugin itself:

```sh
magpie plugin logout scnet-token-plan
magpie plugin rm github:bbingz/scnet-auth
```

## Troubleshooting

**Not found in the market?** Search under **Plugins → Discover**; it is in the **Unofficial, on GitHub** section. Magpie caches the GitHub list for about ten minutes; if the section says some plugins couldn't be read, press **Try again**.

**Browser sign-in never finishes?** Make sure you signed in with the **default** browser, in a normal window, and that it is a supported one; allow the Keychain prompt. Manual setup always works.

**The wrong account was connected?** The plugin connects the account the browser is signed in to. Switch accounts on SCNet, sign in again, then remove the one you don't want.

**Credits say the console session expired?** SCNet's website session ended. Sign in through the browser again; model requests are unaffected.

**401 / 403 / 429 from requests?** Check whether the plan has ended or run out of Credits, and that the model ID is exact (case, date and `-Event` suffix). SCNet's errors reach Magpie unchanged so it can retry or switch accounts.

**Usage terms.** SCNet allows a Token Plan only for the subscriber's own interactive use in AI tools, not for scripts, app backends or batch calls, and may ban keys that break this. See [SCNet's terms](https://www.scnet.cn/help/docs/mainsite/mass/plans/token-plan.html).

## Privacy and security

- **Read:** only `scnet.cn` cookies from the default browser's last-used profile, filtered by host and path inside a read-only database query. No other profile is scanned, the cookie database isn't copied, and other sites, passwords and history aren't read. The Keychain secret lives only in memory for the attempt and is cleared after.
- **Stored:** the plan key, SCNet console session, plan ID and model list, in Magpie's credential file `~/.config/magpie/plugin-auth.json` (or `$XDG_CONFIG_HOME/magpie/plugin-auth.json`).
- **Sent:** model requests only to `https://api.scnet.cn/api/llm/v1/chat/completions`; the console session only to fixed `https://www.scnet.cn` query URLs. Neither follows redirects, and neither is sent to the other.
- **Never:** creates or resets keys, buys plans, or changes browser or system security settings.

## Technical details

| Item | Value |
| --- | --- |
| Provider ID | `scnet-token-plan` |
| Model base URL | `https://api.scnet.cn/api/llm/v1` |
| Credits endpoint | `https://www.scnet.cn/acx/charge/account/currentuser/tokenplan/list` (an internal console API that may change) |
| Runtime | Magpie's bundled Bun; Node.js ≥ 22.13 when run standalone |

See [docs/quota-api.md](docs/quota-api.md) for how sign-in and Credits work. The plugin uses Magpie's OpenCode plugin interface and hasn't been tried in OpenCode itself.

## Development

```sh
npm ci --ignore-scripts
npm test                                   # unit tests
npm pack --dry-run --ignore-scripts
# macOS with Magpie and Bun installed: real Magpie against a mock SCNet, isolated
SCNET_TEST_BUN=/absolute/path/to/bun npm run test:magpie
```

The integration run uses temporary directories, fake credentials and a macOS sandbox. It never reads or changes your Magpie accounts and never calls the real SCNet.

## References

- [SCNet Token Plan](https://www.scnet.cn/help/docs/mainsite/mass/plans/token-plan.html)
- [Magpie plugin guide](https://usemagpie.ai/docs/plugins)
- [Changelog](CHANGELOG.md)

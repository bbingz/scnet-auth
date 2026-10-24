# SCNet Token Plan for Magpie

An independent, MIT-licensed provider plugin for [Magpie](https://usemagpie.ai), using the OpenCode provider-plugin interface. It connects your own [SCNet Token Plan](https://www.scnet.cn/help/docs/mainsite/mass/plans/token-plan.html) to the agents behind Magpie.

- Dedicated Token Plan API-key sign-in; multiple accounts are managed by Magpie.
- Exact model IDs selected per account, including `DeepSeek-V4.1-Flash-1017-Event`.
- Streaming text, reasoning and tool-call payloads pass through unchanged.
- Magpie translates incoming OpenAI Chat Completions, OpenAI Responses and Anthropic Messages into SCNet Chat Completions.
- No runtime dependencies, build step, browser cookies or console scraping.

This is not an official SCNet or Magpie-maintained plugin.

## Install

In Magpie, open **Plugins → Discover** and search for **scnet**. GitHub discovery lists repositories with the `magpie-plugin` topic under **Unofficial, on GitHub**. GitHub indexing and Magpie's discovery cache can delay a new listing.

You can also install directly:

```sh
magpie plugin add github:bbingz/scnet-auth
magpie plugin login scnet-token-plan
```

The login asks for model IDs first, then the API key:

1. Copy the exact model IDs from **SCNet Console → Model Services → Token Plan**, separated by commas. For the DeepSeek Event plan, leave this blank to use `DeepSeek-V4.1-Flash-1017-Event`.
2. Paste the **dedicated Token Plan key** in the masked key field. A general pay-as-you-go key does not spend your plan's credits. The plugin does not enforce a prefix because SCNet plan variants can differ.
3. Select `scnet-token-plan/DeepSeek-V4.1-Flash-1017-Event`, or one of the IDs you entered, in your agent's Magpie model picker. Start a new agent session after changing its configuration.

For a regular plan, enter the IDs shown by your console, for example `DeepSeek-V4.1-Flash-1017,GLM-5.3`. Availability depends on your plan; the plugin does not verify entitlement during sign-in. It saves the key locally and the first real request checks it with SCNet.

The Event model's default spelling comes from the SCNet plan console observed on 2026-10-24. Keep its `-Event` suffix. It is different from the regular plan's similarly named model.

To change an account's model list, sign in again with the same key and the new IDs. Magpie matches the existing key. To remove the plugin:

```sh
magpie plugin logout scnet-token-plan
magpie plugin rm github:bbingz/scnet-auth
```

## Endpoints and credentials

| Item | Value |
| --- | --- |
| Provider ID | `scnet-token-plan` |
| Upstream API | OpenAI-compatible Chat Completions |
| Base URL | `https://api.scnet.cn/api/llm/v1` |
| Request destination | `https://api.scnet.cn/api/llm/v1/chat/completions` |
| Authentication | `Authorization: Bearer <your Token Plan key>` |
| Magpie sign-in storage | `~/.config/magpie/plugin-auth.json`, or `$XDG_CONFIG_HOME/magpie/plugin-auth.json` |

The key is read for the account making each request. Client authentication headers are replaced with that account's SCNet key. The plugin refuses other hosts, paths and HTTP redirects. It does not log keys or prompts. Magpie manages credential-file permissions and account selection.

SCNet also exposes Anthropic and Responses APIs. This plugin uses the Chat Completions upstream; Magpie supplies the other client protocols. It does not need three copies of each model.

## Model scope and limits

SCNet's public `/models` documentation describes a **platform-wide catalog**, not an account's Token Plan entitlements. The plugin therefore lists only the model IDs entered for that account. It does not silently add other paid models, fall back to a general API key, or equate successful local key storage with a successful SCNet sign-in.

Context and output limits are left unspecified (`0`) because the public plan page does not document them. For long sessions, confirm the actual model limits with SCNet and configure the provider model's `limit` in Magpie's plugin config. Existing configured limits are preserved. Unknown models are text/tool-call models by default; additional capabilities need explicit provider model configuration.

There is no quota hook: a documented Token Plan credits endpoint has not been established. Check credits and expiry in the SCNet console. The plugin does not fabricate a balance from a screenshot or from Magpie's local token count.

## Development and verification

```sh
npm test
npm pack --dry-run --ignore-scripts
```

Tests use Node.js 22+ and its built-in test runner. They cover account isolation, exact IDs, configured limits, header replacement, stream passthrough, tool-call payloads, upstream error responses, logout, destination checks and cancellation.

On macOS, with Magpie and Bun installed, run the isolated integration test:

```sh
npm run test:magpie
# If Bun is not on the child process's PATH:
SCNET_TEST_BUN=/absolute/path/to/bun npm run test:magpie
```

The script uses separate XDG config/cache directories and macOS `sandbox-exec` to deny native credential reads, writes under the user's home, and unrelated executables. It starts a temporary gateway on an unused loopback port and intercepts SCNet requests in a Bun preload. It tests actual plugin add/list/login/logout and 12 gateway combinations: three client protocols × JSON/SSE × text/tool calls. No real SCNet key, paid inference or Docker is used; the existing gateway is untouched. `SCNET_TEST_MAGPIE` can select a binary, and `SCNET_TEST_PLUGIN` can select a GitHub package spec to verify installation from the published repository.

Live SCNet inference and native OpenCode execution have not been verified. The OpenCode plugin shape is used, but this release's tested host is Magpie.

## Distribution

The repository is directly installable from GitHub; `package.json` and the executable entry point are at the root. The `magpie-plugin` topic enables discovery in Magpie's official app, in its **Unofficial, on GitHub** section. This does not mean Magpie maintainers reviewed or endorsed it.

The package metadata also supports npm discovery (`opencode` + `plugin`/`auth` keywords). An npm publication is separate from GitHub publication; use the GitHub install command unless an npm release has been announced.

## References

- [Magpie: writing plugins](https://usemagpie.ai/docs/plugins)
- [SCNet: Token Plan](https://www.scnet.cn/help/docs/mainsite/mass/plans/token-plan.html)
- [SCNet: Chat Completions API](https://www.scnet.cn/help/docs/mainsite/mass/api/chat.html)
- [SCNet: model query API](https://www.scnet.cn/help/docs/mainsite/mass/api/modulequery.html)

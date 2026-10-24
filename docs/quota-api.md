# Quota source and acceptance boundary

Checked on 2026-10-24. This adapter uses the SCNet console's internal read-only subscription endpoint; no public API stability guarantee is assumed.

- Current console entry: https://www.scnet.cn/ui/console/index.html
- Entry bundle: https://www.scnet.cn/ui/console/static/js/app.70224a61.js
- API declaration: https://www.scnet.cn/ui/console/static/js/16.a21f8a46.js contains `GET /charge/account/currentuser/tokenplan/list` under the `/acx` console API prefix.
- Plan rendering: https://www.scnet.cn/ui/console/static/js/68.c5b19b0a.js reads the total/used fields and expiration fields used by this adapter.
- Plan page: https://www.scnet.cn/ui/console/static/js/2938.13931614.js uses `resourceAccountId` to scope subscription usage.
- An anonymous read of https://www.scnet.cn/acx/charge/account/currentuser/tokenplan/list returned JSON business code `401` and a login-required message. A 401 alone does not establish an arbitrary endpoint's existence; the current frontend source establishes this path.

The initial discovery lead was [Ronnie-Young/dsh-scnet-plan](https://github.com/Ronnie-Young/dsh-scnet-plan/blob/main/docs/scnet-api.md). Endpoint and field assumptions were independently checked against SCNet's current public bundles. No code was copied from that implementation.

The expected envelope is `{code: "0", data: [...]}`. Other shapes fail explicitly. Each subscription is matched by `resourceAccountId`; absent or duplicate matches fail rather than selecting an unrelated subscription. Total fields follow the frontend's `totalAmount`, `All`, `planCredits`, `monthlyCredits`, `totalCredits` alternatives. Consumed fields follow `usedAmount`, `used`, `usedCredits`, `consumeCredits`, `consumedCredits`, `consume`, `usage`. Missing, negative, nonnumeric, empty and boolean values are not interpreted as zero.

Remaining Credits are `max(total - used, 0)`. Usage may exceed 100%. No price table, screenshot balance, public plan catalog or local token estimate supplies account balances. Unzoned console timestamps are interpreted as UTC+08:00. Expiry does not imply automatic renewal; reset time is emitted only if provided.

The optional console cookie is separate from the inference key. Quota requests have a fixed HTTPS origin/path, a ten-second deadline and `redirect: "error"`; they never carry the inference Authorization header. Upstream error bodies and network exception text are not shown or logged. Quota results use Magpie's `signIn: "kept"` to avoid clearing or expiring an unrelated inference authentication state.

## Official-page sign-in in 0.3.2

Magpie opens `https://www.scnet.cn/ui/acm/index.html#/login` in the default browser, with the Token Plan console as its destination. No plugin login form collects credentials. On macOS, the plugin identifies the default browser using NSWorkspace, selects only its `Local State` last-used profile, and reads that profile's Cookie database read-only. SQL restricts rows to exact SCNet hosts, console paths and unpartitioned cookies. Expired rows are discarded. No whole database is copied and other profiles/sites are not enumerated.

Chrome/Edge/Brave's Keychain entry supplies the decryption secret through the normal macOS authorization path. The password and derived AES key are transient; authorization failure stops the attempt without changing OS/browser security. Chromium `v10` AES-CBC decoding checks the schema-24 hostname hash. Unsupported formats fail explicitly. The Chromium format is documented in [Chromium's implementation](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/components/os_crypt/sync/os_crypt_mac.mm) and independently illustrated by [yt-dlp's browser-cookie reader](https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/cookies.py). No code dependency on either project is added.

A valid session is checked using these fixed SCNet endpoints:

- `GET /acx/user/users/current-user-info`: user ID/name.
- `GET /acx/charge/account/currentuser/tokenplan/list`: active subscriptions.
- `GET /acx/llm/api-key/token-plan/query`: existing Token Plan key; no create/reset request.
- `GET /acx/llm/api/package/overview?packageType=TokenPlan`, optionally `code`: exact subscription-to-model matching.

After discovery, the browser opens a temporary local account/subscription confirmation page. Only display fields reach it; credentials remain in the plugin until confirmation. Host/Origin/capability/JSON checks, bounded bodies, CSP and a five-minute deadline protect the loopback API. A final identity/key/plan check rejects stale confirmations after an account switch. Refresh explicitly rereads the selected profile. Success/cancel/timeout stops access and clears the derived key. Cookies enter Magpie account metadata only after confirmation and are sent only to fixed SCNet console URLs.

## Why earlier versions were replaced

Version 0.3.0 launched an isolated browser. Version 0.3.1 used a local SMS form backed by the official desktop client's SMS endpoints. Both were rejected for this workflow. Version 0.3.2 removes the SMS implementation and uses the user's requested official-page/current-browser flow. The local confirmation page is not a login page.

The tested arbitrary localhost CAS service was refused, while the official callback was accepted. Community WorkBuddy uses vendor login-state/token polling; JoyCode and Trae use vendor callbacks. SCNet's legacy WeChat QR polling endpoints are live, but their existence does not establish a generic desktop browser handoff. Version 0.3.2 therefore makes no claim of an official SCNet OAuth integration.

## Acceptance boundary

Real read-only checks on 2026-10-24: current default Chrome Beta session decrypted through macOS Keychain, SCNet identity and existing key accepted, one subscription's models resolved, and authenticated Credits returned. The quota reader was also exercised under Bun. Evidence contains only nonsecret outcomes and quota values, never the browser secret, cookies, API key or account identifier.

Synthetic coverage: exact-host/path/expiry/partition filtering, Chromium decryption and host binding, read-only database integrity, unsupported formats/platforms, denied/cancelled Keychain access, official-page URL, delayed website login, confirmation isolation, account switching, cancellation and timeout. Real isolated Magpie CLI verifies callback persistence, repeated login, selected-plan quota and twelve gateway protocol cases. Its fixture uses a separate encrypted browser database and fake OS responses; OS sandboxing denies actual home credentials and Keychain.

Not yet verified: fresh signed-out website login followed by cookie flush/import; real accounts on Edge/Brave/Chrome channels other than Beta; Safari, Windows and Linux automatic import (unsupported); long-term session lifetime; native OpenCode. Internal SCNet APIs/browser storage can change. No real inference is needed for this authentication change.

Local evidence: `.verification/official-browser-red.txt`, `.verification/browser-timestamp-red.txt`, `.verification/live-browser-session.json`, `.verification/live-browser-quota.json`, `.verification/tests-0.3.2.txt`, `.verification/magpie-0.3.2.txt`.

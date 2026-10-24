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

## Default-browser sign-in in 0.3.1

Magpie opens a temporary `127.0.0.1` page using its normal browser opener (`opened: false`). The page is the local community plugin's UI, explicitly not the official website. It uses SCNet's desktop SMS API to establish a new session. It does not reuse existing browser cookies or require an extension. The phone number and one-time code are transient request inputs, not persisted metadata. No password is collected.

Current official source: the anonymous endpoint `GET /acx/platform/config/client/client-download-url?os=mac` returned SCNet 3.2.1 and [its official DMG](https://dlcdn.scnet.cn/client/mac/SCNet-3.2.1-arm64.dmg) on 2026-10-24. The DMG was mounted read-only for source inspection and detached; the application was not installed or executed.

- `app.asar/dist-electron/main/index.js`, modules 69847/11204: form POST `/ac/api/auth/sendDesktopClientPhoneCode.action` with `phoneNum`, then `/ac/api/auth/loginDesktopClientByPhoneCode.action` with `messageCode`, `isSevenDaysValidity=true` and the challenge cookie.
- `app.asar/dist/static/js/async/3291.362a539e0a.js`: country prefix plus phone number, six-digit code UI and 60-second send cooldown. The native client also supports passwords; this plugin uses SMS only.
- Empty form requests to those two endpoints returned business code `1003` identifying missing `phoneNum` and `messageCode`, respectively, with a `jsessionid` cookie. No phone number, real code or SMS was submitted during this anonymous check. This establishes request shape, not successful authenticated login.

After login, the plugin reads these fixed console endpoints, independently established from current official console bundles:

- `GET /acx/user/users/current-user-info`: current user ID and `userName`.
- `GET /acx/charge/account/currentuser/tokenplan/list`: active subscriptions.
- `GET /acx/llm/api-key/token-plan/query`: existing Token Plan key. The plugin never calls create/reset endpoints.
- `GET /acx/llm/api/package/overview?packageType=TokenPlan`, optionally with `code`: match each subscription's `resourceId` to exactly its package `code` and `models`. Unmatched models require input.

The browser receives only display identity, subscription choices, expiry and models. The API key and SCNet session stay server-side until the confirmed credential is returned to Magpie. Each login has an independent cookie jar, capability, deadline and listener. Cookie domain/path/expiry are respected; requests use a fixed SCNet HTTPS origin, disabled redirects and bounded timeouts. SMS delivery happens only on a user click and is never retried automatically. Local API requests require the exact Host, Origin, per-attempt capability and JSON content type; request bodies are bounded, and the page has no external scripts or framing permission. The capability is removed from browser history after load.

Legacy/manual accounts are retained. Repeated sign-in for the same identity/subscription updates that browser account through Magpie's normal persistence. Cancellation or timeout returns no credential. Closing the tab leaves the attempt to expire; refreshing requires a new attempt.

## Why 0.3.0 was replaced

Version 0.3.0 launched an isolated Chrome/Edge context, which did not meet the user's current-browser requirement. Merely opening the official login URL in a normal browser does not transfer its authenticated session to a plugin. An anonymous CAS check rejected `http://127.0.0.1:49152/callback` with title **Application Not Authorized to Use CAS**, while accepting SCNet's own service callback. No third-party OAuth registration for scnet-auth was established. A browser extension was explicitly rejected; 0.3.1 instead uses the official desktop SMS API in a clearly labelled local page.

## Acceptance boundary

Verified with synthetic data: unit tests for callback persistence inputs, host/origin/capability checks, SMS cooldown, cookie scope, selection, cancellation, timeout and sanitized failures; real isolated Magpie CLI persistence, repeated login, selected-plan quota and twelve gateway protocol cases. Browser/render acceptance and exact-head CI are recorded in the release changelog.

Not verified: real authenticated SMS sign-in, real subscription/remaining Credits or session lifetime. The earlier API-key release passed a bounded live inference check; that does not validate SMS sign-in. Internal SCNet APIs may change. Session cookies and one-time codes must never be supplied in public issues or logs.

Local-only evidence: `.verification/desktop-login-anonymous.json`, `.verification/current-browser-auth.json`, extracted official source under `.verification/source/client/`, `.verification/current-browser-red.txt`, `.verification/tests-0.3.1.txt`, `.verification/magpie-0.3.1.txt`.

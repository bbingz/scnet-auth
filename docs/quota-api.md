# How sign-in and Credits work

SCNet has no public OAuth or quota API for third-party tools. This plugin reads the SCNet session your own browser already holds and uses the same console endpoints SCNet's web console calls. Those endpoints are internal and may change without notice. Endpoint paths and fields were checked against SCNet's public console bundles on 2026-10-24.

## Endpoints

All console requests go to `https://www.scnet.cn/acx` with the session cookie, a ten-second timeout and `redirect: "error"`. None carries the inference key.

| Request | Used for |
| --- | --- |
| `GET /user/users/current-user-info` | User ID and name |
| `GET /charge/account/currentuser/tokenplan/list` | The account's Token Plan subscriptions and their Credits |
| `GET /llm/api-key/token-plan/query` | The existing Token Plan key (read only; never created or reset) |
| `GET /llm/api/package/overview?packageType=TokenPlan` (optionally `&code=`) | The models of a plan, matched by its `resourceId` |

Responses are expected as `{code: "0", data: ...}`. A business code `401`/`403` means signed out; any other shape fails with a Chinese message, without echoing the upstream body. An anonymous request to these paths returns code `401` ("用户未登录").

Source of the paths and fields: the console bundle `https://www.scnet.cn/ui/console/static/js/16.a21f8a46.js` declares `GET /charge/account/currentuser/tokenplan/list` under `/acx`; `68.c5b19b0a.js` renders its total, used and expiry fields; `2938.13931614.js` scopes usage by `resourceAccountId`. The first lead came from [Ronnie-Young/dsh-scnet-plan](https://github.com/Ronnie-Young/dsh-scnet-plan/blob/main/docs/scnet-api.md); no code was taken from it.

## Browser sign-in (macOS)

1. Magpie opens `https://www.scnet.cn/ac/api/auth/loginSsoRedirect.action?originalUrl=<Token Plan console>` in the default browser. This is the desktop SSO entry SCNet's homepage uses; the user signs in there, and the plugin never sees a password or code.
2. The plugin asks macOS (NSWorkspace) for the default browser. Chrome (stable, Beta, Dev, Canary), Edge and Brave are supported; anything else gets a message pointing to manual setup.
3. It reads the browser's `Local State` for the last-used profile, and opens only that profile's `Cookies` database, read-only. The SQL selects only rows for `scnet.cn`, `.scnet.cn`, `www.scnet.cn` and `.www.scnet.cn`, on paths `/`, `/acx` or `/acx/`, that are unpartitioned; expired rows are dropped. Other profiles, sites and tables are never read and the database is never copied.
4. If those rows are encrypted, the browser's "Safe Storage" secret is read from the macOS Keychain through the normal authorization prompt. Values are decrypted as Chromium does on macOS (`v10`, AES-128-CBC with a PBKDF2 key, and the host hash check of schema 24+; see [Chromium](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/components/os_crypt/sync/os_crypt_mac.mm)). The secret and derived key stay in memory and are cleared when the attempt ends. A refused prompt ends the attempt.
5. Every 2.5 seconds the cookies are read again and checked against the profile endpoint until SCNet accepts them. Then the plan, key and models are read and the account is saved. There is no local page or listener. With no accepted session after five minutes, the attempt times out and nothing is saved.

### Choosing the plan

SCNet allows one Token Plan per account at a time and one key per subscription. The plugin keeps subscriptions that are enabled and not expired, and refuses duplicate IDs. Among those it prefers one with Credits left (an exhausted plan can sit beside a newly bought one), and then the one that ends first. If that plan's models can't be read, from the subscription row or from the catalog by its `resourceId`, sign-in fails and points to manual setup; models are never guessed.

### What is saved

The account is saved as an API-key sign-in with this metadata:

| Field | Value |
| --- | --- |
| `email` | `超算互联网 · <user> · <plan>`, the display name; Magpie uses it to update the same account on a later sign-in |
| `scnetUserId` | SCNet user ID |
| `models` | The plan's model IDs, comma-separated |
| `quota`, `consoleCookie`, `quotaPlan` | `console`, the SCNet session cookie, and the plan's `resourceAccountId` |

## Credits

`usage` reads `tokenplan/list` with the saved cookie and takes the one subscription whose `resourceAccountId` equals `quotaPlan`. A missing or duplicated match fails rather than showing another plan.

- Total is the first of `totalAmount`, `All`, `planCredits`, `monthlyCredits`, `totalCredits`; used is the first of `usedAmount`, `used`, `usedCredits`, `consumeCredits`, `consumedCredits`, `consume`, `usage`. Missing, negative, non-numeric or empty values are not read as zero.
- Remaining is `max(total - used, 0)`; usage can exceed 100%.
- Times without a zone are China Standard Time (UTC+08:00). The end date doesn't imply renewal; a reset time is shown only when SCNet returns one.
- An expired or disabled plan is reported as such, not as a balance.
- Every result carries `signIn: "kept"`, so a failed Credits read never marks the inference key as signed out.

Because `quotaPlan` is fixed at sign-in, a plan bought later is followed only after signing in again.

## Inference

The loader allows only `https://api.scnet.cn/api/llm/v1/chat/completions`. It drops any client `Authorization`, `x-api-key`, `cookie` and similar headers, sets the account's current key as a Bearer token, refuses redirects, and passes the body, stream, tool calls and cancellation through unchanged. Magpie translates Responses and Anthropic clients to Chat Completions.

## Why this approach

Earlier versions tried an isolated browser (0.3.0) and a local SMS form (0.3.1); both were rejected in favour of signing in on SCNet's own page in the user's browser (0.3.2). A local confirmation page after sign-in was removed in 0.3.5. SCNet's CAS refused a localhost callback service, and community plugins such as WorkBuddy rely on vendor login-state APIs that SCNet doesn't offer, so reading the browser's own session is the remaining way to finish sign-in without copying cookies.

## Not verified

- Real accounts on Edge, Brave and Chrome channels other than Beta
- A fresh website sign-in followed by the browser's cookie write, end to end with a real account (session import was verified with an already signed-in Chrome Beta)
- How long SCNet's website session lasts
- Running in OpenCode itself

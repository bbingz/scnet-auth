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

## Browser sign-in in 0.3.0

The default Magpie OAuth-style method opens an isolated installed Chrome/Edge window using `playwright-core`. This is a browser-session integration, not a claim that SCNet publishes an OAuth client registration or device authorization API. Passwords, SMS and CAPTCHA remain in the official website. Only cookies applicable to `https://www.scnet.cn/acx/` in this newly created context are read; existing browser profiles are not accessed. The browser closes on completion, cancellation or a five-minute deadline.

Current SCNet sources checked on 2026-10-24:

- Login entry: `https://www.scnet.cn/ui/acm/index.html`; route `/login` in `assets/index-BUxD3tNN.js`, with the official login component `assets/Login-Q7uT9Ak0.js`.
- `GET /acx/user/users/current-user-info`: current user ID and `userName`, declared in the console app bundle.
- `GET /acx/llm/api-key/token-plan/query`: read the existing Token Plan key. The declaration and response alternatives are in `68.c5b19b0a.js`; `2938.13931614.js` invokes it for the subscription page. The plugin never calls the separate create/reset endpoints.
- `GET /acx/llm/api/package/overview?packageType=TokenPlan`, optionally with `code`: resolve each subscription's `resourceId` to exactly the matching package `code` and its `models`. An anonymous read returned the expected catalog envelope. Unmatched models require user input; an unrelated catalog row is never selected.

The offline confirmation page receives only the display name, plan choices, expiry and model IDs. It never receives the Cookie or key. Only after the user confirms a listed subscription does the callback return an API credential plus session metadata to Magpie's normal credential storage. Legacy/manual accounts are preserved; the host updates an existing matching browser identity on repeated sign-in. The API-key method remains an advanced fallback.

Verified locally: 31 unit tests; real Magpie CLI manual and browser callback/storage integration, repeated sign-in and quota rendering; twelve mocked gateway protocol cases; a real Chrome confirmation page clicked through using synthetic data. **Not verified:** real authenticated browser sign-in, subscription response or cookie lifetime. A bounded live inference request passed on the earlier API-key version; it does not validate the new browser flow. Session cookies must never be supplied in public issues or logs.

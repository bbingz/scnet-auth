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

Verified locally: unit fixtures, real Magpie CLI login and quota rendering, and a real browser configuration flow against mocked SCNet responses. **Not verified:** a real authenticated subscription response, cookie lifetime, or live paid inference. The fixture screenshot in this repository is labeled as synthetic data. Session cookies must never be supplied in public issues or logs.

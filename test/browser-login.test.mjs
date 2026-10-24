import assert from "node:assert/strict"
import { test, afterEach, mock } from "node:test"
import { request as httpRequest } from "node:http"
import { SCNetAuthPlugin } from "../index.mjs"
import { accountInfo, startBrowserLogin } from "../browser-login.mjs"

const nativeFetch = globalThis.fetch
afterEach(() => mock.restoreAll())
const subscription = (extra = {}) => ({ resourceAccountId: "plan-a", resourceId: "event-code", name: "活动套餐", status: "enable", maxExpireTime: "2099-01-01 00:00:00", ...extra })
function api(overrides = {}) {
  return mock.method(globalThis, "fetch", async (url, init) => {
    if (new URL(url).hostname === "127.0.0.1") return nativeFetch(url, init)
    assert.equal(new URL(url).origin, "https://www.scnet.cn")
    assert.equal(init.redirect, "error")
    assert.equal(new Headers(init.headers).has("authorization"), false)
    assert.ok(init.signal instanceof AbortSignal)
    assert.equal(init.method, undefined)
    assert.equal(init.headers.Cookie, "session=fixture")
    const values = {
      "/user/users/current-user-info": { id: "u-1", userName: "测试账号" },
      "/charge/account/currentuser/tokenplan/list": [subscription()],
      "/llm/api-key/token-plan/query": { apiKey: "fixture-existing-key" },
      "/llm/api/package/overview?packageType=TokenPlan": [{ code: "event-code", models: "DeepSeek-V4.1-Flash-1017-Event" }],
      ...overrides,
    }
    const path = url.slice("https://www.scnet.cn/acx".length)
    assert.ok(Object.hasOwn(values, path), `Unexpected console request ${path}`)
    return Response.json({ code: "0", data: values[path] })
  })
}
const fixtureBrowser = () => ({ name: "Fixture Chrome", profile: "Default", readCookie: async () => "session=fixture", clear: mock.fn() })
async function session(t, options = {}) {
  let opened
  const page = new Promise(resolve => { opened = resolve })
  const browser = options.browserSession ?? fixtureBrowser()
  const auth = await startBrowserLogin({ browserSession: browser, openPage: opened, timeoutMs: 2000, pollMs: 5, ...options })
  const completion = auth.callback()
  const url = new URL(await page), origin = url.origin, token = url.hash.slice(1)
  const post = (path, body = {}, headers = {}) => nativeFetch(origin + path, {
    method: "POST", headers: { "content-type": "application/json", origin, "x-scnet-login": token, ...headers }, body: JSON.stringify(body),
  })
  t.after(async () => { await post("/cancel").catch(() => {}); await completion })
  return { auth, completion, browser, origin, token, post }
}

test("official sign-in keeps manual fallback and confirmation has no login form or credentials", async t => {
  api()
  const hooks = await SCNetAuthPlugin()
  assert.equal(hooks.auth.methods[0].type, "oauth")
  assert.equal(hooks.auth.methods[0].prompts, undefined)
  assert.equal(hooks.auth.methods[1].type, "api")
  const { auth, origin, token } = await session(t)
  assert.equal(new URL(auth.url).origin, "https://www.scnet.cn")
  assert.equal(auth.opened, false)
  assert.equal(auth.method, "auto")
  const page = await nativeFetch(origin)
  assert.match(page.headers.get("content-security-policy"), /frame-ancestors 'none'/)
  assert.equal(page.headers.get("cache-control"), "no-store")
  const html = await page.text()
  assert.doesNotMatch(html, /type="tel"|id="code"|id="phone"|fixture-existing-key|session=fixture/)
  assert.ok(!html.includes(token))
})

test("only the confirmed subscription is saved and local API never serves credentials", async t => {
  api({ "/charge/account/currentuser/tokenplan/list": [subscription(), subscription({ resourceAccountId: "plan-b" })] })
  const { completion, post, origin, browser } = await session(t)
  const data = await (await post("/account")).json()
  assert.equal(data.user, "测试账号")
  assert.equal(data.choices.length, 2)
  assert.doesNotMatch(JSON.stringify(data), /fixture-existing-key|session=/)
  assert.deepEqual(await (await post("/choose", { id: "plan-b" })).json(), { ok: true })
  const got = await completion
  assert.equal(got.type, "success")
  assert.equal(got.key, "fixture-existing-key")
  assert.equal(got.metadata.consoleCookie, "session=fixture")
  assert.equal(got.metadata.quotaPlan, "plan-b")
  assert.equal(got.metadata.scnetUserId, "u-1")
  assert.match(got.metadata.email, /超算互联网.*测试账号.*plan-b/)
  assert.equal(got.metadata.models, "DeepSeek-V4.1-Flash-1017-Event")
  assert.equal(browser.clear.mock.callCount(), 1)
  await assert.rejects(nativeFetch(origin))
})

test("foreign origins, forged hosts, absent capabilities and forms cannot read account data", async t => {
  api()
  const { post, origin } = await session(t)
  for (const headers of [{ origin: "https://evil.example" }, { origin: "null" }, { "x-scnet-login": "wrong" }, { "content-type": "text/plain" }, { "sec-fetch-site": "cross-site" }]) {
    assert.equal((await post("/account", {}, headers)).status, 403)
  }
  const forgedHost = await new Promise((resolve, reject) => {
    const req = httpRequest(origin, { headers: { host: "evil.example" } }, res => { res.resume(); resolve(res.statusCode) })
    req.on("error", reject); req.end()
  })
  assert.equal(forgedHost, 403)
  assert.equal((await nativeFetch(origin + "/account")).status, 404)
  for (const path of ["/send-code", "/login"]) assert.equal((await post(path)).status, 404)
})

test("unlisted subscriptions and missing models cannot be confirmed", async t => {
  api({ "/llm/api/package/overview?packageType=TokenPlan": [], "/llm/api/package/overview?packageType=TokenPlan&code=event-code": [] })
  const { completion, post } = await session(t)
  assert.equal((await post("/choose", { id: "foreign", models: "Valid-Model" })).status, 400)
  assert.equal((await post("/choose", { id: "plan-a", models: "bad model" })).status, 400)
  assert.equal((await post("/choose", { id: "plan-a", models: "Custom-Model，Other-Model" })).status, 200)
  assert.equal((await completion).metadata.models, "Custom-Model,Other-Model")
})

test("cancel and timeout stop browser access and clear its key without saving credentials", async t => {
  api()
  const { completion, post, browser } = await session(t)
  assert.equal((await post("/cancel")).status, 200)
  assert.match((await completion).error, /取消/)
  assert.equal(browser.clear.mock.callCount(), 1)
  const empty = fixtureBrowser(); empty.readCookie = async () => ""
  const expired = await startBrowserLogin({ browserSession: empty, timeoutMs: 20, pollMs: 5, openPage: () => assert.fail("Unexpected confirmation") })
  const result = await expired.callback()
  assert.match(result.error, /超时/)
  assert.equal(result.key, undefined)
  assert.equal(empty.clear.mock.callCount(), 1)
})

test("malformed and oversized confirmation input is rejected", async t => {
  api()
  const { origin, token, post } = await session(t)
  for (const body of [null, [], "not an object", { id: "x".repeat(17000) }]) assert.equal((await post("/choose", body)).status, 400)
  const invalid = await nativeFetch(origin + "/choose", { method: "POST", headers: { origin, "content-type": "application/json", "x-scnet-login": token }, body: "{" })
  assert.equal(invalid.status, 400)
})

test("signed-out cookies are polled until the official session is authenticated", async t => {
  const upstream = api(), stub = globalThis.fetch
  let attempts = 0
  mock.method(globalThis, "fetch", async (url, init) => {
    if (String(url).endsWith("/current-user-info") && ++attempts < 3) return Response.json({ code: "401" })
    return stub(url, init)
  })
  const { post } = await session(t)
  assert.equal(attempts, 3)
  assert.equal(upstream.mock.callCount(), 4)
  assert.equal((await (await post("/account")).json()).ready, true)
})

test("browser access failures are sanitized and cannot save an account", async () => {
  const browser = fixtureBrowser(); browser.readCookie = async () => { throw Error("private storage detail") }
  const auth = await startBrowserLogin({ browserSession: browser, timeoutMs: 200 })
  const result = await auth.callback()
  assert.equal(result.type, "failed")
  assert.doesNotMatch(JSON.stringify(result), /private/)
  assert.equal(browser.clear.mock.callCount(), 1)
})

test("switching the website identity blocks stale confirmation until it is reloaded", async t => {
  api()
  const { post, completion } = await session(t)
  mock.restoreAll()
  api({ "/user/users/current-user-info": { id: "u-2", userName: "第二账号" } })
  assert.equal((await post("/choose", { id: "plan-a" })).status, 400)
  assert.equal((await (await post("/account")).json()).user, "第二账号")
  assert.equal((await post("/choose", { id: "plan-a" })).status, 200)
  assert.equal((await completion).metadata.scnetUserId, "u-2")
})

test("cancel aborts a pending identity recheck and concurrent confirmations are rejected", async t => {
  api()
  const { post, completion } = await session(t)
  let started, aborted = false
  const ready = new Promise(resolve => { started = resolve })
  mock.method(globalThis, "fetch", async (_url, init) => new Promise((_resolve, reject) => {
    started()
    init.signal.addEventListener("abort", () => { aborted = true; reject(Error("private")) }, { once: true })
  }))
  const pending = post("/choose", { id: "plan-a" }).catch(() => {})
  await ready
  assert.equal((await post("/choose", { id: "plan-a" })).status, 409)
  await post("/cancel")
  await pending
  assert.equal((await completion).type, "failed")
  assert.equal(aborted, true)
})

test("missing, masked or invalid keys never cause automatic key creation/reset", async () => {
  for (const value of [null, {}, { apiKey: "***masked***" }, "", "bad\nkey"]) {
    api({ "/llm/api-key/token-plan/query": value })
    await assert.rejects(accountInfo("session=fixture", new AbortController().signal), /不会创建或重置/)
    mock.restoreAll()
  }
})

test("expired plans, duplicate subscription IDs and missing identity fail explicitly", async () => {
  for (const overrides of [
    { "/charge/account/currentuser/tokenplan/list": [] },
    { "/charge/account/currentuser/tokenplan/list": [subscription({ maxExpireTime: "2000-01-01 00:00:00" })] },
    { "/charge/account/currentuser/tokenplan/list": [subscription(), subscription()] },
    { "/user/users/current-user-info": {} },
  ]) {
    api(overrides)
    await assert.rejects(accountInfo("session=fixture", new AbortController().signal))
    mock.restoreAll()
  }
})

test("model discovery matches the selected resource code and never uses another plan's models", async () => {
  api({
    "/llm/api/package/overview?packageType=TokenPlan": [{ code: "unrelated", models: "Wrong-Model" }],
    "/llm/api/package/overview?packageType=TokenPlan&code=event-code": [{ code: "event-code", models: "DeepSeek-V4.1-Flash-1017-Event" }],
  })
  const info = await accountInfo("session=fixture", new AbortController().signal)
  assert.equal(info.choices[0].models, "DeepSeek-V4.1-Flash-1017-Event")
})


test("upstream account errors never disclose cookie or response details", async () => {
  mock.method(globalThis, "fetch", async () => { throw Error("secret cookie value") })
  await assert.rejects(accountInfo("session=fixture", new AbortController().signal), error => !/secret|fixture/.test(error.message))
})

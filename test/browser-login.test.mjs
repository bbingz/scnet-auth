import assert from "node:assert/strict"
import { test, afterEach, mock } from "node:test"
import { request as httpRequest } from "node:http"
import { SCNetAuthPlugin } from "../index.mjs"
import { accountInfo, startBrowserLogin } from "../browser-login.mjs"
import { createSMSLogin } from "../sms-login.mjs"

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
    if (url.endsWith("/sendDesktopClientPhoneCode.action")) {
      assert.equal(init.method, "POST")
      assert.equal(init.body.get("phoneNum"), "+8613800000000")
      assert.equal(init.headers.Cookie, "")
      return Response.json({ code: "0" }, { headers: { "set-cookie": "session=challenge; Path=/; Secure; HttpOnly" } })
    }
    if (url.endsWith("/loginDesktopClientByPhoneCode.action")) {
      assert.equal(init.method, "POST")
      assert.equal(init.body.get("messageCode"), "123456")
      assert.equal(init.body.get("isSevenDaysValidity"), "true")
      assert.equal(init.headers.Cookie, "session=challenge")
      return Response.json({ code: "0" }, { headers: { "set-cookie": "session=fixture; Path=/; Secure; HttpOnly" } })
    }
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
async function session(t, options) {
  const auth = await startBrowserLogin(options)
  const url = new URL(auth.url), origin = url.origin, token = url.hash.slice(1)
  const post = (path, body = {}, headers = {}) => nativeFetch(origin + path, {
    method: "POST", headers: { "content-type": "application/json", origin, "x-scnet-login": token, ...headers }, body: JSON.stringify(body),
  })
  t.after(async () => { await post("/cancel").catch(() => {}); await auth.callback() })
  return { auth, origin, token, post }
}
async function signIn(post) {
  assert.equal((await post("/send-code", { phone: "13800000000" })).status, 200)
  const response = await post("/login", { code: "123456" })
  assert.equal(response.status, 200)
  return response.json()
}

test("default sign-in uses the host browser opener and keeps the manual fallback", async t => {
  const hooks = await SCNetAuthPlugin()
  assert.equal(hooks.auth.methods[0].type, "oauth")
  assert.equal(hooks.auth.methods[0].prompts, undefined)
  assert.equal(hooks.auth.methods[1].type, "api")
  const { auth, origin, token } = await session(t)
  assert.equal(auth.opened, false)
  assert.equal(auth.method, "auto")
  const page = await nativeFetch(origin)
  assert.match(page.headers.get("content-security-policy"), /frame-ancestors 'none'/)
  assert.equal(page.headers.get("cache-control"), "no-store")
  const html = await page.text()
  assert.match(html, /并非超算互联网官网/)
  assert.ok(!html.includes(token))
})

test("SMS login imports only the confirmed plan and never serves credentials", async t => {
  api({ "/charge/account/currentuser/tokenplan/list": [subscription(), subscription({ resourceAccountId: "plan-b" })] })
  const { auth, post, origin } = await session(t)
  const data = await signIn(post)
  assert.equal(data.user, "测试账号")
  assert.equal(data.choices.length, 2)
  assert.doesNotMatch(JSON.stringify(data), /fixture-existing-key|session=|13800000000|123456/)
  const chosen = await post("/choose", { id: "plan-b" })
  assert.deepEqual(await chosen.json(), { ok: true })
  const got = await auth.callback()
  assert.equal(got.type, "success")
  assert.equal(got.key, "fixture-existing-key")
  assert.equal(got.metadata.consoleCookie, "session=fixture")
  assert.equal(got.metadata.quotaPlan, "plan-b")
  assert.equal(got.metadata.scnetUserId, "u-1")
  assert.match(got.metadata.email, /超算互联网.*测试账号.*plan-b/)
  assert.equal(got.metadata.models, "DeepSeek-V4.1-Flash-1017-Event")
  assert.doesNotMatch(JSON.stringify(got), /13800000000|123456/)
  await assert.rejects(nativeFetch(origin))
})

test("foreign origins, forged hosts, missing capabilities and form posts cannot send SMS", async t => {
  const sent = api()
  const { post, origin } = await session(t)
  for (const headers of [{ origin: "https://evil.example" }, { origin: "null" }, { "x-scnet-login": "wrong" }, { "content-type": "text/plain" }, { "sec-fetch-site": "cross-site" }]) {
    const response = await post("/send-code", { phone: "13800000000" }, headers)
    assert.equal(response.status, 403, JSON.stringify(headers))
  }
  const forgedHost = await new Promise((resolve, reject) => {
    const req = httpRequest(origin, { headers: { host: "evil.example" } }, res => { res.resume(); resolve(res.statusCode) })
    req.on("error", reject); req.end()
  })
  assert.equal(forgedHost, 403)
  assert.equal((await nativeFetch(origin + "/send-code")).status, 404)
  assert.equal(sent.mock.callCount(), 0)
})

test("SMS sends require a valid phone and code; a second send is throttled", async t => {
  const sent = api()
  const { post } = await session(t)
  assert.equal((await post("/login", { code: "123456" })).status, 400)
  assert.equal((await post("/send-code", { phone: "wrong" })).status, 400)
  assert.equal(sent.mock.callCount(), 0)
  assert.equal((await post("/send-code", { phone: "13800000000" })).status, 200)
  assert.equal((await post("/send-code", { phone: "13800000000" })).status, 400)
  assert.equal((await post("/login", { code: "abc" })).status, 400)
  assert.equal(sent.mock.callCount(), 1)
})

test("unlisted subscriptions and missing models cannot be confirmed", async t => {
  api({ "/llm/api/package/overview?packageType=TokenPlan": [], "/llm/api/package/overview?packageType=TokenPlan&code=event-code": [] })
  const { auth, post } = await session(t)
  assert.equal((await post("/choose", { id: "plan-a" })).status, 400)
  await signIn(post)
  assert.equal((await post("/choose", { id: "foreign", models: "Valid-Model" })).status, 400)
  assert.equal((await post("/choose", { id: "plan-a", models: "bad model" })).status, 400)
  assert.equal((await post("/choose", { id: "plan-a", models: "Custom-Model，Other-Model" })).status, 200)
  assert.equal((await auth.callback()).metadata.models, "Custom-Model,Other-Model")
})

test("cancel and timeout close the listener without saving credentials", async t => {
  const { auth, post } = await session(t)
  assert.equal((await post("/cancel")).status, 200)
  assert.match((await auth.callback()).error, /取消/)
  const expired = await startBrowserLogin({ timeoutMs: 20 })
  const result = await expired.callback()
  assert.match(result.error, /超时/)
  assert.equal(result.key, undefined)
  await assert.rejects(nativeFetch(expired.url))
})

test("malformed and oversized input is rejected before any upstream request", async t => {
  const sent = api()
  const { origin, token, post } = await session(t)
  for (const body of [null, [], "not an object", { phone: "x".repeat(17000) }]) assert.equal((await post("/send-code", body)).status, 400)
  const invalid = await nativeFetch(origin + "/send-code", { method: "POST", headers: { origin, "content-type": "application/json", "x-scnet-login": token }, body: "{" })
  assert.equal(invalid.status, 400)
  assert.equal(sent.mock.callCount(), 0)
})

test("SMS failure is sanitized and never retried automatically", async t => {
  const sent = mock.method(globalThis, "fetch", async () => { throw Error("secret transport detail") })
  const { post } = await session(t)
  const response = await post("/send-code", { phone: "13800000000" })
  assert.equal(response.status, 400)
  assert.doesNotMatch(await response.text(), /secret|13800000000/)
  assert.equal(sent.mock.callCount(), 1)
})

test("concurrent SMS requests are blocked and cancellation aborts the pending request", async t => {
  let started, aborted = false
  const ready = new Promise(resolve => { started = resolve })
  const sent = mock.method(globalThis, "fetch", async (_url, init) => new Promise((_resolve, reject) => {
    started()
    init.signal.addEventListener("abort", () => { aborted = true; reject(Error("private cancellation detail")) }, { once: true })
  }))
  const { auth, post } = await session(t)
  const pending = post("/send-code", { phone: "13800000000" }).catch(() => {})
  await ready
  assert.equal((await post("/send-code", { phone: "13800000000" })).status, 409)
  assert.equal((await post("/cancel")).status, 200)
  const result = await auth.callback()
  await pending
  assert.equal(aborted, true)
  assert.equal(sent.mock.callCount(), 1)
  assert.equal(result.type, "failed")
  assert.equal(result.key, undefined)
})

test("SMS cookies stay within their domain, path and expiry scope", async () => {
  let step = 0
  mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(new URL(url).origin, "https://www.scnet.cn")
    assert.equal(init.redirect, "error")
    const headers = new Headers()
    if (!step++) {
      for (const cookie of ["root=ok; Path=/; Secure; HttpOnly", "challenge=only-auth; Path=/ac/api/auth", "expired=no; Path=/; Max-Age=0", "foreign=no; Domain=evil.example; Path=/", "wrongpath=no; Path=/admin"]) headers.append("set-cookie", cookie)
    } else {
      assert.equal(init.headers.Cookie, "challenge=only-auth; root=ok")
      headers.append("set-cookie", "root=updated; Path=/; Domain=.scnet.cn")
    }
    return Response.json({ code: "0" }, { headers })
  })
  const sms = createSMSLogin(new AbortController().signal)
  await sms.sendCode("13800000000")
  assert.equal(await sms.login("123456"), "root=updated")
  sms.clear()
  await assert.rejects(sms.login("123456"), /先获取/)
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

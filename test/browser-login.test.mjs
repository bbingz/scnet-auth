import assert from "node:assert/strict"
import { test, afterEach, mock } from "node:test"
import { SCNetAuthPlugin } from "../index.mjs"
import { accountInfo, startBrowserLogin } from "../browser-login.mjs"

afterEach(() => mock.restoreAll())
const subscription = (extra = {}) => ({ resourceAccountId: "plan-a", resourceId: "event-code", name: "活动套餐", status: "enable", maxExpireTime: "2099-01-01 00:00:00", ...extra })
function api(overrides = {}) {
  return mock.method(globalThis, "fetch", async (url, init) => {
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
    assert.ok(values[path] !== undefined, `Unexpected console request ${path}`)
    return Response.json({ code: "0", data: values[path] })
  })
}
const fixtureBrowser = () => ({ name: "Fixture Chrome", profile: "Default", readCookie: async () => "session=fixture", clear: mock.fn() })
const login = (options = {}) => startBrowserLogin({ browserSession: fixtureBrowser(), timeoutMs: 2000, pollMs: 5, ...options })

test("official sign-in completes by itself and keeps the manual fallback", async () => {
  api()
  const hooks = await SCNetAuthPlugin()
  assert.equal(hooks.auth.methods[0].type, "oauth")
  assert.equal(hooks.auth.methods[0].prompts, undefined)
  assert.equal(hooks.auth.methods[1].type, "api")
  const browser = fixtureBrowser()
  const auth = await login({ browserSession: browser })
  assert.equal(new URL(auth.url).origin, "https://www.scnet.cn")
  assert.equal(auth.opened, false)
  assert.equal(auth.method, "auto")
  assert.match(auth.instructions, /自动/)
  const got = await auth.callback()
  assert.deepEqual(got, { type: "success", key: "fixture-existing-key", metadata: {
    email: "超算互联网 · 测试账号 · 活动套餐", scnetUserId: "u-1", models: "DeepSeek-V4.1-Flash-1017-Event",
    plan: "custom", quota: "console", consoleCookie: "session=fixture", quotaPlan: "plan-a",
  } })
  assert.equal(browser.clear.mock.callCount(), 1)
})

test("an exhausted plan beside the next one bought gives way to the plan with Credits left", async () => {
  api({ "/charge/account/currentuser/tokenplan/list": [
    subscription({ resourceAccountId: "used-up", totalAmount: "60000", usedAmount: "60000", maxExpireTime: "2098-01-01 00:00:00" }),
    subscription({ resourceAccountId: "renewal", totalAmount: "240000", usedAmount: "0", maxExpireTime: "2099-06-01 00:00:00" }),
    subscription({ resourceAccountId: "next", name: "标准版", totalAmount: "240000", usedAmount: "12", maxExpireTime: "2099-01-01 00:00:00" }),
  ] })
  const got = await (await login()).callback()
  assert.equal(got.metadata.quotaPlan, "next")
  assert.equal(got.metadata.email, "超算互联网 · 测试账号 · 标准版")
})

test("models listed on the subscription are used without the catalog", async () => {
  const upstream = api({ "/charge/account/currentuser/tokenplan/list": [subscription({ models: "GLM-5.3，Kimi-K3, GLM-5.3" })] })
  assert.equal((await (await login()).callback()).metadata.models, "GLM-5.3,Kimi-K3")
  assert.equal(upstream.mock.calls.some(call => String(call.arguments[0]).includes("/package/overview")), false)
})

test("a plan whose models cannot be read fails without saving an account", async () => {
  api({ "/llm/api/package/overview?packageType=TokenPlan": [], "/llm/api/package/overview?packageType=TokenPlan&code=event-code": [] })
  const browser = fixtureBrowser()
  const got = await (await login({ browserSession: browser })).callback()
  assert.equal(got.type, "failed")
  assert.match(got.error, /模型/)
  assert.equal(got.key, undefined)
  assert.equal(browser.clear.mock.callCount(), 1)
})

test("timeout stops browser access and clears its key without saving credentials", async () => {
  const empty = fixtureBrowser(); empty.readCookie = async () => ""
  const result = await (await login({ browserSession: empty, timeoutMs: 20 })).callback()
  assert.match(result.error, /超时/)
  assert.equal(result.key, undefined)
  assert.equal(empty.clear.mock.callCount(), 1)
})

test("signed-out cookies are polled until the official session is authenticated", async () => {
  const upstream = api(), stub = globalThis.fetch
  let attempts = 0
  mock.method(globalThis, "fetch", async (url, init) => {
    if (String(url).endsWith("/current-user-info") && ++attempts < 3) return Response.json({ code: "401" })
    return stub(url, init)
  })
  const got = await (await login()).callback()
  assert.equal(got.type, "success")
  assert.equal(attempts, 3)
  assert.equal(upstream.mock.callCount(), 4)
})

test("browser access failures are sanitized and cannot save an account", async () => {
  const browser = fixtureBrowser(); browser.readCookie = async () => { throw Error("private storage detail") }
  const result = await (await login({ browserSession: browser, timeoutMs: 200 })).callback()
  assert.equal(result.type, "failed")
  assert.doesNotMatch(JSON.stringify(result), /private/)
  assert.equal(browser.clear.mock.callCount(), 1)
})

test("timeout aborts a pending account read", async () => {
  let aborted = false
  mock.method(globalThis, "fetch", async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => { aborted = true; reject(Error("private")) }, { once: true })
  }))
  const result = await (await login({ timeoutMs: 50 })).callback()
  assert.match(result.error, /超时/)
  assert.equal(aborted, true)
})

test("missing, masked or invalid keys never cause automatic key creation/reset", async () => {
  for (const value of [null, {}, { apiKey: "***masked***" }, "", "bad\nkey"]) {
    api({ "/llm/api-key/token-plan/query": value })
    await assert.rejects(accountInfo("session=fixture", new AbortController().signal), /不会创建或重置/)
    mock.restoreAll()
  }
})

test("expired or disabled plans, duplicate subscription IDs and missing identity fail explicitly", async () => {
  for (const overrides of [
    { "/charge/account/currentuser/tokenplan/list": [] },
    { "/charge/account/currentuser/tokenplan/list": [subscription({ maxExpireTime: "2000-01-01 00:00:00" })] },
    { "/charge/account/currentuser/tokenplan/list": [subscription({ status: "disable" })] },
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
  assert.equal(info.plan.models, "DeepSeek-V4.1-Flash-1017-Event")
})


test("upstream account errors never disclose cookie or response details", async () => {
  mock.method(globalThis, "fetch", async () => { throw Error("secret cookie value") })
  await assert.rejects(accountInfo("session=fixture", new AbortController().signal), error => !/secret|fixture/.test(error.message))
})

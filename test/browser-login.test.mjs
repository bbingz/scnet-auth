import assert from "node:assert/strict"
import { test, afterEach, mock } from "node:test"
import { EventEmitter } from "node:events"
import { SCNetAuthPlugin } from "../index.mjs"
import { accountInfo, startBrowserLogin } from "../browser-login.mjs"

afterEach(() => mock.restoreAll())

test("the default sign-in opens SCNet in a browser without asking for cookies or keys", async () => {
  const hooks = await SCNetAuthPlugin()
  const method = hooks.auth.methods[0]
  assert.equal(method.type, "oauth")
  assert.match(method.label, /浏览器登录/)
  assert.equal(method.prompts, undefined)
  assert.equal(hooks.auth.methods[1].type, "api")
})

const subscription = (extra = {}) => ({ resourceAccountId: "plan-a", resourceId: "event-code", name: "活动套餐", status: "enable", maxExpireTime: "2099-01-01 00:00:00", ...extra })
function api(overrides = {}) {
  return mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(new URL(url).origin, "https://www.scnet.cn")
    assert.equal(init.redirect, "error")
    assert.equal(init.method, undefined)
    assert.equal(init.headers.Cookie, "session=fixture")
    assert.equal(new Headers(init.headers).has("authorization"), false)
    assert.ok(init.signal instanceof AbortSignal)
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

function fakeBrowser({ choose = true, cookie = "fixture", navigationFails = false } = {}) {
  const browser = new EventEmitter()
  const state = { closed: 0, choices: [], cookieURLs: [], html: "", pages: 0 }
  let pick
  browser.newContext = async () => ({
    cookies: async url => { state.cookieURLs.push(url); return cookie ? [{ name: "session", value: cookie }] : [] },
    newPage: async () => {
      state.pages++
      return {
        goto: async url => { state.url = url; if (navigationFails) throw Error("private navigation detail") },
        route: async () => {},
        exposeFunction: async (name, fn) => { assert.equal(name, "scnetChoose"); pick = fn; state.pick = fn },
        setContent: async html => { state.html = html },
        evaluate: async (_fn, data) => { state.visible = data },
        bringToFront: async () => { if (choose) state.choice = await pick(state.visible.choices.at(-1).id, "") },
      }
    },
  })
  browser.close = async () => { state.closed++; browser.emit("disconnected") }
  return { browser, state }
}

test("browser login imports the chosen subscription and never puts credentials in its confirmation page", async () => {
  api({ "/charge/account/currentuser/tokenplan/list": [subscription(), subscription({ resourceAccountId: "plan-b" })] })
  const { browser, state } = fakeBrowser()
  const auth = await startBrowserLogin({ launch: async () => browser })
  assert.equal(auth.opened, true)
  assert.equal(auth.method, "auto")
  assert.match(state.url, /^https:\/\/www\.scnet\.cn\/ui\/acm\/index\.html#\/login/)
  const got = await auth.callback()
  assert.equal(got.type, "success")
  assert.equal(got.key, "fixture-existing-key")
  assert.equal(got.metadata.quotaPlan, "plan-b")
  assert.equal(got.metadata.consoleCookie, "session=fixture")
  assert.equal(got.metadata.models, "DeepSeek-V4.1-Flash-1017-Event")
  assert.match(got.metadata.email, /超算互联网.*测试账号/)
  assert.equal(got.metadata.scnetUserId, "u-1")
  assert.ok(state.cookieURLs.every(url => url === "https://www.scnet.cn/acx/"))
  assert.doesNotMatch(state.html + JSON.stringify(state.visible), /fixture-existing-key|session=fixture/)
  assert.equal(state.closed, 1)
})

test("browser closure cancels login and a deadline cleans up a waiting window", async () => {
  for (const closeEarly of [true, false]) {
    const { browser, state } = fakeBrowser({ cookie: "" })
    const auth = await startBrowserLogin({ launch: async () => browser, timeoutMs: 30, pollMs: 2 })
    if (closeEarly) browser.emit("disconnected")
    const got = await auth.callback()
    assert.equal(got.type, "failed")
    assert.match(got.error, closeEarly ? /取消/ : /超时/)
    assert.equal(got.key, undefined)
    assert.equal(state.closed, 1)
  }
})

test("failed navigation closes the isolated browser without leaking errors", async () => {
  const { browser, state } = fakeBrowser({ navigationFails: true })
  await assert.rejects(startBrowserLogin({ launch: async () => browser }), /无法加载/)
  assert.equal(state.closed, 1)
  await assert.rejects(startBrowserLogin({ launch: async () => { throw Error("secret path") } }), error => !error.message.includes("secret"))
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

test("unknown models require exact user input and unlisted subscription choices are rejected", async () => {
  api({ "/llm/api/package/overview?packageType=TokenPlan": [], "/llm/api/package/overview?packageType=TokenPlan&code=event-code": [] })
  const { browser, state } = fakeBrowser({ choose: false })
  const auth = await startBrowserLogin({ launch: async () => browser })
  while (!state.pick) await new Promise(resolve => setTimeout(resolve, 1))
  assert.ok((await state.pick("foreign", "Valid-Model")).error)
  assert.ok((await state.pick("plan-a", "bad model")).error)
  assert.deepEqual(await state.pick("plan-a", "Custom-Model， Other-Model"), { ok: true })
  const got = await auth.callback()
  assert.equal(got.metadata.models, "Custom-Model,Other-Model")
})

test("an anonymous cookie waits for login; server errors stay sanitized", async () => {
  const { browser, state } = fakeBrowser({ choose: false })
  const sent = mock.method(globalThis, "fetch", async () => Response.json({ code: "401", msg: "private upstream details" }))
  const auth = await startBrowserLogin({ launch: async () => browser, timeoutMs: 40, pollMs: 2 })
  const got = await auth.callback()
  assert.match(got.error, /超时/)
  assert.ok(sent.mock.callCount() > 1)
  assert.equal(state.pages, 1)
  mock.restoreAll()
  mock.method(globalThis, "fetch", async () => { throw Error("secret cookie value") })
  await assert.rejects(accountInfo("session=fixture", new AbortController().signal), error => !/secret|fixture/.test(error.message))
})

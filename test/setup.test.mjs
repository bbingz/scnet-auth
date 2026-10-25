import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test, afterEach, mock } from "node:test"
import { SCNetAuthPlugin } from "../index.mjs"

const hooks = await SCNetAuthPlugin()
const method = hooks.auth.methods[1]
const MODEL = "DeepSeek-V4.1-Flash-1017-Event"
const auth = (metadata = {}) => ({ type: "api", key: "fixture-key", metadata })
const row = (extra = {}) => ({ resourceAccountId: "plan-1", name: "DeepSeek 活动套餐", status: "enable", totalAmount: "60000", usedAmount: "1234.5", maxExpireTime: "2099-11-24 23:59:59", ...extra })
const reply = (data) => mock.method(globalThis, "fetch", async () => Response.json({ code: "0", data }))
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
afterEach(() => mock.restoreAll())

test("package.json gives the market card SCNet's mark as Magpie accepts it", () => {
  // Magpie keeps magpie.icon only as an https URL or a data:image URI, and stores at most 1 MB.
  const [head, data] = String(pkg.magpie?.icon).split(",")
  assert.equal(head, "data:image/png;base64")
  const png = Buffer.from(data, "base64")
  assert.equal(png.toString("base64"), data)
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  assert.ok(png.length < 1 << 20)
})

test("Chinese setup identifies the provider and account without using the key as its name", async () => {
  const config = {}
  await hooks.config(config)
  assert.match(config.provider["scnet-token-plan"].name, /超算互联网/)
  assert.equal(hooks.auth.icon, pkg.magpie.icon)
  assert.equal((await method.ask({})).key, "label")
  assert.match(method.prompts.find(p => p.key === "label").validate(""), /账号/)
  const saved = await method.authorize({ label: "主账号", plan: "event", quota: "skip" })
  assert.equal(saved.type, "success")
  assert.equal(saved.metadata.email, "超算互联网 · 主账号")
  assert.equal(saved.key, undefined)
})

test("setup shows custom models only when selected and accepts Chinese commas", async () => {
  assert.equal((await method.ask({ label: "测试", plan: "event" })).key, "quota")
  assert.equal((await method.ask({ label: "测试", plan: "custom" })).key, "models")
  assert.equal(await method.ask({ label: "测试", plan: "event", quota: "skip" }), null)
  const validate = method.prompts.find(p => p.key === "models").validate
  assert.match(validate(""), /模型/)
  assert.equal(validate("GLM-5.3， Kimi-K3\nGLM-5.3"), undefined)
  const models = await hooks.provider.models({ models: {} }, { auth: auth({ plan: "custom", models: "GLM-5.3， Kimi-K3\nGLM-5.3" }) })
  assert.deepEqual(Object.keys(models), ["GLM-5.3", "Kimi-K3"])
  const event = await hooks.provider.models({ models: {} }, { auth: auth({ plan: "event", models: "stale" }) })
  assert.deepEqual(Object.keys(event), [MODEL])
})

test("quota setup masks the cookie and selects a particular subscription", async () => {
  const inputs = { label: "测试", plan: "event", quota: "console" }
  assert.equal((await method.ask(inputs)).type, "password")
  const sent = reply([row(), row({ resourceAccountId: "plan-2", name: "标准版" })])
  const prompt = await method.ask({ ...inputs, consoleCookie: "session=fixture" })
  assert.equal(prompt.type, "select")
  assert.deepEqual(prompt.options.slice(0, 2).map(o => o.value), ["plan-1", "plan-2"])
  assert.match(prompt.options[1].label, /标准版/)
  assert.equal(sent.mock.callCount(), 1)
  const saved = await method.authorize({ ...inputs, consoleCookie: "session=fixture", quotaPlan: "skip" })
  assert.equal(saved.metadata.consoleCookie, "")
  assert.equal(saved.metadata.quota, "skip")
})

test("quota maps only the selected plan to credits, percent and Shanghai expiry", async () => {
  mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(url, "https://www.scnet.cn/acx/charge/account/currentuser/tokenplan/list")
    assert.equal(init.redirect, "error")
    assert.equal(init.headers.Cookie, "session=fixture")
    assert.equal(new Headers(init.headers).has("authorization"), false)
    assert.ok(init.signal instanceof AbortSignal)
    return Response.json({ code: "0", data: [row(), row({ resourceAccountId: "plan-2", totalAmount: 999999, usedAmount: 0 })] })
  })
  const got = await hooks.auth.usage(async () => auth({ email: "超算互联网 · 主账号", quota: "console", consoleCookie: "session=fixture", quotaPlan: "plan-1" }))
  assert.equal(got.user, "超算互联网 · 主账号")
  assert.equal(got.plan, "DeepSeek 活动套餐")
  assert.equal(got.balance, "58,765.5 Credits")
  assert.equal(got.until, "2099-11-24T15:59:59.000Z")
  assert.equal(got.windows.length, 1)
  assert.equal(got.windows[0].used, 1234.5 / 60000 * 100)
  assert.equal(got.windows[0].amount, 1234.5)
  assert.equal(got.windows[0].limit, 60000)
  assert.equal(got.signIn, "kept")
})

test("missing quota connection explains the next action without making a network call", async () => {
  const sent = mock.method(globalThis, "fetch", () => { throw new Error("must not call") })
  const got = await hooks.auth.usage(async () => auth())
  assert.match(got.error, /未连接.*额度/)
  assert.equal(got.balance, undefined)
  assert.equal(got.windows, undefined)
  assert.equal(got.signIn, "kept")
  assert.equal(sent.mock.callCount(), 0)
})

test("quota errors never expire inference auth or leak upstream messages or cookies", async () => {
  for (const response of [
    () => Response.json({ code: "401", msg: "secret server message" }),
    () => new Response("secret server message", { status: 403 }),
    () => new Response("bad json"),
    () => Response.json({ code: "0", data: {} }),
    () => Response.json({ code: "500", msg: "secret server message" }),
    () => { throw new Error("session=fixture secret server message") },
  ]) {
    mock.method(globalThis, "fetch", response)
    const got = await hooks.auth.usage(async () => auth({ quota: "console", consoleCookie: "session=fixture", quotaPlan: "plan-1" }))
    assert.ok(got.error)
    assert.equal(got.signIn, "kept")
    assert.equal(got.balance, undefined)
    assert.equal(got.windows, undefined)
    assert.doesNotMatch(JSON.stringify(got), /fixture|secret server message/)
    mock.restoreAll()
  }
})

test("missing, ambiguous or malformed plan values do not turn into a fabricated balance", async () => {
  for (const rows of [[], [row({ resourceAccountId: "other" })], [row(), row()], [row({ totalAmount: null })], [row({ usedAmount: "" })], [row({ totalAmount: false })], [row({ usedAmount: -1 })]]) {
    reply(rows)
    const got = await hooks.auth.usage(async () => auth({ quota: "console", consoleCookie: "session=fixture", quotaPlan: "plan-1" }))
    assert.ok(got.error)
    assert.equal(got.balance, undefined)
    assert.equal(got.windows, undefined)
    mock.restoreAll()
  }
})

test("zero use, exhaustion and overuse are distinct and explicit", async () => {
  for (const used of [0, 60000, 70000]) {
    reply([row({ usedAmount: used })])
    const got = await hooks.auth.usage(async () => auth({ quota: "console", consoleCookie: "session=fixture", quotaPlan: "plan-1" }))
    assert.equal(got.windows[0].used, used / 60000 * 100)
    assert.equal(got.windows[0].amount, used)
    assert.equal(got.balance, `${Math.max(0, 60000 - used).toLocaleString("en-US")} Credits`)
    mock.restoreAll()
  }
})

test("expired or disabled plans do not advertise usable quota", async () => {
  for (const extra of [{ maxExpireTime: "2000-01-01 00:00:00" }, { status: "disable" }]) {
    reply([row(extra)])
    const got = await hooks.auth.usage(async () => auth({ quota: "console", consoleCookie: "session=fixture", quotaPlan: "plan-1" }))
    assert.match(got.error, /已到期|未启用/)
    assert.equal(got.balance, undefined)
    assert.equal(got.windows, undefined)
    assert.equal(got.signIn, "kept")
    mock.restoreAll()
  }
})

test("invalid cookie input is rejected locally and failed discovery offers a safe skip", async () => {
  const validate = method.prompts.find(p => p.key === "consoleCookie").validate
  for (const input of [undefined, "", "Cookie: a=b", "a=b\r\nx=y", "not-a-cookie"]) assert.ok(validate(input))
  assert.equal(validate("session=a; token=b"), undefined)
  mock.method(globalThis, "fetch", () => { throw new Error("do not leak session=private") })
  const prompt = await method.ask({ label: "测试", plan: "event", quota: "console", consoleCookie: "session=fixture" })
  assert.equal(prompt.options.length, 1)
  assert.equal(prompt.options[0].value, "skip")
  assert.doesNotMatch(JSON.stringify(prompt), /private/)
})

test("custom models and label validation also apply when prompt validation is bypassed", async () => {
  for (const extra of [{ label: "" }, { label: "line\nbreak" }, { plan: "custom", models: "" }, { plan: "custom" }, { plan: "tampered" }, { quota: "console", consoleCookie: "session=fixture" }]) {
    const got = await method.authorize({ label: "测试", plan: "event", quota: "skip", ...extra })
    assert.equal(got.type, "failed")
  }
})

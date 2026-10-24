import assert from "node:assert/strict"
import { test, afterEach, mock } from "node:test"
import * as entry from "../index.mjs"

const ID = "scnet-token-plan"
const MODEL = "DeepSeek-V4.1-Flash-1017-Event"
const URL = "https://api.scnet.cn/api/llm/v1/chat/completions"
const key = (value = "fixture-token", models) => ({ type: "api", key: value, metadata: { models } })
const hooks = await entry.SCNetAuthPlugin()
afterEach(() => mock.restoreAll())

test("entry exposes one plugin with an API key login and preserves configured providers", async () => {
  assert.equal(Object.values(entry).filter((v) => typeof v === "function").length, 1)
  assert.equal(hooks.auth.provider, ID)
  assert.equal(hooks.auth.methods[0].type, "oauth")
  assert.equal(hooks.auth.methods[1].type, "api")
  const config = {}
  await hooks.config(config)
  assert.equal(config.provider[ID].api, "https://api.scnet.cn/api/llm/v1")
  assert.equal(config.provider[ID].models[MODEL].tool_call, true)
  const own = { name: "My SCNet", models: { personal: {} } }
  config.provider[ID] = own
  await hooks.config(config)
  assert.equal(config.provider[ID], own)
})

test("models are scoped to each account; a global catalog is never fetched", async () => {
  mock.method(globalThis, "fetch", () => { throw new Error("unexpected discovery") })
  const provider = { models: {} }
  const event = await hooks.provider.models(provider, { auth: key() })
  const regular = await hooks.provider.models(provider, { auth: key("other", " GLM-5.3, Kimi-K3, GLM-5.3 ") })
  assert.deepEqual(Object.keys(event), [MODEL])
  assert.deepEqual(Object.keys(regular), ["GLM-5.3", "Kimi-K3"])
  assert.equal(regular["GLM-5.3"].api.id, "GLM-5.3")
  assert.equal(regular["GLM-5.3"].limit.context, 0)
  // SCNet lists every Token Plan model with deep thinking, not only DeepSeek.
  assert.equal(regular["GLM-5.3"].capabilities.reasoning, true)
  assert.equal(regular["Kimi-K3"].capabilities.reasoning, true)
  assert.equal(await hooks.provider.models(provider), provider.models)
  assert.equal(typeof hooks.auth.usage, "function")
})

test("configured model limits survive account model selection", async () => {
  const provider = { models: { [MODEL]: { limit: { context: 64000, output: 8192 } } } }
  const models = await hooks.provider.models(provider, { auth: key() })
  assert.equal(models[MODEL].limit.context, 64000)
})

test("model prompt rejects malformed IDs and keeps the exact Event suffix", () => {
  const validate = hooks.auth.methods[1].prompts.find(p => p.key === "models").validate
  for (const value of [MODEL, "GLM-5.3,Kimi-K3"]) assert.equal(validate(value), undefined)
  for (const value of ["a,,b", ",", "two words", "../bad", ["a"]]) assert.match(validate(value), /模型|Model IDs|exact SCNet/)
})

test("loader uses fresh per-account auth and preserves JSON tool calls", async () => {
  let auth = key("old")
  const loader = await hooks.auth.loader(async () => auth)
  auth = key("new")
  const body = JSON.stringify({ model: MODEL, messages: [], tools: [{ type: "function", function: { name: "weather" } }], stream: true })
  mock.method(globalThis, "fetch", async (request) => {
    assert.equal(request.url, URL)
    assert.equal(request.redirect, "error")
    assert.equal(request.headers.get("authorization"), "Bearer new")
    for (const name of ["x-api-key", "cookie", "proxy-authorization"]) assert.equal(request.headers.has(name), false)
    assert.equal(request.headers.get("content-type"), "application/json")
    assert.equal(await request.text(), body)
    return new Response("ok")
  })
  await loader.fetch(URL, { method: "POST", body, headers: {
    authorization: "Bearer client-key", "x-api-key": "client", cookie: "session=client",
    "proxy-authorization": "client", "content-type": "application/json",
  } })
})

test("Request inputs keep their body and headers", async () => {
  const loader = await hooks.auth.loader(async () => key())
  mock.method(globalThis, "fetch", async (request) => {
    assert.equal(request.headers.get("x-request-id"), "request-1")
    assert.equal(await request.text(), "body")
    return new Response("ok")
  })
  await loader.fetch(new Request(URL, { method: "POST", body: "body", headers: { "x-request-id": "request-1" } }))
})

test("SSE text, reasoning and tool-call chunks pass through without buffering", async () => {
  const loader = await hooks.auth.loader(async () => key())
  let controller
  const response = new Response(new ReadableStream({ start(c) { controller = c } }), { headers: { "content-type": "text/event-stream" } })
  mock.method(globalThis, "fetch", async () => response)
  const got = await loader.fetch(URL)
  assert.equal(got, response)
  const reader = got.body.getReader()
  const chunks = [
    'data: {"choices":[{"delta":{"reasoning_content":"thinking"}}]}\n\n',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\\"city\\\":"}}]}}]}\n\n',
    'data: [DONE]\n\n',
  ]
  for (const chunk of chunks) {
    controller.enqueue(new TextEncoder().encode(chunk))
    assert.equal(new TextDecoder().decode((await reader.read()).value), chunk)
  }
  controller.close()
  assert.equal((await reader.read()).done, true)
})

test("upstream error responses remain available to Magpie failover", async () => {
  const loader = await hooks.auth.loader(async () => key())
  for (const status of [401, 403, 429, 500]) {
    const response = new Response('{"error":{"message":"fixture"}}', { status, headers: { "retry-after": "10" } })
    mock.method(globalThis, "fetch", async () => response)
    const got = await loader.fetch(URL)
    assert.equal(got, response)
    assert.equal(got.headers.get("retry-after"), "10")
    mock.restoreAll()
  }
})

test("foreign URLs, sibling paths and redirects cannot receive credentials", async () => {
  const loader = await hooks.auth.loader(async () => key())
  const send = mock.method(globalThis, "fetch", () => { throw new Error("unexpected network") })
  for (const url of ["https://example.com/chat/completions", "http://api.scnet.cn/api/llm/v1/chat/completions", URL + "/extra", URL + "#fragment", "https://api.scnet.cn/api/llm/v1/models"]) {
    await assert.rejects(loader.fetch(url), /outside the SCNet/)
  }
  assert.equal(send.mock.callCount(), 0)
})

test("logout and missing auth fail closed without a network request", async () => {
  let auth = key()
  const loader = await hooks.auth.loader(async () => auth)
  auth = undefined
  const send = mock.method(globalThis, "fetch", () => { throw new Error("unexpected network") })
  await assert.rejects(loader.fetch(URL), /请重新登录/)
  for (const value of [undefined, {}, { type: "oauth", access: "fixture" }, key(" ")]) {
    await assert.rejects(hooks.auth.loader(async () => value), /请重新登录/)
  }
  assert.equal(send.mock.callCount(), 0)
})

test("client cancellation reaches fetch; already aborted requests never start", async () => {
  const loader = await hooks.auth.loader(async () => key())
  const controller = new AbortController()
  let signal
  mock.method(globalThis, "fetch", async (request) => { signal = request.signal; return new Response("ok") })
  await loader.fetch(URL, { signal: controller.signal })
  controller.abort()
  assert.equal(signal.aborted, true)
  await assert.rejects(loader.fetch(URL, { signal: controller.signal }), { name: "AbortError" })
})

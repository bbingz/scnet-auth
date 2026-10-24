// Runs the real Magpie CLI/gateway with isolated XDG paths and a fake upstream.
// No SCNet key or request is used, and the user's HOME is never overridden.
import assert from "node:assert/strict"
import { spawn, execFileSync } from "node:child_process"
import { mkdtemp, readFile, writeFile, rm, realpath } from "node:fs/promises"
import { createServer } from "node:net"
import { tmpdir, homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { setTimeout as delay } from "node:timers/promises"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
assert.equal(process.platform, "darwin", "This integration harness uses macOS sandbox-exec; unit tests run on any platform")
const magpie = await realpath(execFileSync("which", [process.env.SCNET_TEST_MAGPIE ?? "magpie"], { encoding: "utf8" }).trim())
const bun = execFileSync("which", [process.env.SCNET_TEST_BUN ?? "bun"], { encoding: "utf8" }).trim()
const sandbox = await realpath(await mkdtemp(join(tmpdir(), "scnet-magpie-")))
const spec = process.env.SCNET_TEST_PLUGIN ?? root
const model = "scnet-token-plan/DeepSeek-V4.1-Flash-1017-Event"
const fixtureKey = "scnet-fixture-not-a-real-key"
const freePort = createServer()
await new Promise((done) => freePort.listen(0, "127.0.0.1", done))
const port = freePort.address().port
await new Promise((done) => freePort.close(done))
const wrapper = join(sandbox, "bun-wrapper")
const preload = join(sandbox, "upstream.mjs")
const requests = join(sandbox, "requests.jsonl")
const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'"

await writeFile(preload, `
import { appendFileSync } from "node:fs"
globalThis.fetch = async (input, init) => {
  const req = new Request(input, init)
  if (req.url === "https://www.scnet.cn/acx/charge/account/currentuser/tokenplan/list") {
    if (req.headers.get("cookie") !== "session=scnet-fixture") throw new Error("Wrong quota cookie")
    if (req.headers.has("authorization")) throw new Error("Inference key leaked to console")
    return Response.json({ code: "0", data: [
      { resourceAccountId: "fixture-event", name: "DeepSeek 活动套餐", status: "enable", totalAmount: "60000", usedAmount: "1234.5", maxExpireTime: "2099-11-24 23:59:59" },
      { resourceAccountId: "fixture-standard", name: "标准套餐", status: "enable", totalAmount: "240000", usedAmount: "99999", maxExpireTime: "2099-11-24 23:59:59" },
    ] })
  }
  if (req.url !== "https://api.scnet.cn/api/llm/v1/chat/completions") throw new Error("Unexpected upstream URL")
  if (req.headers.get("authorization") !== "Bearer ${fixtureKey}") throw new Error("Wrong upstream authorization")
  const body = await req.json()
  if (body.model !== "DeepSeek-V4.1-Flash-1017-Event") throw new Error("Wrong upstream model")
  appendFileSync(${JSON.stringify(requests)}, JSON.stringify({ body, redirect: req.redirect }) + "\\n")
  const tool = body.messages.some(m => JSON.stringify(m.content).includes("CALL_TOOL"))
  const message = tool
    ? { role: "assistant", content: null, tool_calls: [{ id: "call_fixture", type: "function", function: { name: "weather", arguments: '{"city":"Shanghai"}' } }] }
    : { role: "assistant", content: "SCNET_MOCK_OK" }
  const finish = tool ? "tool_calls" : "stop"
  const base = { id: "chatcmpl-fixture", created: 1792828800, model: body.model }
  if (!body.stream) return Response.json({ ...base, object: "chat.completion", choices: [{ index: 0, message, finish_reason: finish }], usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 } })
  const delta = tool ? { ...message, tool_calls: message.tool_calls.map(c => ({ index: 0, ...c })) } : message
  const frames = [
    { ...base, object: "chat.completion.chunk", choices: [{ index: 0, delta, finish_reason: null }] },
    { ...base, object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: finish }], usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 } },
  ]
  return new Response(new ReadableStream({ start(c) {
    for (const frame of frames) c.enqueue(new TextEncoder().encode("data: " + JSON.stringify(frame) + "\\n\\n"))
    c.enqueue(new TextEncoder().encode("data: [DONE]\\n\\n")); c.close()
  } }), { headers: { "content-type": "text/event-stream" } })
}
`)
await writeFile(wrapper, `#!/bin/sh
if [ "$1" = run ]; then
  shift
  exec ${quote(bun)} run --preload ${quote(preload)} "$@"
fi
exec ${quote(bun)} "$@"
`, { mode: 0o700 })
const env = {
  ...process.env,
  XDG_CONFIG_HOME: join(sandbox, "config"),
  XDG_CACHE_HOME: join(sandbox, "cache"),
  MAGPIE_ADDR: `127.0.0.1:${port}`,
  MAGPIE_BUN: wrapper,
  MAGPIE_WEB_KEY: "scnet-ui-fixture-key-at-least-16",
  // Magpie's discovery-off switch also disables plugin accounts. Block native
  // credentials at the OS boundary instead, while allowing fixture accounts.
  MAGPIE_NO_ACCOUNTS: "0",
  MAGPIE_NO_STATS: "1",
  MAGPIE_PLUGIN_MARKET: "off",
}
const sandboxProfile = `(version 1)
(allow default)
(deny file-read-data (require-all (subpath ${JSON.stringify(homedir())})
  (require-not (subpath ${JSON.stringify(root)}))
  (require-not (literal ${JSON.stringify(bun)}))))
(deny file-write* (subpath ${JSON.stringify(homedir())}))
(deny process-exec (require-all ${[magpie, bun, wrapper, "/bin/sh", "/bin/bash"].map((p) => `(require-not (literal ${JSON.stringify(p)}))`).join(" ")}))
(deny mach-lookup (global-name "com.apple.securityd.xpc"))`
const launch = (args, stdio) => spawn("/usr/bin/sandbox-exec", ["-p", sandboxProfile, magpie, ...args], { env, cwd: sandbox, stdio })
const logs = []
async function cli(args, input = "") {
  const child = launch(args, ["pipe", "pipe", "pipe"])
  let output = ""
  child.stdout.on("data", (data) => { output += data })
  child.stderr.on("data", (data) => { output += data })
  child.stdin.on("error", () => {})
  child.stdin.end(input)
  const timer = setTimeout(() => child.kill("SIGKILL"), 45000)
  try {
    const code = await new Promise((done, reject) => { child.once("error", reject); child.once("close", done) })
    logs.push({ args, code, output })
    assert.equal(code, 0, `magpie ${args.join(" ")}: ${output}`)
    return output
  } finally { clearTimeout(timer) }
}

let gateway
let gatewayClosed
let gatewayLog = ""
try {
  console.log((await cli(["--version"])).trim())
  await cli(["plugin", "add", spec])
  const listed = await cli(["plugin", "--json"])
  assert.match(listed, /scnet-token-plan/)
  if (process.env.SCNET_TEST_UI === "1") {
    const webSocket = createServer()
    await new Promise(done => webSocket.listen(0, "127.0.0.1", done))
    const webPort = webSocket.address().port
    await new Promise(done => webSocket.close(done))
    gateway = launch(["web", "--no-open", "--gateway", "--addr", `127.0.0.1:${webPort}`], ["ignore", "pipe", "pipe"])
    gateway.stdout.on("data", d => { gatewayLog += d })
    gateway.stderr.on("data", d => { gatewayLog += d })
    gatewayClosed = new Promise(done => gateway.once("close", done))
    console.log(`Fixture UI: http://127.0.0.1:${webPort}/?k=${env.MAGPIE_WEB_KEY}`)
    console.log("Use fixture key scnet-fixture-not-a-real-key and cookie session=scnet-fixture. Stop with Ctrl-C.")
    await Promise.race([gatewayClosed, new Promise(done => {
      process.once("SIGINT", done)
      process.once("SIGTERM", done)
    })])
  } else {
    // Use the actual login command, not a hand-written credential fixture.
    await cli(["plugin", "login", "scnet-token-plan", "1"], `Fixture main\n1\n2\n${fixtureKey}\n`)
    const auth = JSON.parse(await readFile(join(env.XDG_CONFIG_HOME, "magpie", "plugin-auth.json"), "utf8"))
    assert.equal(auth["scnet-token-plan"].key, fixtureKey)
    assert.equal(auth["scnet-token-plan"].metadata.email, "超算互联网 · Fixture main")
    assert.equal(auth["scnet-token-plan"].metadata.quota, "skip")
    gateway = launch(["serve"], ["ignore", "pipe", "pipe"])
    gateway.stdout.on("data", (d) => { gatewayLog += d })
    gateway.stderr.on("data", (d) => { gatewayLog += d })
    gatewayClosed = new Promise((done) => { gateway.once("close", done) })
    const base = `http://127.0.0.1:${port}`
    let ready = false
    for (let attempt = 0; attempt < 100; attempt++) {
      if (gateway.exitCode !== null) throw new Error(`Gateway exited: ${gatewayLog}`)
      try {
        const response = await fetch(`${base}/v1/models`, { signal: AbortSignal.timeout(1000) })
        if (response.ok && (await response.json()).data.some((m) => m.id === model)) { ready = true; break }
      } catch {}
      await delay(100)
    }
    assert.ok(ready, `Gateway did not expose SCNet: ${gatewayLog}`)
    const functionTool = { name: "weather", description: "Fixture weather", parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] } }
    for (const protocol of ["chat", "anthropic", "responses"]) {
      for (const stream of [false, true]) {
        for (const tool of [false, true]) {
          const prompt = tool ? "CALL_TOOL" : "Reply with SCNET_MOCK_OK"
          const body = protocol === "responses"
            ? { model, input: prompt, stream, tools: [{ type: "function", ...functionTool }] }
            : protocol === "anthropic"
              ? { model, messages: [{ role: "user", content: prompt }], stream, max_tokens: 64, tools: [{ name: "weather", description: "Fixture weather", input_schema: functionTool.parameters }] }
              : { model, messages: [{ role: "user", content: prompt }], stream, tools: [{ type: "function", function: functionTool }] }
          const path = { chat: "/v1/chat/completions", anthropic: "/v1/messages", responses: "/v1/responses" }[protocol]
          const response = await fetch(base + path, {
            method: "POST", headers: { "content-type": "application/json", "anthropic-version": "2023-06-01" },
            body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
          })
          const output = await response.text()
          assert.equal(response.status, 200, output)
          assert.match(output, tool ? /weather/ : /SCNET_MOCK_OK/)
          if (tool) assert.match(output, /Shanghai/)
          if (stream) assert.match(response.headers.get("content-type"), /text\/event-stream/)
          console.log(`PASS ${protocol} ${stream ? "stream" : "JSON"} ${tool ? "tool call" : "text"}`)
        }
      }
    }
    const upstream = (await readFile(requests, "utf8")).trim().split("\n").map(JSON.parse)
    assert.equal(upstream.length, 12)
    for (const request of upstream) {
      assert.equal(request.redirect, "error")
      assert.ok(request.body.tools.some((tool) => tool.function.name === "weather"))
    }
    // Exercise dynamic subscription selection and same-name metadata replacement.
    await cli(["plugin", "login", "scnet-token-plan", "1"], `Fixture main\n1\n1\nsession=scnet-fixture\n1\n${fixtureKey}\n`)
    const updated = JSON.parse(await readFile(join(env.XDG_CONFIG_HOME, "magpie", "plugin-auth.json"), "utf8"))
    assert.equal(Object.keys(updated).length, 1)
    assert.equal(updated["scnet-token-plan"].metadata.email, "超算互联网 · Fixture main")
    assert.equal(updated["scnet-token-plan"].metadata.quotaPlan, "fixture-event")
    const quota = await cli(["quota"])
    assert.match(quota, /58,765.5|58765.5/)
    assert.match(quota, /Credits/)
    await cli(["plugin", "logout", "scnet-token-plan"])
    console.log("PASS plugin add/list/login/logout; 12 gateway cases; account naming; selected-plan quota")
  }
} catch (error) {
  console.error(JSON.stringify(logs, null, 2))
  console.error(gatewayLog)
  throw error
} finally {
  if (gateway && gateway.exitCode === null) {
    gateway.kill("SIGTERM")
    const killTimer = setTimeout(() => gateway.kill("SIGKILL"), 3000)
    await gatewayClosed
    clearTimeout(killTimer)
  }
  if (process.env.SCNET_TEST_KEEP === "1") console.log(`Sandbox: ${sandbox}`)
  else await rm(sandbox, { recursive: true, force: true })
}

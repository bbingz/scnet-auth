import assert from "node:assert/strict"
import { test } from "node:test"
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { SCNetAuthPlugin } from "../index.mjs"

const ID = "scnet-token-plan"
const old = { type: "api", key: "fixture-shared-key" }
const newer = { ...old, metadata: { email: "超算互联网 · 工作账号", consoleCookie: "secret-cookie" } }

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "scnet-accounts-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const file = join(directory, "plugin-auth.json")
  const initial = { [ID]: old, [ID + "#new"]: newer, other: { type: "api", key: "other-secret" } }
  await writeFile(file, JSON.stringify(initial))
  const calls = []
  const client = { auth: { async remove({ path: { id } }) {
    calls.push(id)
    const all = JSON.parse(await readFile(file, "utf8"))
    delete all[id]
    await writeFile(file, JSON.stringify(all))
    return { data: true }
  } } }
  const hooks = await SCNetAuthPlugin({ directory, project: { id: "magpie" }, client })
  const method = hooks.auth.methods.find(m => m.label.includes("管理已保存账号"))
  assert.ok(method, "the plugin must offer account removal in its own menu")
  const read = async () => JSON.parse(await readFile(file, "utf8"))
  return { method, calls, file, initial, read }
}

test("plugin management removes only the confirmed slot, including the last account", async t => {
  const f = await fixture(t)
  const list = await f.method.ask({})
  assert.equal(list.options.length, 2)
  assert.doesNotMatch(JSON.stringify(list), /fixture-shared-key|secret-cookie|other-secret/)
  const inputs = { [list.key]: list.options[0].value }
  const confirm = await f.method.ask(inputs)
  assert.match(confirm.message, /移除/)
  assert.deepEqual(f.calls, [], "opening confirmation or canceling the wizard writes nothing")
  assert.deepEqual(await f.read(), f.initial)
  inputs[confirm.key] = confirm.options[0].value
  const results = await Promise.all([f.method.ask(inputs), f.method.ask(inputs)])
  assert.match(results[0].message, /已移除/)
  assert.deepEqual(f.calls, [ID], "duplicate prompt requests must remove only once")
  assert.deepEqual(await f.read(), { [ID + "#new"]: newer, other: f.initial.other })
  const next = await f.method.ask({})
  const last = { [next.key]: next.options[0].value }
  const lastConfirm = await f.method.ask(last)
  last[lastConfirm.key] = lastConfirm.options[0].value
  await f.method.ask(last)
  assert.deepEqual(await f.read(), { other: f.initial.other })
  assert.match((await f.method.ask({})).message, /没有已保存/)
})

test("forged selections, stale confirmations and malformed stores never delete credentials", async t => {
  const f = await fixture(t)
  await assert.rejects(f.method.ask({ account: "other", confirm: "remove" }), /重新打开/)
  const list = await f.method.ask({})
  const inputs = { [list.key]: list.options[0].value }
  const confirm = await f.method.ask(inputs)
  inputs[confirm.key] = "forged"
  await assert.rejects(f.method.ask(inputs), /确认/)
  inputs[confirm.key] = confirm.options[0].value
  await writeFile(f.file, JSON.stringify({ ...f.initial, [ID]: { ...old, key: "changed" } }))
  await assert.rejects(f.method.ask(inputs), /已变化/)
  await writeFile(f.file, "broken json containing secret")
  await assert.rejects(f.method.ask({}), e => /无法读取/.test(e.message) && !e.message.includes("secret"))
  assert.deepEqual(f.calls, [])
})

test("management never authorizes a new sign-in and does not appear outside Magpie", async t => {
  const f = await fixture(t)
  const result = await f.method.authorize({})
  assert.equal(result.type, "failed")
  assert.deepEqual(f.calls, [])
  const hooks = await SCNetAuthPlugin()
  assert.equal(hooks.auth.methods.length, 2)
})

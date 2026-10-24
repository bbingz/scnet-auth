import assert from "node:assert/strict"
import { test } from "node:test"
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { createCipheriv, createHash, pbkdf2Sync } from "node:crypto"
import { createBrowserSession, decodeCookie, readSCNetRows } from "../browser-session.mjs"

const password = "fixture-browser-password"
const key = pbkdf2Sync(password, "saltysalt", 1003, 16, "sha1")
function encrypted(host, value, version = 24) {
  const prefix = version >= 24 ? createHash("sha256").update(host).digest() : Buffer.alloc(0)
  const cipher = createCipheriv("aes-128-cbc", key, Buffer.alloc(16, 32))
  return Buffer.concat([Buffer.from("v10"), cipher.update(Buffer.concat([prefix, Buffer.from(value)])), cipher.final()])
}
async function fixture(t, { profile = "Default", version = 24 } = {}) {
  const home = await mkdtemp(join(tmpdir(), "scnet-browser-test-"))
  t.after(() => rm(home, { recursive: true, force: true }))
  const root = join(home, "Library/Application Support/Google/Chrome Beta")
  await mkdir(join(root, "Default/Network"), { recursive: true })
  await writeFile(join(root, "Local State"), JSON.stringify({ profile: { last_used: profile } }))
  const path = join(root, "Default/Network/Cookies")
  const db = new DatabaseSync(path)
  db.exec("CREATE TABLE meta(key TEXT, value TEXT); CREATE TABLE cookies(host_key TEXT, name TEXT, value TEXT, encrypted_value BLOB, path TEXT, expires_utc INTEGER, has_expires INTEGER, top_frame_site_key TEXT)")
  db.prepare("INSERT INTO meta VALUES ('version', ?)").run(String(version))
  const add = (host = ".scnet.cn", name = "session", value = "fixture-session", extra = {}) => {
    const { path = "/", expires = 0, hasExpires = 0, partition = "", plaintext = false } = extra
    db.prepare("INSERT INTO cookies VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(host, name, plaintext ? value : "", plaintext ? new Uint8Array() : encrypted(host, value, version), path, expires, hasExpires, partition)
  }
  let executions = 0
  const options = { platform: "darwin", home, bundleId: "com.google.Chrome.beta", execute: async (command, args, options) => {
    executions++
    assert.equal(command, "/usr/bin/security")
    assert.deepEqual(args, ["find-generic-password", "-w", "-a", "Chrome", "-s", "Chrome Safe Storage"])
    assert.equal(options.encoding, "buffer")
    return { stdout: Buffer.from(password + "\n") }
  } }
  t.after(() => { try { db.close() } catch {} })
  return { home, root, path, db, add, options, executions: () => executions }
}

test("only exact SCNet hosts, console paths and unpartitioned live cookies are imported read-only", async t => {
  const f = await fixture(t)
  f.add()
  f.add(".scnet.cn", "persistent", "future", { expires: (BigInt(Date.now()) + 11644473600000n + 86400000n) * 1000n, hasExpires: 1 })
  f.add("www.scnet.cn", "console", "scoped", { path: "/acx" })
  f.add(".scnet.cn.evil.example", "foreign", "never-read")
  f.add(".evil.example", "foreign", "never-read")
  f.add(".scnet.cn", "unrelated-path", "never-read", { path: "/admin" })
  f.add(".scnet.cn", "partitioned", "never-read", { partition: "https://evil.example" })
  f.add(".scnet.cn", "expired", "never-use", { expires: 11644473600001, hasExpires: 1 })
  f.db.close()
  const before = await readFile(f.path)
  assert.equal((await readSCNetRows(f.path)).rows.length, 4)
  const session = await createBrowserSession(f.options)
  assert.equal(await session.readCookie(), "console=scoped; session=fixture-session; persistent=future")
  assert.equal(await session.readCookie(), "console=scoped; session=fixture-session; persistent=future")
  assert.equal(f.executions(), 1)
  session.clear()
  await assert.rejects(session.readCookie(), /结束/)
  assert.deepEqual(await readFile(f.path), before)
})

test("domain hashes and encryption prefixes are validated instead of accepting wrong credentials", () => {
  const row = { host_key: ".scnet.cn", encrypted_value: encrypted(".scnet.cn", "fixture") }
  assert.equal(decodeCookie(row, 24, key), "fixture")
  assert.throws(() => decodeCookie({ ...row, host_key: "www.scnet.cn" }, 24, key), /无法解密/)
  assert.throws(() => decodeCookie(row, 24, Buffer.alloc(16)), /无法解密/)
  assert.throws(() => decodeCookie({ ...row, encrypted_value: Buffer.from("v20unsupported") }, 24, key), /暂不支持/)
  assert.equal(decodeCookie({ ...row, encrypted_value: encrypted(".scnet.cn", "old", 23) }, 23, key), "old")
})

test("browser access never scans other profiles, and missing cookies request no keychain", async t => {
  const f = await fixture(t)
  f.add(".other.example")
  const session = await createBrowserSession(f.options)
  assert.equal(await session.readCookie(), "")
  assert.equal(f.executions(), 0)
  session.clear()
})

test("keychain refusal ends the attempt without exposing process stderr", async t => {
  const f = await fixture(t); f.add()
  const session = await createBrowserSession({ ...f.options, execute: async () => { throw Error("secret keychain output") } })
  await assert.rejects(session.readCookie(), error => /未获准/.test(error.message) && !/secret/.test(error.message))
  session.clear()
})

test("cancel while keychain access is pending cannot return a cookie", async t => {
  const f = await fixture(t); f.add()
  let entered, release
  const ready = new Promise(resolve => { entered = resolve })
  const pending = new Promise(resolve => { release = resolve })
  const session = await createBrowserSession({ ...f.options, execute: async () => { entered(); await pending; return { stdout: Buffer.from(password) } } })
  const attempt = session.readCookie()
  await ready; session.clear(); release()
  await assert.rejects(attempt)
})

test("unsupported browsers/platforms and unsafe profile paths fail without credential reads", async t => {
  await assert.rejects(createBrowserSession({ platform: "win32" }), /目前支持 macOS/)
  await assert.rejects(createBrowserSession({ platform: "darwin", bundleId: "com.apple.Safari" }), /暂不支持/)
  const f = await fixture(t, { profile: "../../outside" })
  await assert.rejects(createBrowserSession(f.options), /不会搜索其他/)
  assert.equal(f.executions(), 0)
})

test("a cookie-file symlink outside the selected profile is refused", async t => {
  const f = await fixture(t)
  f.db.close()
  const outside = join(f.home, "outside.db")
  await writeFile(outside, await readFile(f.path)); await rm(f.path); await symlink(outside, f.path)
  const session = await createBrowserSession(f.options)
  await assert.rejects(session.readCookie(), /不在当前资料/)
  assert.equal(f.executions(), 0)
  session.clear()
})

test("plaintext cookies never require the keychain and header injection is discarded", async t => {
  const f = await fixture(t)
  f.add(".scnet.cn", "session", "plain-fixture", { plaintext: true })
  f.add(".scnet.cn", "invalid", "bad; injected=1", { plaintext: true })
  const session = await createBrowserSession(f.options)
  assert.equal(await session.readCookie(), "session=plain-fixture")
  assert.equal(f.executions(), 0)
  session.clear()
})

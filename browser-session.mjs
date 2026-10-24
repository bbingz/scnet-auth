import { readFile, realpath, access } from "node:fs/promises"
import { homedir } from "node:os"
import { join, sep } from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { createDecipheriv, createHash, pbkdf2Sync, timingSafeEqual } from "node:crypto"

export class LoginError extends Error {}
const run = promisify(execFile)
const HOSTS = ["scnet.cn", ".scnet.cn", "www.scnet.cn", ".www.scnet.cn"]
const BROWSERS = {
  "com.google.Chrome": ["Google Chrome", "Google/Chrome", "Chrome"],
  "com.google.Chrome.beta": ["Google Chrome Beta", "Google/Chrome Beta", "Chrome"],
  "com.google.Chrome.dev": ["Google Chrome Dev", "Google/Chrome Dev", "Chrome"],
  "com.google.Chrome.canary": ["Google Chrome Canary", "Google/Chrome Canary", "Chrome"],
  "com.microsoft.edgemac": ["Microsoft Edge", "Microsoft Edge", "Microsoft Edge"],
  "com.brave.Browser": ["Brave", "BraveSoftware/Brave-Browser", "Brave"],
}

// No shell, browser automation, browser database copies, or profile enumeration.
async function defaultBrowser(signal) {
  try {
    const { stdout } = await run("/usr/bin/osascript", ["-l", "JavaScript", "-e",
      'ObjC.import("AppKit"); ObjC.unwrap($.NSBundle.bundleWithURL($.NSWorkspace.sharedWorkspace.URLForApplicationToOpenURL($.NSURL.URLWithString("https://www.scnet.cn/"))).bundleIdentifier)'],
    { encoding: "utf8", timeout: 10000, maxBuffer: 4096, signal })
    return stdout.trim()
  } catch { throw new LoginError("无法识别默认浏览器，请确认已设置默认浏览器后重试") }
}

export async function readSCNetRows(path) {
  let db
  try {
    if (globalThis.Bun) {
      const { Database } = await import("bun:sqlite")
      db = new Database(path, { readonly: true, safeIntegers: true })
    } else {
      const { DatabaseSync } = await import("node:sqlite")
      db = new DatabaseSync(path, { readOnly: true })
    }
    const version = Number(db.prepare("SELECT value FROM meta WHERE key = 'version'").get()?.value)
    if (!Number.isInteger(version) || version < 1) throw new Error("Unsupported schema")
    // SQL filters before any cookie data leaves the database. Partitioned
    // cookies and cookies that cannot reach /acx/ are deliberately excluded.
    const query = db.prepare(`SELECT host_key, name, value, encrypted_value, path, expires_utc, has_expires
      FROM cookies WHERE host_key IN (?, ?, ?, ?) AND top_frame_site_key = ''
      AND (path = '/' OR path = '/acx' OR path = '/acx/') LIMIT 65`)
    query.setReadBigInts?.(true)
    const rows = query.all(...HOSTS)
    if (rows.length > 64) throw new Error("Too many cookies")
    return { version, rows }
  } finally { db?.close() }
}

export function decodeCookie(row, version, key) {
  let plain
  const encrypted = Buffer.from(row.encrypted_value ?? [])
  if (encrypted.length) {
    if (encrypted.subarray(0, 3).toString() !== "v10") throw new LoginError("浏览器会话使用暂不支持的加密方式；请使用高级手动配置")
    try {
      const decipher = createDecipheriv("aes-128-cbc", key, Buffer.alloc(16, 32))
      plain = Buffer.concat([decipher.update(encrypted.subarray(3)), decipher.final()])
      if (version >= 24) {
        const expected = createHash("sha256").update(row.host_key).digest()
        if (plain.length < 32 || !timingSafeEqual(plain.subarray(0, 32), expected)) throw new Error("Host mismatch")
        const value = new TextDecoder("utf-8", { fatal: true }).decode(plain.subarray(32))
        return value
      }
      return new TextDecoder("utf-8", { fatal: true }).decode(plain)
    } catch { throw new LoginError("无法解密此浏览器的 SCNet 会话，请检查钥匙串授权后重试") }
    finally { plain?.fill(0); encrypted.fill(0) }
  }
  return row.value || ""
}

export async function createBrowserSession({ signal, platform = process.platform, home = homedir(), bundleId, execute = run } = {}) {
  if (platform !== "darwin") throw new LoginError("自动读取官网会话目前支持 macOS 的 Chrome、Edge 和 Brave；此系统请使用高级手动配置")
  const browser = BROWSERS[bundleId ?? await defaultBrowser(signal)]
  if (!browser) throw new LoginError("当前默认浏览器暂不支持自动读取会话；目前支持 macOS 的 Chrome、Edge 和 Brave，可改用高级手动配置")
  const [name, relative, keyring] = browser
  let profile, base
  try {
    base = await realpath(join(home, "Library", "Application Support", relative))
    const state = JSON.parse(await readFile(join(base, "Local State"), "utf8"))
    profile = state.profile?.last_used || "Default"
    if (!/^(Default|Profile [0-9]+)$/.test(profile)) throw new Error("Unsupported profile")
    const resolved = await realpath(join(base, profile))
    if (!resolved.startsWith(base + sep)) throw new Error("Profile outside browser root")
    base = resolved
  } catch { throw new LoginError("无法读取默认浏览器的当前资料，请先打开浏览器后重试；不会搜索其他浏览器资料") }
  let key, closed = false
  return {
    name, profile,
    async readCookie() {
      if (closed || signal?.aborted) throw new LoginError("本次登录已结束，请重新登录")
      let path
      for (const relative of ["Network/Cookies", "Cookies"]) {
        const candidate = join(base, relative)
        try { await access(candidate) } catch { continue }
        path = await realpath(candidate)
        if (!path.startsWith(base + sep)) throw new LoginError("浏览器会话文件不在当前资料内，已停止读取")
        break
      }
      if (!path) return ""
      let snapshot
      try { snapshot = await readSCNetRows(path) }
      catch { throw new LoginError("暂时无法只读访问浏览器的 SCNet 会话，请稍后重试或使用高级手动配置") }
      const now = Date.now()
      const rows = snapshot.rows.filter(row => HOSTS.includes(row.host_key) &&
        (!row.has_expires || Number(row.expires_utc) / 1000 - 11644473600000 > now))
      if (rows.some(row => row.encrypted_value?.length) && !key) {
        let password
        try {
          const { stdout } = await execute("/usr/bin/security", ["find-generic-password", "-w", "-a", keyring, "-s", `${keyring} Safe Storage`],
            { encoding: "buffer", timeout: 60000, maxBuffer: 4096, signal })
          password = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout)
          let end = password.length
          while (end && [10, 13].includes(password[end - 1])) end--
          if (!end || closed || signal?.aborted) throw new Error("No key")
          key = pbkdf2Sync(password.subarray(0, end), "saltysalt", 1003, 16, "sha1")
          if (Buffer.isBuffer(stdout)) stdout.fill(0)
        } catch { throw new LoginError("未获准读取浏览器钥匙串，已停止连接；重新登录时可在 macOS 提示中允许，或使用高级手动配置") }
        finally { password?.fill(0) }
      }
      if (closed || signal?.aborted) throw new LoginError("本次登录已结束，请重新登录")
      return rows.sort((a, b) => b.path.length - a.path.length).map(row => {
        const value = decodeCookie(row, snapshot.version, key)
        if (!/^[!#$%&'*+.^_`|~\w-]+$/.test(row.name) || /[\x00-\x20\x7f;,]/.test(value)) return ""
        return value ? `${row.name}=${value}` : ""
      }).filter(Boolean).join("; ")
    },
    clear() { closed = true; key?.fill(0); key = undefined },
  }
}

export async function openConfirmation(url, signal) {
  const parsed = new URL(url)
  if (parsed.origin !== `http://127.0.0.1:${parsed.port}` || parsed.pathname !== "/" || !parsed.hash) throw new LoginError("无效的本机确认地址")
  try { await run("/usr/bin/open", [url], { timeout: 10000, signal, maxBuffer: 4096 }) }
  catch { throw new LoginError("无法打开套餐确认页，请返回 Magpie 重新登录") }
}

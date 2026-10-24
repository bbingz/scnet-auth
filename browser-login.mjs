import { readFile } from "node:fs/promises"
import { createServer } from "node:http"
import { randomBytes } from "node:crypto"
import { createBrowserSession, openConfirmation, LoginError } from "./browser-session.mjs"
import { setTimeout as delay } from "node:timers/promises"
import { date, planId, planName } from "./quota.mjs"

const ORIGIN = "https://www.scnet.cn"
const PATHS = {
  profile: "/user/users/current-user-info",
  plans: "/charge/account/currentuser/tokenplan/list",
  key: "/llm/api-key/token-plan/query",
  catalog: "/llm/api/package/overview?packageType=TokenPlan",
}

class SignedOut extends LoginError {}

async function json(path, cookie, signal) {
  let response, body
  try {
    response = await fetch(`${ORIGIN}/acx${path}`, {
      headers: { Accept: "application/json", Cookie: cookie }, redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
    })
    if ([401, 403].includes(response.status)) throw new SignedOut("登录已失效，请重新登录超算互联网")
    if (!response.ok) throw new LoginError(`超算互联网暂时无法读取账号信息（HTTP ${response.status}），请重试`)
    body = await response.json()
  } catch (error) {
    if (error instanceof LoginError) throw error
    throw new LoginError("读取超算互联网账号信息失败，请检查网络后重新登录")
  }
  if (["401", "403"].includes(String(body?.code))) throw new SignedOut("请在浏览器中完成超算互联网登录")
  if (String(body?.code) !== "0") throw new LoginError("超算互联网返回异常，请稍后重新登录")
  return body.data
}

function modelList(value) {
  if (typeof value !== "string") return ""
  const ids = value.split(/[,，\n]/).map(s => s.trim()).filter(Boolean)
  return ids.length && ids.every(id => /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(id)) ? [...new Set(ids)].join(",") : ""
}

function list(value) {
  return Array.isArray(value) ? value : value?.list ?? value?.records ?? value?.packages ?? []
}

// Read only existing credentials. Never create/reset a key or subscribe to a plan.
export async function accountInfo(cookie, signal) {
  const profile = await json(PATHS.profile, cookie, signal)
  if (!profile || typeof profile !== "object" || !(profile.id ?? profile.userId)) {
    throw new LoginError("超算互联网未返回账号身份，请重新登录")
  }
  const rows = await json(PATHS.plans, cookie, signal)
  if (!Array.isArray(rows)) throw new LoginError("套餐接口结构已变化，请更新插件后重试")
  const active = rows.filter(row => row && planId(row) && (!row.status || row.status === "enable") &&
    (!date(row.maxExpireTime || row.expireTime || row.endTime) || Date.parse(date(row.maxExpireTime || row.expireTime || row.endTime)) > Date.now()))
  if (!active.length) throw new LoginError("此账号没有可用的 Token Plan 套餐，请先在超算互联网开通或续订")
  const keyData = await json(PATHS.key, cookie, signal)
  const raw = typeof keyData === "string" ? keyData : keyData?.apiKey ?? keyData?.apikey ?? keyData?.key ?? keyData?.secret ?? keyData?.token
  if (typeof raw !== "string" || !raw.trim() || /[\s*…]/.test(raw.trim())) {
    throw new LoginError("未能读取现有套餐密钥，请在超算互联网 Token Plan 页面确认密钥可用后重试；插件不会创建或重置密钥")
  }
  let catalog = []
  try { catalog = list(await json(PATHS.catalog, cookie, signal)) } catch { /* Model entry remains available when discovery fails. */ }
  const choices = []
  for (const row of active) {
    const id = planId(row)
    if (choices.some(p => p.id === id)) throw new LoginError("套餐标识重复，无法安全选择，请在超算互联网核对")
    let matches = catalog.filter(p => String(p.code) === String(row.resourceId))
    if (!matches.length && row.resourceId) {
      try { matches = list(await json(`${PATHS.catalog}&code=${encodeURIComponent(row.resourceId)}`, cookie, signal)).filter(p => String(p.code) === String(row.resourceId)) } catch { /* Ask for exact model IDs below. */ }
    }
    const pack = matches.length === 1 ? matches[0] : undefined
    choices.push({ id, name: planName(row), until: date(row.maxExpireTime || row.expireTime || row.endTime) || "",
      models: modelList(row.models) || modelList(pack?.models) })
  }
  return { user: String(profile.userName || profile.id || profile.userId), userId: String(profile.id ?? profile.userId), key: raw.trim(), choices }
}

// Magpie opens the official website. The local page only confirms the account
// and subscription after SCNet has accepted the current browser session.
export async function startBrowserLogin({ timeoutMs = 300000, pollMs = 2500, browserSession, openPage = openConfirmation } = {}) {
  const template = await readFile(new URL("./signin.html", import.meta.url), "utf8")
  const secret = randomBytes(32).toString("base64url"), nonce = randomBytes(18).toString("base64")
  const abort = new AbortController()
  const browser = browserSession ?? await createBrowserSession({ signal: abort.signal })
  let info, cookie, busy = false, ended = false, timer, origin, resolve, started = false, confirmationOpened = false
  const result = new Promise(done => { resolve = done })
  const finish = value => {
    if (ended) return
    ended = true
    clearTimeout(timer)
    abort.abort()
    browser.clear()
    info = cookie = undefined
    server.close()
    server.closeAllConnections()
    resolve(value)
  }
  const server = createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store")
    res.setHeader("Referrer-Policy", "no-referrer")
    res.setHeader("X-Content-Type-Options", "nosniff")
    res.setHeader("X-Frame-Options", "DENY")
    res.setHeader("Content-Security-Policy", `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; form-action 'none'; base-uri 'none'`)
    const reply = (status, data, completion) => {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" })
      res.end(JSON.stringify(data), completion)
    }
    if (req.headers.host !== new URL(origin).host) return reply(403, { error: "无效的本机地址" })
    if (ended) return reply(410, { error: "本次登录已结束，请返回 Magpie 重试" })
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
      return res.end(template.replaceAll("__NONCE__", nonce))
    }
    if (req.method !== "POST" || !["/account", "/refresh", "/choose", "/cancel"].includes(req.url)) return reply(404, { error: "请求不存在" })
    if (req.headers.origin !== origin || req.headers["x-scnet-login"] !== secret ||
      req.headers["sec-fetch-site"] === "cross-site" || req.headers["content-type"]?.split(";")[0].trim() !== "application/json") {
      return reply(403, { error: "请从 Magpie 打开的本机页面继续登录" })
    }
    if (req.url === "/cancel") return reply(200, { ok: true }, () => finish({ type: "failed", error: "登录已取消，原账号保持不变" }))
    if (busy) return reply(409, { error: "正在处理上一条请求，请稍候" })
    busy = true
    try {
      const body = await new Promise((resolve, reject) => {
        let text = "", size = 0
        req.on("data", chunk => {
          size += chunk.length
          if (size > 16384) { text = ""; reject(new LoginError("请求过大，请重新输入")); return }
          text += chunk.toString("utf8")
        })
        req.on("error", reject)
        req.on("end", () => { try { resolve(JSON.parse(text)) } catch { reject(new LoginError("请求格式不正确")) } })
      })
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new LoginError("请求格式不正确")
      if (ended) return
      if (req.url === "/refresh") {
        info = cookie = undefined
        return reply(200, { ready: false })
      }
      if (req.url === "/account") return reply(200, info ? { ready: true, user: info.user, choices: info.choices } : { ready: false })
      const plan = info?.choices.find(p => p.id === body.id)
      const models = plan?.models || modelList(body.models)
      if (!plan || !models) throw new LoginError("请选择套餐，并填写该套餐支持的准确模型 ID")
      // Recheck the browser identity before saving, in case it was switched
      // while the confirmation page was open. Never merge different users.
      const currentCookie = await browser.readCookie()
      const current = await accountInfo(currentCookie, abort.signal)
      if (ended) return
      if (current.userId !== info.userId || current.key !== info.key ||
          !current.choices.some(p => p.id === plan.id && p.models === plan.models)) {
        info = current; cookie = currentCookie
        throw new LoginError("官网账号或套餐已变化，请点击重新读取后再次确认")
      }
      cookie = currentCookie
      const duplicateName = info.choices.filter(p => p.name === plan.name).length > 1
      const value = { type: "success", key: info.key, metadata: {
        email: `超算互联网 · ${info.user} · ${plan.name}${duplicateName ? ` · ${plan.id}` : ""}`,
        scnetUserId: info.userId, models, plan: "custom", quota: "console", consoleCookie: cookie, quotaPlan: plan.id,
      } }
      reply(200, { ok: true }, () => finish(value))
    } catch (error) {
      if (!ended && !res.writableEnded) reply(400, { error: error instanceof LoginError ? error.message : "登录未完成，请返回 Magpie 重试" })
    } finally { busy = false }
  })
  server.requestTimeout = server.headersTimeout = 10000
  server.maxHeadersCount = 32
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve) })
  origin = `http://127.0.0.1:${server.address().port}`
  server.on("error", () => finish({ type: "failed", error: "本机登录服务已停止，请重新登录" }))
  timer = setTimeout(() => finish({ type: "failed", error: "登录已超时，请重新登录超算互联网" }), timeoutMs)
  const confirmationUrl = `${origin}/#${secret}`
  async function watch() {
    try {
      while (!ended) {
        if (!info && !busy) {
          const candidate = await browser.readCookie()
          if (ended) return
          if (candidate) {
            try {
              const found = await accountInfo(candidate, abort.signal)
              if (ended) return
              info = found; cookie = candidate
              if (!confirmationOpened) {
                confirmationOpened = true
                await openPage(confirmationUrl, abort.signal)
              }
            } catch (error) { if (!(error instanceof SignedOut)) throw error }
          }
        }
        await delay(pollMs, undefined, { signal: abort.signal })
      }
    } catch (error) {
      if (!ended) finish({ type: "failed", error: error instanceof LoginError ? error.message : "读取官网登录结果失败，请重新登录" })
    }
  }
  return { url: "https://www.scnet.cn/ui/acm/index.html#/login?redirect=" + encodeURIComponent("https://www.scnet.cn/ui/console/index.html#/llm/token-plan"),
    opened: false, method: "auto",
    instructions: `请在 ${browser.name} 的官网页面登录。插件仅只读获取此浏览器当前资料（${browser.profile || "当前资料"}）中 scnet.cn 的会话；macOS 如弹出钥匙串提示，请允许本次读取。登录后自动打开账号及套餐确认页，无需复制 Cookie 或安装扩展。五分钟内有效。`,
    callback() { if (!started && !ended) { started = true; void watch() }; return result },
  }
}

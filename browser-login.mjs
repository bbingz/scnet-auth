import { createBrowserSession, LoginError } from "./browser-session.mjs"
import { setTimeout as delay } from "node:timers/promises"
import { date, hasCredits, planId, planName } from "./quota.mjs"

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

const expiry = row => date(row.maxExpireTime || row.expireTime || row.endTime)

// Read only existing credentials. Never create/reset a key or subscribe to a plan.
export async function accountInfo(cookie, signal) {
  const profile = await json(PATHS.profile, cookie, signal)
  if (!profile || typeof profile !== "object" || !(profile.id ?? profile.userId)) {
    throw new LoginError("超算互联网未返回账号身份，请重新登录")
  }
  const rows = await json(PATHS.plans, cookie, signal)
  if (!Array.isArray(rows)) throw new LoginError("套餐接口结构已变化，请更新插件后重试")
  const active = rows.filter(row => row && planId(row) && (!row.status || row.status === "enable") &&
    (!expiry(row) || Date.parse(expiry(row)) > Date.now()))
  if (!active.length) throw new LoginError("此账号没有可用的 Token Plan 套餐，请先在超算互联网开通或续订")
  if (new Set(active.map(planId)).size !== active.length) throw new LoginError("套餐标识重复，无法安全选择，请在超算互联网核对")
  // SCNet holds one Token Plan per account. An exhausted plan can sit beside
  // the next one bought, so prefer Credits left, then the plan ending first.
  const left = active.filter(hasCredits)
  const row = (left.length ? left : active).toSorted((a, b) =>
    (Date.parse(expiry(a)) || Infinity) - (Date.parse(expiry(b)) || Infinity))[0]
  const keyData = await json(PATHS.key, cookie, signal)
  const raw = typeof keyData === "string" ? keyData : keyData?.apiKey ?? keyData?.apikey ?? keyData?.key ?? keyData?.secret ?? keyData?.token
  if (typeof raw !== "string" || !raw.trim() || /[\s*…]/.test(raw.trim())) {
    throw new LoginError("未能读取现有套餐密钥，请在超算互联网 Token Plan 页面确认密钥可用后重试；插件不会创建或重置密钥")
  }
  let models = modelList(row.models)
  if (!models) {
    let catalog = []
    try { catalog = list(await json(PATHS.catalog, cookie, signal)) } catch { /* Try the plan's own code below. */ }
    let matches = catalog.filter(p => String(p.code) === String(row.resourceId))
    if (!matches.length && row.resourceId) {
      try { matches = list(await json(`${PATHS.catalog}&code=${encodeURIComponent(row.resourceId)}`, cookie, signal)).filter(p => String(p.code) === String(row.resourceId)) } catch { /* Reported below. */ }
    }
    if (matches.length === 1) models = modelList(matches[0].models)
  }
  if (!models) throw new LoginError("未能读取此套餐的模型列表，请稍后重新登录，或使用高级手动配置填写模型 ID")
  return { user: String(profile.userName || profile.id || profile.userId), userId: String(profile.id ?? profile.userId), key: raw.trim(),
    plan: { id: planId(row), name: planName(row), models } }
}

// Magpie opens the official website. Once SCNet accepts the current browser
// session, the account is saved; there is nothing else to confirm.
export async function startBrowserLogin({ timeoutMs = 300000, pollMs = 2500, browserSession } = {}) {
  const abort = new AbortController()
  const browser = browserSession ?? await createBrowserSession({ signal: abort.signal })
  let ended = false, started = false, resolve
  const result = new Promise(done => { resolve = done })
  const finish = value => {
    if (ended) return
    ended = true
    clearTimeout(timer)
    abort.abort()
    browser.clear()
    resolve(value)
  }
  const timer = setTimeout(() => finish({ type: "failed", error: "登录已超时，请重新登录超算互联网" }), timeoutMs)
  async function watch() {
    try {
      while (!ended) {
        const cookie = await browser.readCookie()
        if (ended) return
        if (cookie) {
          try {
            const info = await accountInfo(cookie, abort.signal)
            return finish({ type: "success", key: info.key, metadata: {
              email: `超算互联网 · ${info.user} · ${info.plan.name}`,
              scnetUserId: info.userId, models: info.plan.models, plan: "custom", quota: "console", consoleCookie: cookie, quotaPlan: info.plan.id,
            } })
          } catch (error) { if (!(error instanceof SignedOut)) throw error }
        }
        await delay(pollMs, undefined, { signal: abort.signal })
      }
    } catch (error) {
      if (!ended) finish({ type: "failed", error: error instanceof LoginError ? error.message : "读取官网登录结果失败，请重新登录" })
    }
  }
  return { url: "https://www.scnet.cn/ac/api/auth/loginSsoRedirect.action?originalUrl=" + encodeURIComponent("https://www.scnet.cn/ui/console/index.html#/llm/token-plan"),
    opened: false, method: "auto",
    instructions: `请在 ${browser.name} 的官网页面登录。插件仅只读获取此浏览器当前资料（${browser.profile || "当前资料"}）中 scnet.cn 的会话；macOS 如弹出钥匙串提示，请允许本次读取。登录后自动读取账号、现有套餐密钥和额度并完成连接，无需复制 Cookie 或安装扩展。五分钟内有效。`,
    callback() { if (!started && !ended) { started = true; void watch() }; return result },
  }
}

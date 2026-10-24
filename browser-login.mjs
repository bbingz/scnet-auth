import { readFile } from "node:fs/promises"
import { setTimeout as delay } from "node:timers/promises"
import { date, planId, planName } from "./quota.mjs"

const ORIGIN = "https://www.scnet.cn"
const LOGIN = `${ORIGIN}/ui/acm/index.html#/login?redirect=${encodeURIComponent(`${ORIGIN}/ui/console/index.html`)}`
const PATHS = {
  profile: "/user/users/current-user-info",
  plans: "/charge/account/currentuser/tokenplan/list",
  key: "/llm/api-key/token-plan/query",
  catalog: "/llm/api/package/overview?packageType=TokenPlan",
}

class LoginError extends Error {}
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

async function launchBrowser() {
  const { chromium } = await import("playwright-core")
  for (const channel of ["chrome", "msedge", undefined]) {
    try {
      return await chromium.launch({ channel, headless: false, timeout: 15000, chromiumSandbox: true })
    } catch { /* Try another installed browser without downloading one. */ }
  }
  throw new LoginError("无法打开登录窗口。请安装 Chrome 或 Edge 后重试，或使用“手动配置 API Key”")
}

// Each attempt owns a fresh browser context; existing browser profiles are never read.
export async function startBrowserLogin({ launch = launchBrowser, timeoutMs = 300000, pollMs = 1500 } = {}) {
  let browser
  try { browser = await launch() } catch (error) {
    throw new Error(error instanceof LoginError ? error.message : "无法打开超算互联网登录窗口，请重试")
  }
  const abort = new AbortController()
  let expired = false, completed = false
  const timer = setTimeout(() => { expired = true; abort.abort() }, timeoutMs)
  browser.on("disconnected", () => abort.abort())
  const stopped = new Promise(resolve => abort.signal.addEventListener("abort", () => resolve({ type: "failed", error: expired ? "登录已超时，请重新登录超算互联网" : "登录已取消，原账号保持不变" }), { once: true }))
  let context
  try {
    context = await browser.newContext()
    const page = await context.newPage()
    await page.goto(LOGIN, { waitUntil: "domcontentloaded", timeout: 30000 })
  } catch {
    clearTimeout(timer)
    await browser.close().catch(() => {})
    throw new Error("无法加载超算互联网登录页，请检查网络后重试")
  }
  const work = async () => {
    let info, cookie
    while (!abort.signal.aborted) {
      cookie = (await context.cookies(`${ORIGIN}/acx/`)).map(c => `${c.name}=${c.value}`).join("; ")
      if (cookie) {
        try { info = await accountInfo(cookie, abort.signal); break } catch (error) {
          if (!(error instanceof SignedOut)) throw error
        }
      }
      await delay(pollMs, undefined, { signal: abort.signal })
    }
    if (!info || abort.signal.aborted) return
    const page = await context.newPage()
    // This confirmation is an offline page, with no SCNet script or credential in it.
    await page.route("**/*", route => route.abort())
    let choose
    const selection = new Promise(resolve => { choose = resolve })
    await page.exposeFunction("scnetChoose", (id, models) => {
      if (completed || abort.signal.aborted) return { error: "此登录已结束，请返回 Magpie 重试" }
      const plan = info.choices.find(p => p.id === id)
      const selectedModels = plan?.models || modelList(models)
      if (!plan || !selectedModels) return { error: "请选择套餐，并填写该套餐支持的准确模型 ID" }
      completed = true
      choose({ plan, models: selectedModels })
      return { ok: true }
    })
    await page.setContent(await readFile(new URL("./signin.html", import.meta.url), "utf8"))
    await page.evaluate(data => window.scnetShow(data), { user: info.user, choices: info.choices })
    await page.bringToFront()
    const { plan, models } = await selection
    const duplicateName = info.choices.filter(p => p.name === plan.name).length > 1
    return { type: "success", key: info.key, metadata: {
      email: `超算互联网 · ${info.user} · ${plan.name}${duplicateName ? ` · ${plan.id}` : ""}`,
      scnetUserId: info.userId, models, plan: "custom", quota: "console",
      consoleCookie: cookie, quotaPlan: plan.id,
    } }
  }
  const result = Promise.race([work().catch(error => ({ type: "failed", error: error instanceof LoginError ? error.message : "登录未完成，请重新登录超算互联网" })), stopped])
    .finally(async () => {
      clearTimeout(timer)
      abort.abort()
      await browser.close().catch(() => {})
    })
  return { url: LOGIN, opened: true, method: "auto",
    instructions: "请在已打开的独立窗口登录超算互联网，再确认要连接的套餐。账号、现有密钥和额度会自动导入，无需复制 Cookie。关闭窗口即可取消。",
    callback: () => result,
  }
}

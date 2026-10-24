// SCNet's console uses a session cookie, separate from the inference API key.
const URL = "https://www.scnet.cn/acx/charge/account/currentuser/tokenplan/list"
const number = (row, fields) => {
  for (const field of fields) {
    const raw = row[field]
    if (typeof raw !== "number" && typeof raw !== "string") continue
    if (typeof raw === "string" && !raw.trim()) continue
    const value = Number(raw)
    if (Number.isFinite(value) && value >= 0) return value
  }
}
const format = (value) => value.toLocaleString("en-US", { maximumFractionDigits: 6 })
export const planId = (row) => String(row.resourceAccountId ?? "")
export const planName = (row) => row.name || row.resourceName || row.packageName || "Token Plan"

export function date(value) {
  if (!value || typeof value !== "string") return undefined
  // Console timestamps without an offset are China Standard Time.
  const text = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(value)
    ? value.replace(" ", "T") + "+08:00" : value
  const ms = Date.parse(text)
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined
}

export function cookieError(value) {
  if (typeof value !== "string" || !value.trim()) return "请粘贴 SCNet 控制台请求的 Cookie，或返回选择暂不查询额度"
  if (/[\r\n]/.test(value) || !/^[^\s=;:]+=[^;]+/.test(value.trim()) || value.length > 16384) {
    return "只填写 Cookie 请求头的值（名称=值; 名称=值），不要包含 Cookie:、换行或整段请求"
  }
}

export async function plans(cookie) {
  const invalid = cookieError(cookie)
  if (invalid) throw new Error(invalid)
  let response
  try {
    response = await fetch(URL, {
      headers: { Accept: "application/json", Cookie: cookie.trim() },
      redirect: "error", signal: AbortSignal.timeout(10000),
    })
  } catch {
    throw new Error("额度查询网络失败或超时，请稍后刷新；模型调用不受影响")
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error("控制台会话已失效，请重新连接额度查询；模型 API Key 无需更换")
  }
  if (!response.ok) throw new Error(`额度服务暂不可用（HTTP ${response.status}），请稍后刷新`)
  let body
  try { body = await response.json() } catch { throw new Error("额度接口返回了无法识别的数据，请稍后刷新") }
  if (["401", "403"].includes(String(body?.code))) {
    throw new Error("控制台会话已失效，请重新连接额度查询；模型 API Key 无需更换")
  }
  if (String(body?.code) !== "0") throw new Error("额度服务返回异常，请在 SCNet 控制台核对")
  const rows = body.data
  if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== "object" || Array.isArray(row))) {
    throw new Error("额度接口结构已变化，请在 SCNet 控制台核对")
  }
  return rows
}

export async function usage(getAuth) {
  const auth = await getAuth()
  const md = auth?.metadata ?? {}
  // A console failure must never mark a valid inference key as signed out.
  const base = { user: md.email || "", signIn: "kept" }
  if (auth?.type !== "api" || md.quota !== "console" || !md.consoleCookie || !md.quotaPlan) {
    return { ...base, error: "未连接控制台额度 · 重新登录可启用查询" }
  }
  try {
    const matches = (await plans(md.consoleCookie)).filter(row => planId(row) === md.quotaPlan)
    if (matches.length !== 1) throw new Error("找不到唯一的已选套餐，请重新连接额度并选择套餐")
    const row = matches[0]
    const total = number(row, ["totalAmount", "All", "planCredits", "monthlyCredits", "totalCredits"])
    const used = number(row, ["usedAmount", "used", "usedCredits", "consumeCredits", "consumedCredits", "consume", "usage"])
    if (total === undefined || total <= 0 || used === undefined) {
      throw new Error("套餐未返回完整 Credits 用量，请在 SCNet 控制台核对")
    }
    const until = date(row.maxExpireTime || row.expireTime || row.endTime)
    const plan = String(planName(row))
    if (until && Date.parse(until) <= Date.now()) return { ...base, plan, until, error: "所选套餐已到期，请在 SCNet 控制台核对续订状态" }
    if (row.status && row.status !== "enable") return { ...base, plan, until, error: "所选套餐当前未启用，请在 SCNet 控制台核对" }
    const remaining = Math.max(0, total - used)
    return {
      ...base, plan, until, balance: `${format(remaining)} Credits`,
      windows: [{
        name: "套餐 Credits", used: used / total * 100,
        amount: used, limit: total, unit: "Credits",
        display: `已用 ${format(used)} / ${format(total)} · 剩余 ${format(remaining)} Credits`,
        resetsAt: date(row.resetTime || row.resetAt || row.nextResetTime || row.monthResetTime),
      }],
    }
  } catch (error) {
    return { ...base, error: error.message }
  }
}

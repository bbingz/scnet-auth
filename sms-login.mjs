const ORIGIN = "https://www.scnet.cn"
export class LoginError extends Error {}

// Keep only the cookies issued by SCNet, respecting their domain, path and expiry.
// Nothing from this jar is sent to the loopback page or a third-party origin.
export function createSMSLogin(signal) {
  const cookies = new Map()
  let sent = false, nextSend = 0
  const cookieFor = path => [...cookies.values()].filter(c =>
    c.expires > Date.now() && (path === c.path || path.startsWith(c.path.endsWith("/") ? c.path : `${c.path}/`)))
    .sort((a, b) => b.path.length - a.path.length).map(c => `${c.name}=${c.value}`).join("; ")

  async function request(path, fields) {
    let response, body
    try {
      response = await fetch(`${ORIGIN}${path}`, {
        method: "POST", redirect: "error",
        headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", Cookie: cookieFor(path) },
        body: new URLSearchParams(fields), signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
      })
      if (!response.ok) throw new LoginError(`超算互联网登录服务暂不可用（HTTP ${response.status}），请稍后重试`)
      for (const raw of response.headers.getSetCookie()) {
        const [pair, ...attributes] = raw.split(";")
        const at = pair.indexOf("=")
        if (at < 1) continue
        const name = pair.slice(0, at).trim(), value = pair.slice(at + 1).trim()
        if (!/^[!#$%&'*+.^_`|~\w-]+$/.test(name) || /[\x00-\x20\x7f;,]/.test(value)) continue
        const attrs = Object.fromEntries(attributes.map(a => { const i = a.indexOf("="); return [a.slice(0, i < 0 ? undefined : i).trim().toLowerCase(), i < 0 ? "" : a.slice(i + 1).trim()] }))
        const domain = (attrs.domain || "www.scnet.cn").replace(/^\./, "").toLowerCase()
        if (!["scnet.cn", "www.scnet.cn"].includes(domain)) continue
        const scope = attrs.path?.startsWith("/") ? attrs.path : path.slice(0, path.lastIndexOf("/")) || "/"
        let expires = attrs.expires ? Date.parse(attrs.expires) : Infinity
        if (Number.isNaN(expires)) expires = Infinity
        if (/^-?\d+$/.test(attrs["max-age"] ?? "")) expires = Date.now() + Number(attrs["max-age"]) * 1000
        const id = `${name}\n${scope}`
        if (expires <= Date.now()) cookies.delete(id)
        else cookies.set(id, { name, value, path: scope, expires })
      }
      body = await response.json()
    } catch (error) {
      if (error instanceof LoginError) throw error
      throw new LoginError("连接超算互联网登录服务失败，请检查网络后重试")
    }
    if (String(body?.code) !== "0") {
      const messages = {
        "1005": "操作过于频繁，请稍后重试", "1006": "短信验证码不正确，请重新输入",
        "1009": "验证码已失效，请重新获取", "1014": "登录验证失败，请核对验证码后重试",
        "1022": "手机号尚未注册，请先在超算互联网官网注册", "2022": "请求次数过多，请稍后重试",
      }
      throw new LoginError(messages[String(body?.code)] || "超算互联网未能完成验证，请稍后重试或使用手动配置")
    }
  }

  return {
    async sendCode(phone) {
      if (signal.aborted) throw new LoginError("本次登录已结束，请返回 Magpie 重新登录")
      if (Date.now() < nextSend) throw new LoginError("请等待 60 秒后再获取验证码")
      if (typeof phone !== "string") throw new LoginError("请输入正确的手机号")
      const normalized = phone.trim().replace(/[ -]/g, "")
      const number = /^1\d{10}$/.test(normalized) ? `+86${normalized}` : normalized
      if (!/^\+[1-9]\d{6,14}$/.test(number)) throw new LoginError("请输入 11 位手机号，或带国家区号的完整号码")
      // One user click sends at most one SMS. Never retry delivery automatically.
      nextSend = Date.now() + 60000
      sent = false
      cookies.clear()
      await request("/ac/api/auth/sendDesktopClientPhoneCode.action", { phoneNum: number })
      sent = true
      return { resendIn: 60 }
    },
    async login(code) {
      if (signal.aborted) throw new LoginError("本次登录已结束，请返回 Magpie 重新登录")
      if (!sent) throw new LoginError("请先获取短信验证码")
      if (typeof code !== "string" || !/^\d{6}$/.test(code.trim())) throw new LoginError("请输入 6 位短信验证码")
      await request("/ac/api/auth/loginDesktopClientByPhoneCode.action", { messageCode: code.trim(), isSevenDaysValidity: "true" })
      const cookie = cookieFor("/acx/")
      if (!cookie) throw new LoginError("超算互联网未返回可用会话，请重新登录")
      sent = false
      return cookie
    },
    clear() { sent = false; cookies.clear() },
  }
}

import { cookieError, date, planId, planName, plans, usage } from "./quota.mjs"
import { startBrowserLogin } from "./browser-login.mjs"

const ID = "scnet-token-plan"
const BASE = "https://api.scnet.cn/api/llm/v1"
const DEFAULT_MODEL = "DeepSeek-V4.1-Flash-1017-Event"
const NPM = "@ai-sdk/openai-compatible"

function modelIds(value) {
  if (value === undefined || value === "") return [DEFAULT_MODEL]
  if (typeof value !== "string") throw new Error("模型 ID 必须是逗号或换行分隔的文本")
  if (!value.trim()) return [DEFAULT_MODEL]
  const ids = value.split(/[,，\n]/).map((id) => id.trim())
  if (ids.some((id) => !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(id))) {
    throw new Error("请填写准确的模型 ID，以逗号或换行分隔，不要留空项")
  }
  return [...new Set(ids)]
}

function requireKey(auth) {
  if (auth?.type !== "api" || typeof auth.key !== "string" || !auth.key.trim()) {
    throw new Error("Sign in with your SCNet Token Plan API key")
  }
  return auth.key.trim()
}

function model(id, known) {
  return {
    ...known,
    id,
    name: known?.name ?? id,
    providerID: ID,
    api: { id, url: BASE, npm: NPM },
    // SCNet's public plan documentation does not specify these limits.
    limit: known?.limit ?? { context: 0, output: 0 },
    capabilities: known?.capabilities ?? {
      reasoning: id.startsWith("DeepSeek-V4"), toolcall: true,
      input: { text: true }, output: { text: true },
    },
  }
}

export async function SCNetAuthPlugin() {
  return {
    async config(config) {
      config.provider ??= {}
      config.provider[ID] ??= {
        name: "超算互联网 · SCNet Token Plan",
        npm: NPM,
        api: BASE,
        models: {
          [DEFAULT_MODEL]: {
            name: DEFAULT_MODEL,
            limit: { context: 0, output: 0 },
            reasoning: true,
            tool_call: true,
          },
        },
      }
    },
    auth: {
      provider: ID,
      // A self-contained mark also works when the app cannot reach image hosts.
      icon: "data:image/svg+xml;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#1259c3"/><path d="M18 19h28v8H26v5h20v13H18v-8h20v-5H18z" fill="white"/></svg>').toString("base64"),
      methods: [{ type: "oauth", label: "浏览器登录超算互联网（推荐）", authorize: () => startBrowserLogin() }, signInMethod()],
      usage,
      async loader(getAuth) {
        requireKey(await getAuth())
        return {
          baseURL: BASE,
          // The actual key is attached below, after any client-supplied headers.
          apiKey: "scnet-plugin",
          async fetch(input, init) {
            const request = new Request(input, init)
            const url = new URL(request.url)
            if (url.origin !== "https://api.scnet.cn" ||
                url.pathname !== "/api/llm/v1/chat/completions" ||
                url.username || url.password || url.hash) {
              throw new Error("Refusing a request outside the SCNet Chat Completions endpoint")
            }
            request.signal.throwIfAborted()
            const key = requireKey(await getAuth())
            const headers = new Headers(request.headers)
            for (const name of ["authorization", "x-api-key", "x-goog-api-key", "cookie", "proxy-authorization"]) {
              headers.delete(name)
            }
            headers.set("authorization", `Bearer ${key}`)
            // Preserve body, tool calls, stream and cancellation. Never follow a
            // redirect with credentials, or buffer/parse the upstream response.
            return fetch(new Request(request, { headers, redirect: "error" }))
          },
        }
      },
    },
    provider: {
      id: ID,
      async models(provider, { auth } = {}) {
        if (auth?.type !== "api") return provider.models
        // /models is documented as a platform catalog, not plan entitlements.
        // Only expose IDs the account owner selected from their plan console.
        return Object.fromEntries(modelIds(auth.metadata?.plan === "event" ? undefined : auth.metadata?.models).map((id) => [id, model(id, provider.models?.[id])]))
      },
    },
  }
}

function signInMethod() {
  const prompts = [
    {
      type: "text", key: "label", message: "账号备注 · 每个账号请使用不同名称（同名登录会更新原账号）",
      placeholder: "例如：主账号 / 工作账号 / DeepSeek 活动套餐",
      validate: value => typeof value !== "string" || !value.trim() || value.trim().length > 60 || /[\x00-\x1f\x7f]/.test(value)
        ? "请输入 1–60 字的账号备注，不要填写 API Key" : undefined,
    },
    {
      type: "select", key: "plan", message: "选择模型配置 · 以你的 Token Plan 控制台为准",
      options: [
        { label: "DeepSeek 活动套餐（Event）", value: "event", hint: DEFAULT_MODEL },
        { label: "其他套餐 / 自定义模型", value: "custom", hint: "填写控制台中属于此套餐的准确模型 ID" },
      ],
    },
    {
      type: "text", key: "models", message: "套餐模型 ID · 支持中英文逗号或换行分隔",
      placeholder: "从控制台复制完整 ID，保留日期及 Event 后缀",
      when: { key: "plan", op: "eq", value: "custom" },
      validate(value) {
        if (typeof value !== "string" || !value.trim()) return "请填写至少一个套餐模型 ID"
        try { modelIds(value) } catch (error) { return error.message }
      },
    },
    {
      type: "select", key: "quota", message: "剩余额度 · 查询 Credits 需要单独连接 SCNet 控制台会话",
      options: [
        { label: "连接额度查询", value: "console", hint: "使用控制台 Cookie 读取剩余 Credits 与到期时间；不消耗推理额度" },
        { label: "暂不查询额度", value: "skip", hint: "先使用模型，之后可重新登录补充；API Key 无法单独读取余额" },
      ],
    },
    {
      type: "password", key: "consoleCookie", message: "控制台 Cookie · 仅用于额度查询，保存在本机账号凭据中",
      placeholder: "SCNet 控制台 → 开发者工具 → Network → tokenplan/list → Cookie 的值",
      when: { key: "quota", op: "eq", value: "console" }, validate: cookieError,
    },
  ]
  return {
    type: "api", label: "手动配置 API Key（高级 / 无桌面环境）",
    placeholder: "粘贴此套餐的专用 Key（非按量付费 Key）", prompts,
    async ask(inputs = {}) {
      for (const p of prompts) {
        if (p.key in inputs || (p.when && inputs[p.when.key] !== p.when.value)) continue
        return p
      }
      if (inputs.quota === "console" && !("quotaPlan" in inputs)) {
        let rows = [], message = "选择与此 API Key 对应的套餐 · 不会合并其他套餐的额度"
        try {
          rows = (await plans(inputs.consoleCookie)).filter(row => planId(row))
          if (!rows.length) message = "控制台未返回套餐，可先跳过额度查询"
        } catch (error) { message = error.message }
        return {
          type: "select", key: "quotaPlan", message,
          options: [
            ...rows.map(row => ({ label: `${planName(row)} · ${planId(row)}`, value: planId(row), hint: `到期：${date(row.maxExpireTime || row.expireTime || row.endTime) || "未提供"}` })),
            { label: "跳过额度查询，先连接模型", value: "skip" },
          ],
        }
      }
      return null
    },
    async authorize(inputs) {
      for (const p of prompts) {
        if (p.when && inputs[p.when.key] !== p.when.value) continue
        const error = p.validate?.(inputs[p.key])
        if (error) return { type: "failed", error }
      }
      if (!["event", "custom"].includes(inputs.plan) || !["console", "skip"].includes(inputs.quota)) {
        return { type: "failed", error: "请完成套餐与额度查询选项" }
      }
      if (inputs.quota === "console" && !inputs.quotaPlan) return { type: "failed", error: "请选择要查询额度的套餐" }
      const connected = inputs.quota === "console" && inputs.quotaPlan !== "skip"
      return { type: "success", metadata: {
        email: `超算互联网 · ${inputs.label.trim()}`,
        models: inputs.plan === "event" ? DEFAULT_MODEL : modelIds(inputs.models).join(","),
        quota: connected ? "console" : "skip",
        consoleCookie: connected ? inputs.consoleCookie.trim() : "",
        quotaPlan: connected ? inputs.quotaPlan : "",
      } }
    },
  }
}

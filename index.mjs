const ID = "scnet-token-plan"
const BASE = "https://api.scnet.cn/api/llm/v1"
const DEFAULT_MODEL = "DeepSeek-V4.1-Flash-1017-Event"
const NPM = "@ai-sdk/openai-compatible"

function modelIds(value) {
  if (value === undefined || value === "") return [DEFAULT_MODEL]
  if (typeof value !== "string") throw new Error("Model IDs must be comma-separated text")
  if (!value.trim()) return [DEFAULT_MODEL]
  const ids = value.split(",").map((id) => id.trim())
  if (ids.some((id) => !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(id))) {
    throw new Error("Use exact SCNet model IDs separated by commas, without empty entries")
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
        name: "SCNet Token Plan",
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
      methods: [{
        type: "api",
        label: "SCNet Token Plan API key",
        placeholder: "Your dedicated Token Plan key",
        prompts: [{
          type: "text",
          key: "models",
          message: "Model IDs from your Token Plan console (comma-separated; blank uses the DeepSeek Event plan)",
          placeholder: DEFAULT_MODEL,
          validate(value) {
            try { modelIds(value) } catch (error) { return error.message }
          },
        }],
      }],
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
        return Object.fromEntries(modelIds(auth.metadata?.models).map((id) => [id, model(id, provider.models?.[id])]))
      },
    },
  }
}

import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { createHash, randomUUID } from "node:crypto"

const ID = "scnet-token-plan"
const fingerprint = value => createHash("sha256").update(JSON.stringify(value)).digest("hex")

// Magpie's prompt hook runs outside a sign-in account's scope. Keep this
// management flow in that hook: it never reaches credential authorization.
// The host owns all writes, locking, backups and auth-cache invalidation.
export function accountManagement({ directory, client }) {
  const choices = new Map()
  async function accounts() {
    try {
      const all = JSON.parse(await readFile(join(directory, "plugin-auth.json"), "utf8"))
      if (!all || typeof all !== "object" || Array.isArray(all)) throw new Error()
      return Object.fromEntries(Object.entries(all).filter(([key]) => key === ID || key.startsWith(ID + "#")))
    } catch (error) {
      if (error.code === "ENOENT") return {}
      throw new Error("无法读取已保存账号，未做任何修改；请关闭管理后重试")
    }
  }
  const done = label => ({ type: "select", key: "done", message: `已移除「${label}」。其他账号与官网 Key 不变。点击「取消 / Cancel」关闭管理，重新打开供应商查看。`, options: [] })
  return {
    type: "api", keyless: true, label: "管理已保存账号（移除旧 KEY）",
    async ask(inputs = {}) {
      for (const [token, choice] of choices) if (choice.until < Date.now()) choices.delete(token)
      if (!inputs.account) {
        const stored = await accounts()
        const options = Object.entries(stored).sort(([a], [b]) => a.localeCompare(b)).map(([key, auth], i) => {
          const label = String(auth?.metadata?.email || auth?.accountId || `旧 API Key${typeof auth?.key === "string" && auth.key.length >= 12 ? " …" + auth.key.slice(-4) : ""}`).slice(0, 160)
          const token = randomUUID()
          choices.set(token, { key, label, fingerprint: fingerprint(auth), until: Date.now() + 300000 })
          return { label: `${label} · 记录 ${i + 1}`, value: token, hint: "仅移除这条本机保存记录，不撤销官网 Key" }
        })
        while (choices.size > Math.max(100, options.length)) choices.delete(choices.keys().next().value)
        return { type: "select", key: "account", message: options.length ? "选择要移除的超算互联网账号 / 旧 KEY" : "没有已保存的超算互联网账号，点击「取消 / Cancel」关闭管理", options }
      }
      const selected = choices.get(inputs.account)
      if (!selected) throw new Error("账号列表已过期，请重新打开账号管理")
      if (!inputs.confirm) {
        selected.confirm ??= randomUUID()
        return { type: "select", key: "confirm", message: `移除「${selected.label}」？只清除此账号在 Magpie 保存的 Key 与 Cookie，不撤销官网 Key。`, options: [{ label: "确认移除这个账号", value: selected.confirm }] }
      }
      if (!selected.confirm || inputs.confirm !== selected.confirm) throw new Error("请先选择账号并确认移除")
      // Magpie asks once while accepting the answer and again while drawing
      // the next prompt. Concurrent/repeated reads share exactly one removal.
      selected.result ??= (async () => {
        const current = await accounts()
        if (!Object.hasOwn(current, selected.key) || fingerprint(current[selected.key]) !== selected.fingerprint) {
          throw new Error("账号已变化，请重新打开管理并确认，未移除任何账号")
        }
        try { await client.auth.remove({ path: { id: selected.key } }) }
        catch { throw new Error("移除未完成，请关闭管理后重新读取账号") }
        if (Object.hasOwn(await accounts(), selected.key)) throw new Error("账号仍在保存列表中，请关闭管理后重试")
        return done(selected.label)
      })()
      return selected.result
    },
    async authorize() {
      return { type: "failed", error: "账号管理不用于登录，请选择账号并确认移除" }
    },
  }
}

import assert from "node:assert/strict"
import { test } from "node:test"
import { startBrowserLogin } from "../browser-login.mjs"

test("sign-in opens SCNet's official page in the default browser, never a local login form", async () => {
  const browserSession = { name: "Fixture Chrome", readCookie: async () => "", clear() {} }
  const auth = await startBrowserLogin({ browserSession, timeoutMs: 30, pollMs: 5 })
  try {
    assert.equal(auth.opened, false)
    assert.equal(new URL(auth.url).origin, "https://www.scnet.cn")
    assert.match(auth.url, /login/)
    assert.equal(auth.method, "auto")
    assert.match(auth.instructions, /官网/)
  } finally { await auth.callback() }
})

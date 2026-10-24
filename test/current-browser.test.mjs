import assert from "node:assert/strict"
import { test } from "node:test"
import { EventEmitter } from "node:events"
import { startBrowserLogin } from "../browser-login.mjs"

test("sign-in delegates a loopback page to Magpie's normal browser opener", async () => {
  // The previous implementation receives a fake browser so this regression
  // never launches an actual isolated browser, even before the fix.
  const browser = new EventEmitter()
  browser.newContext = async () => ({ cookies: async () => [], newPage: async () => ({ goto: async () => {} }) })
  browser.close = async () => browser.emit("disconnected")
  const auth = await startBrowserLogin({ launch: async () => browser, timeoutMs: 100 })
  try {
    assert.equal(auth.opened, false)
    assert.match(auth.url, /^http:\/\/127\.0\.0\.1:\d+\/#/)
    assert.equal(auth.method, "auto")
  } finally { await auth.callback() }
})

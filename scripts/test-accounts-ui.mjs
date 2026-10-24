// Optional real-host browser check. Playwright is test tooling only; set
// NODE_PATH to an external installation, as Magpie's own UI tests do.
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { mkdir } from "node:fs/promises"
import { resolve } from "node:path"

export async function checkAccountUI({ web, key, readAuth }) {
  const { chromium, webkit } = createRequire(import.meta.url)("playwright")
  const out = resolve("output/playwright")
  await mkdir(out, { recursive: true })
  for (const [name, engine, width, user] of [["chromium", chromium, 1100, "Fixture main"], ["webkit", webkit, 420, "Fixture browser"]]) {
    const browser = await engine.launch()
    try {
      const page = await browser.newPage({ viewport: { width, height: 950 }, reducedMotion: "reduce" })
      page.setDefaultTimeout(10000)
      const errors = []
      page.on("pageerror", e => errors.push(e.message))
      await page.goto(`${web}/?k=${key}&view=providers&edit=scnet-token-plan`)
      const open = async () => {
        await page.locator(".accts button.acc.add").click()
        await page.getByRole("button", { name: "管理已保存账号（移除旧 KEY）", exact: true }).click()
        await page.locator(".signing").getByRole("button", { name: new RegExp(user) }).click()
        await page.getByRole("button", { name: "确认移除这个账号", exact: true }).waitFor()
      }
      const before = await readAuth()
      await open()
      await page.locator(".signing").getByRole("button", { name: /^(Cancel|取消)$/ }).click()
      assert.deepEqual(await readAuth(), before)
      await open()
      await page.locator(".signing").screenshot({ path: resolve(out, `accounts-${name}-confirm.png`) })
      await page.getByRole("button", { name: "确认移除这个账号", exact: true }).click()
      await page.locator(".signing .n", { hasText: "已移除" }).waitFor()
      await page.locator(".signing").screenshot({ path: resolve(out, `accounts-${name}-done.png`) })
      const expected = Object.fromEntries(Object.entries(before).filter(([, a]) => !a.metadata?.email?.includes(user)))
      assert.equal(Object.keys(expected).length, Object.keys(before).length - 1)
      assert.deepEqual(await readAuth(), expected, "only the confirmed account is removed")
      await page.locator(".signing").getByRole("button", { name: /^(Cancel|取消)$/ }).click()
      await page.reload()
      if (name === "chromium") {
        await page.locator('.accts .acc[data-account-id]', { hasText: "Fixture browser" }).waitFor()
        assert.equal(await page.locator('.accts .acc[data-account-id]', { hasText: "Fixture main" }).count(), 0)
      } else {
        await page.locator('.row.provider:has-text("SCNet")').waitFor({ state: "detached" })
      }
      assert.deepEqual(errors, [])
      console.log(`PASS ${name}: plugin-native management, cancel, confirmed removal, provider refresh (${width}px)`)
    } finally { await browser.close() }
  }
}

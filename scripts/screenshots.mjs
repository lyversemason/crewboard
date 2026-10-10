// Regenerates the README screenshots from a running preview server.
//   npm run build && npx vite preview --port 10003 &
//   npm run screenshots
// Uses the system Chromium (set CHROMIUM_PATH to override).

import { chromium } from 'playwright-core'

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:10003/'
const OUT = 'docs/screenshots'
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium' })

async function page(width = 1440, height = 900) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: 'dark' })
  return ctx.newPage()
}

async function shot(name, hash, { width, height, before } = {}) {
  const p = await page(width, height)
  await p.goto(BASE + '#/' + hash)
  if (before) await before(p)
  await p.waitForTimeout(250)
  await p.screenshot({ path: `${OUT}/${name}.png` })
  await p.context().close()
}

await shot('1-login', '', { height: 760 })
await shot('2-calendar', 'admin/calendar')
await shot('6-admin', 'admin/dashboard', { height: 760 })
await shot('5-coach', '', {
  width: 430,
  height: 820,
  // The login page pre-selects the busiest coach; open them.
  before: async (p) => p.locator('.coach-card .role-cta').click(),
})

// Session with a recorded travel-time override.
await shot('3-session-panel', 'tm-lou/calendar', {
  height: 860,
  before: async (p) => p.locator('.event', { has: p.locator('.flag.override') }).first().click(),
})

// Override dialog: put an assistant alone on a session -> "No certified Lead Coach".
await shot('4-override-dialog', 'tm-lou/calendar', {
  height: 860,
  before: async (p) => {
    for (const card of await p.locator('.event:not(.closed)').all()) {
      await card.click()
      const free = p.locator('select[aria-label="Add a coach"] option', { hasText: '✓ free' }).filter({ hasText: '(assistant)' })
      if ((await free.count()) === 0) {
        await p.keyboard.press('Escape')
        continue
      }
      for (const btn of await p.locator('.crew-list .icon-btn').all()) await btn.click()
      await p.locator('select[aria-label="Add a coach"]').selectOption(await free.first().getAttribute('value'))
      await p.getByRole('button', { name: 'Save crew' }).click()
      return
    }
  },
})

// Sales intake: blocked, then covered after taking a suggested slot.
{
  const p = await page(1440, 1000)
  await p.goto(BASE + '#/rep-east/intake')
  await p.getByLabel('Center / facility name').fill('Acorn Hill Preschool')
  await p.getByLabel('ZIP').selectOption('40205')
  const sat = await p.evaluate(() => {
    const d = new Date()
    d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7))
    return d.toISOString().slice(0, 10)
  })
  await p.getByLabel('First session').fill(sat)
  await p.getByLabel('Group 1 kids').fill('40')
  await p.waitForTimeout(250)
  await p.screenshot({ path: `${OUT}/7-intake-blocked.png` })
  await p.locator('.suggestion').first().click()
  await p.getByLabel('Group 1 kids').fill('22')
  await p.waitForTimeout(250)
  await p.screenshot({ path: `${OUT}/8-intake-covered.png` })
}

await browser.close()
console.log('Screenshots written to', OUT)

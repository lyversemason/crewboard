// Regenerates the README screenshots from a running preview server.
//   npm run build && npx vite preview --port 10003 &
//   npm run screenshots
// Uses the system Chromium (set CHROMIUM_PATH to override).

import { chromium } from 'playwright-core'

const BASE = process.env.BASE_URL ?? 'http://localhost:10003/'
const OUT = 'docs/screenshots'
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium' })

async function page(width = 1440, height = 900) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: 'light' })
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
await shot('2-calendar', 'tm-lou/calendar')
await shot('9-staff', 'tm-lou/staff', { height: 760 })
await shot('6-admin', 'admin/dashboard', { height: 760 })
await shot('5-coach', '', {
  width: 430,
  height: 820,
  // The login page pre-selects the busiest coach; open them.
  before: async (p) => p.locator('.coach-card .role-cta').click(),
})

// Session with its program cycle and a coach who hasn't confirmed.
await shot('3-session-panel', 'tm-lou/calendar', {
  height: 900,
  before: async (p) => p.locator('.event', { hasText: 'hasn’t confirmed' }).first().click(),
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
      while (await p.locator('.staff-list .icon-btn').count()) await p.locator('.staff-list .icon-btn').first().click()
      await p.locator('select[aria-label="Add a coach"]').selectOption(await free.first().getAttribute('value'))
      await p.locator('button.save-override').click()
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
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  await p.getByLabel('Starting').fill(sat)
  await p.getByRole('button', { name: 'Tue', exact: true }).click()
  await p.getByRole('button', { name: 'Sat', exact: true }).click()
  await p.getByLabel('Cycle price ($)').fill('1440')
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

// Regenerates the README screenshots of the public demo from a running preview server.
//   npm run build && npx vite preview --port 10003 &
//   npm run screenshots          (BASE_URL=http://127.0.0.1:<port>/ for another port)
// The database version's screenshots come from scripts/screenshots-live.mjs.
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
  // The login page opens on the busiest coach's territory; open the first coach.
  before: async (p) => p.locator('.coach-pick a').first().click(),
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

// Sales intake: a Tuesday + Thursday program, blocked, then covered.
// The address is typed by hand so the screenshots don't depend on the live address search.
{
  const p = await page(1440, 1000)
  await p.goto(BASE + '#/rep-east/intake')
  await p.getByLabel('Center / facility name').fill('Acorn Hill Preschool')
  await p.getByRole('button', { name: /Enter the address by hand/ }).click()
  await p.getByLabel('Street address').fill('1234 maple ridge drive')
  await p.getByLabel('City').fill('Louisville')
  await p.getByLabel('State').fill('KY')
  await p.getByLabel('ZIP').fill('40205')
  await p.getByRole('button', { name: 'Thu', exact: true }).click()
  await p.getByLabel('Cycle price ($)').fill('2880')
  // Saturdays with 40 kids: too few coaches work Saturdays (blocked in every week of demo data).
  await p.getByRole('button', { name: 'Sat', exact: true }).click()
  await p.getByLabel('Saturday group 1 kids').fill('40')
  await p.locator('legend', { hasText: 'Program terms' }).scrollIntoViewIfNeeded()
  await p.locator('.verdict.no').waitFor()
  await p.screenshot({ path: `${OUT}/7-intake-blocked.png` })
  // Back to Tuesdays and Thursdays: covered.
  await p.getByRole('button', { name: 'Sat', exact: true }).click()
  await p.locator('legend', { hasText: 'Program terms' }).scrollIntoViewIfNeeded()
  await p.locator('.verdict.yes').waitFor()
  await p.screenshot({ path: `${OUT}/8-intake-covered.png` })
}

// Accounts: invite a coach; their panel shows the demo's on-screen invitation email.
await shot('10-accounts', 'admin/accounts', {
  height: 820,
  before: async (p) => {
    await p.getByRole('button', { name: 'Invite someone' }).click()
    await p.getByLabel('Name').fill('Jordan Reyes')
    await p.getByLabel(/Email/).fill('jordan.reyes@example.com')
    await p.getByRole('group', { name: 'Territories' }).getByRole('button', { name: 'Louisville' }).click()
    await p.getByLabel('Phone').fill('5025550177')
    await p.getByRole('button', { name: 'Send invitation' }).click()
  },
})

// Audit log: a manager's override at the top.
await shot('11-audit-log', 'admin/audit', { height: 760 })
await shot('15-hours-pay', 'admin/pay', { height: 1000 })

await browser.close()
console.log('Screenshots written to', OUT)

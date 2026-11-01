// Screenshots of the database version for the README: the sign-in screen, the
// invitation email a new coach gets, and what someone sees after their access
// is turned off. Needs the local database, freshly loaded, and live mode:
//   npm run db:start && npm run db:reset
//   npm run dev:live &
//   npm run screenshots:live
// Signs in the real way, with codes read from the local email catcher (Mailpit).
// Uses the system Chromium (set CHROMIUM_PATH to override).

import { chromium } from 'playwright-core'

const APP = process.env.APP_URL ?? 'http://127.0.0.1:5173/'
const MAIL = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324'
const OUT = 'docs/screenshots'
const INVITEE = 'jordan.reyes@example.com'
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', args: ['--mute-audio'] })

const inbox = async (to) => (await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)).json()).messages
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/** The next email to `to` after the ones already there. */
async function nextMail(to, seen) {
  for (let i = 0; i < 60; i++) {
    const m = (await inbox(to)).find((x) => !seen.has(x.ID))
    if (m) return (await fetch(`${MAIL}/api/v1/message/${m.ID}`)).json()
    await wait(250)
  }
  throw new Error(`No email arrived for ${to}`)
}
const codeIn = (m) => m.HTML.match(/<strong>(\d{6})<\/strong>/)[1]

async function signIn(page, email) {
  const seen = new Set((await inbox(email)).map((m) => m.ID))
  await wait(1100) // one code per person per second
  await page.goto(APP)
  await page.getByLabel('Work email').fill(email)
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click()
  await page.getByLabel('Code').waitFor()
  await page.getByLabel('Code').fill(codeIn(await nextMail(email, seen)))
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(/#\/[a-z0-9-]+\//)
  await page.waitForTimeout(800)
}

const page = async (width, height) => (await browser.newContext({ viewport: { width, height }, colorScheme: 'light' })).newPage()

// 1. The sign-in screen.
{
  const p = await page(1200, 640)
  await p.goto(APP)
  await p.getByLabel('Work email').fill('tm-lou@staff.bramblewood.example')
  await p.screenshot({ path: `${OUT}/12-sign-in.png` })
  await p.context().close()
}

// 2. A territory manager invites a coach; the invitation email, as it arrives.
const manager = await page(1440, 900)
await signIn(manager, 'tm-lou@staff.bramblewood.example')
await manager.goto(APP + '#/tm-lou/accounts')
await manager.waitForTimeout(500)
if (await manager.locator('tr.row', { hasText: INVITEE }).count()) throw new Error(`${INVITEE} is already invited: run \`npm run db:reset\` first.`)
const seen = new Set((await inbox(INVITEE)).map((m) => m.ID))
await manager.getByRole('button', { name: 'Invite someone' }).click()
await manager.getByLabel('Name').fill('Jordan Reyes')
await manager.getByLabel(/Email/).fill(INVITEE)
await manager.getByLabel('Phone').fill('5025550177')
await manager.getByRole('button', { name: 'Send invitation' }).click()
await manager.getByText('The invitation was emailed.').waitFor()
const invite = await nextMail(INVITEE, seen)
{
  // Shown the way a mail app would: sender, subject, then the message itself.
  const p = await page(720, 300)
  await p.setContent(`<!doctype html><meta charset="utf-8">
    <body style="margin:0;font:15px/1.5 system-ui,sans-serif;background:#e7e9ec;color:#1d2733">
    <div style="margin:20px;background:#fff;border-radius:10px;box-shadow:0 1px 4px #0002;overflow:hidden">
      <div style="padding:14px 20px;border-bottom:1px solid #dde1e6;font-size:13px;color:#56606b">
        <div><b style="color:#1d2733">${invite.Subject}</b></div>
        <div>To: ${INVITEE}</div>
      </div>
      <div style="padding:6px 20px 14px">${invite.HTML}</div>
    </div></body>`)
  await p.locator('body').screenshot({ path: `${OUT}/13-invitation-email.png` })
  await p.context().close()
}

// 3. Jordan signs in (accepting), then the manager turns their access off.
const coach = await page(400, 640)
await signIn(coach, INVITEE)
await manager.reload()
await manager.waitForTimeout(800)
await manager.goto(APP + '#/tm-lou/accounts')
await manager.locator('tr.row', { hasText: 'Jordan Reyes' }).click()
await manager.getByRole('button', { name: 'Turn off access' }).click()
await manager.getByRole('button', { name: 'Click again to turn off access' }).click()
await manager.getByText('Turn access back on').waitFor()
await coach.reload()
await coach.getByText('No access').waitFor()
await coach.screenshot({ path: `${OUT}/14-no-access.png`, clip: { x: 0, y: 0, width: 400, height: 250 } })

await browser.close()
console.log('Live screenshots written to', OUT)

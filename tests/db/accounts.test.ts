// Accounts in live mode, against the running local database and its server
// function: invitations by email, accepting on first sign-in, turning access
// off and on, and the server refusing what the rules refuse.

import { beforeAll, describe, expect, it } from 'vitest'
import type { InviteInput } from '../../src/data/actions'
import { asStaff, codeIn, newLive, nextMail, pause, seenIds, server, signInByCode } from './helpers'

// Fresh addresses every run, so the tests can run again without a reset.
const run = Date.now().toString(36)
const fresh = (who: string) => `${who}.${run}@example.com`

const profile = async (email: string) => (await server.from('profiles').select('*').eq('email', email).single()).data!
const coachInvite = (email: string): InviteInput => ({ name: 'Jordan Reyes', email, role: 'coach', territoryIds: ['lou'], coach: { level: 'assistant', payRate: 20, phone: '502-555-0177' } })

describe('inviting a coach, start to finish', () => {
  const email = fresh('jordan')
  let tm: Awaited<ReturnType<typeof asStaff>>
  let id: string

  beforeAll(async () => {
    tm = await asStaff('tm-lou@staff.bramblewood.example')
  })

  it('a territory manager invites; the invitation is saved and emailed', async () => {
    const seen = await seenIds(email)
    id = await tm.live.source.run('inviteUser', tm.me, [coachInvite(email)])
    const p = await profile(email)
    expect(p).toMatchObject({ id, status: 'invited', invited_by: 'tm-lou', role: 'coach' })
    expect(p.auth_user_id).toBeTruthy()
    const coach = (await server.from('coaches').select('active').eq('id', p.coach_id).single()).data!
    expect(coach.active).toBe(false)
    const m = await nextMail(email, seen)
    expect(m.Subject).toBe('You’re invited to SoccerSessions')
    expect(m.HTML).toContain('Priya Raman invited you')
    expect(codeIn(m)).toMatch(/^\d{6}$/)
    // The manager's screen shows the new person straight away.
    expect(tm.live.source.getState().users.find((u) => u.id === id)?.status).toBe('invited')
  })

  it('the coach signs in for the first time and the account becomes active', async () => {
    const { auth, mail } = await signInByCode(email)
    // Until they accept, even the sign-in email reads as the invitation.
    expect(mail.Subject).toBe('You’re invited to SoccerSessions')
    expect(auth.status).toBe('ready')
    const p = await profile(email)
    expect(p.status).toBe('active')
    expect(p.history.at(-1).text).toBe('Accepted the invitation')
    expect((await server.from('coaches').select('active').eq('id', p.coach_id).single()).data!.active).toBe(true)
  })

  it('turning access off locks them out of sign-in and data', async () => {
    const r = await tm.live.source.run('deactivateUser', tm.me, [id])
    expect(r.upcoming).toEqual([])
    const p = await profile(email)
    expect(p.status).toBe('deactivated')
    const { data } = await server.auth.admin.getUserById(p.auth_user_id)
    expect(new Date(data.user!.banned_until!).getTime()).toBeGreaterThan(Date.now())
    // Supabase still emails a code to a locked-out account, but the code doesn't sign them in.
    await pause()
    const seen = await seenIds(email)
    const live = newLive()
    await live.auth.sendLink(email)
    await expect(live.auth.verifyCode(email, codeIn(await nextMail(email, seen)))).rejects.toThrow(/didn’t work/)
    expect(live.auth.get().status).not.toBe('ready')
  })

  it('turning it back on lets them in again', async () => {
    await tm.live.source.run('reactivateUser', tm.me, [id])
    const p = await profile(email)
    expect(p.status).toBe('active')
    const { data } = await server.auth.admin.getUserById(p.auth_user_id)
    expect(data.user!.banned_until ?? null).toBeNull()
    const { auth, mail } = await signInByCode(email)
    // Accepted already, so this is an ordinary sign-in email.
    expect(mail.Subject).toBe('Your SoccerSessions sign-in')
    expect(auth.status).toBe('ready')
  })
})

describe('the server refuses what the rules refuse', () => {
  it('a territory manager can’t invite a sales rep; nothing is saved', async () => {
    const tm = await asStaff('tm-lou@staff.bramblewood.example')
    const email = fresh('rep')
    await expect(tm.live.source.run('inviteUser', tm.me, [{ name: 'New Rep', email, role: 'sales_rep', territoryIds: ['lou'] }])).rejects.toThrow(/can’t invite/)
    expect((await server.from('profiles').select('id').eq('email', email)).data).toEqual([])
  })

  it('a coach can’t invite anyone, whatever the screen sends', async () => {
    const { data: coach } = await server.from('profiles').select('email').eq('role', 'coach').eq('status', 'active').limit(1).single()
    const c = await asStaff(coach!.email)
    await expect(c.live.source.run('inviteUser', c.me, [coachInvite(fresh('x'))])).rejects.toThrow(/can’t invite/)
  })

  it('the only ops admin can’t demote themselves', async () => {
    const admin = await asStaff('admin@staff.bramblewood.example')
    await expect(admin.live.source.run('changeAccess', admin.me, ['admin', 'territory_manager', ['lou']])).rejects.toThrow(/only active operations admin/)
  })

  it('a browser can’t call the database’s write routine directly', async () => {
    const admin = await asStaff('admin@staff.bramblewood.example')
    const { error } = await admin.live.client.rpc('apply_changes', { changes: {} })
    expect(error?.code).toBe('42501')
  })
})

describe('an expired invitation', () => {
  it('doesn’t turn into an account; sending it again does', async () => {
    const admin = await asStaff('admin@staff.bramblewood.example')
    const email = fresh('late')
    const id = await admin.live.source.run('inviteUser', admin.me, [{ name: 'Late Larkin', email, role: 'sales_rep', territoryIds: ['oak'] }])
    await server.from('profiles').update({ invited_at: new Date(Date.now() - 8 * 864e5).toISOString() }).eq('id', id)

    const first = await signInByCode(email)
    expect(first.auth).toMatchObject({ status: 'no-access', reason: 'invited' })
    expect((await profile(email)).status).toBe('invited')

    await pause()
    await admin.live.source.run('resendInvite', admin.me, [id])
    const second = await signInByCode(email)
    expect(second.auth.status).toBe('ready')
    expect((await profile(email)).status).toBe('active')
  })
})

# Plan: real sign-in and staff accounts

Status: **planned, not started** (written 2026-11-01). Nothing here is built yet.

Today SoccerSessions has no sign-in. The first screen is a "pick a demo user" page, the
cast of users is fixed in `src/data/seed.ts`, and the current user is whoever is named in
the page address. That's right for a public demo. This plan describes how a real
deployment would add sign-in, adding and removing staff, and an audit trail, **without
taking the demo away**.

## Goals

1. People sign in as themselves. Nobody can act as someone else by editing the address.
2. Managers add staff by **invitation**. Nobody types or hands out a password.
3. People who leave are **deactivated, never deleted**: they're locked out at once, and
   their history stays intact.
4. The access rules in `src/engine/access.ts` are enforced **by the database**, not only
   by the screens, so a tampered browser still can't see another territory's records or
   anyone's pay rate.
5. Every account change is written to an **audit log** that nobody can edit.
6. The public demo keeps working exactly as it does now: no account, pick any role.

## The approach in one paragraph

Use **Supabase**, a hosted service that provides sign-in, a Postgres database and
database-level access rules ("Row Level Security") together, with a free tier. The site
stays a static site on GitHub Pages. In **live mode** it talks to Supabase; in **demo
mode** (the default, and what the public link serves) it keeps using the browser copy it
uses today. A small number of server functions (Supabase Edge Functions, written in
TypeScript) do the things a browser must never be trusted with: sending invites,
deactivating people and saving staffing changes that have to pass the rules engine.

Why Supabase: sign-in, database and access rules come from one provider, so there are
fewer moving parts than combining a sign-in company (Clerk, Auth0) with a separate
database and API server. Its server functions run TypeScript, so they can import
`src/engine/` unchanged: the same rules code would run in the browser, in the tests and
on the server.

## Two modes, one codebase

| | Demo mode (today) | Live mode (new) |
|---|---|---|
| Who you are | Picked on the first screen; kept in the address | Signed in; read from the sign-in session |
| Where data lives | This browser only (localStorage) | Shared Supabase database |
| Users | Fixed demo cast; "Reset demo data" restores it | Real accounts, added by invitation |
| Access rules | `access.ts` in the browser | `access.ts` in the browser **and** the same rules in the database |
| Turned on by | Default | Build setting `VITE_SUPABASE_URL` present |

The screens don't care which mode they're in. They keep calling the same store
functions (`saveCrew`, `reschedule`, `updateCoach`, and so on). Underneath, the store
hands each call to a **data source**: the demo source is today's localStorage code, the
live source calls Supabase.

## Data model changes

The engine already separates the person who signs in (`User`) from the coaching roster
entry (`Coach`), which makes this easier.

**`profiles`**: one row per account, linked to Supabase's own sign-in record.

| Field | Notes |
|---|---|
| `id` | Same id as the sign-in account |
| `name`, `email` | |
| `role` | `ops_admin`, `territory_manager`, `sales_rep`, `coach` |
| `territory_ids` | Territories they may see (ops admins see all regardless) |
| `coach_id` | For coaches: their roster entry |
| `status` | `invited`, `active`, `deactivated` |
| `invited_by`, `invited_at`, `activated_at`, `deactivated_at`, `deactivated_by` | |

**`coach_pay`**: pay rates move out of the coach record into their own table. Database
access rules work row by row, not column by column, so the cleanest way to keep the
current promise that pay is "removed, not hidden" for coaches and sales is to keep pay
somewhere only management can read at all.

**`audit_log`**: one row per event (who, what, to whom, when, before and after). The
database allows adding rows and reading them; it allows nobody, admins included, to
change or delete them.

Sessions, centers, intakes, territories and settings become tables with the same shapes
they have in `src/engine/types.ts`.

## Signing in

- **Method:** email "magic link" (click a link in your email, no password) for
  everyone. Optional "Sign in with Google" for office staff. Supabase also supports
  passwords if a client insists.
- **Coaches** are mostly on phones, so the link opens straight to their shift list and
  they stay signed in for 30 days on that phone.
- **Public sign-up is switched off.** The only way in is an invitation.
- Supabase handles the rest: link expiry, rate limits on repeated tries, and signing
  someone out of every device.
- **Email delivery:** Supabase's built-in email is only for testing. Real use needs an
  email sending service (Resend, Postmark or similar; free tiers cover a company this
  size).

## Adding people: invitations

1. A manager opens a new **Staff** screen and clicks **Invite**: name, email, role,
   territory, and for coaches their level (and pay rate, which only management sees).
2. The server checks the inviter is allowed to invite that role into that territory,
   creates the profile as `invited` (and the roster entry, for a coach), sends the
   invite email and writes the audit entry.
3. The person clicks the link, lands signed in, and their status becomes `active`.
4. Invites expire after 7 days; the Staff screen shows **Resend** and **Cancel invite**.

**Who may invite whom** (a new `canInvite` rule in `access.ts`, with tests):

| Inviter | Ops admin | Territory manager | Sales rep | Coach |
|---|---|---|---|---|
| Ops admin | Yes | Yes, any territory | Yes, any territory | Yes, any territory |
| Territory manager | No | No | No | Yes, their territory only |
| Sales rep / coach | No | No | No | No |

## Changing and removing people

- **Change role or territory:** ops admin only. Logged with before and after.
- **Deactivate:** ops admin for anyone; a territory manager for coaches in their
  territory. The person is signed out of every device at once and can't sign back in.
  A coach's roster entry also becomes inactive, so the rules engine already stops them
  being scheduled. Their **future** shifts are listed for the manager to re-staff. Past
  shifts, history entries and audit rows keep their name.
- **Reactivate:** same people who can deactivate. Logged.
- **Guard rails:** you can't deactivate yourself, and the last active ops admin can't be
  deactivated or demoted, so the company can never lock itself out.
- **No delete button.** If someone formally asks for their data to be erased, an admin
  runs a separate, logged "anonymize" step that replaces their name and contact details
  and keeps the records the business needs. This is rare and deliberately not on the
  Staff screen.

## Enforcing the rules on the server

The screens already read everything through `access.ts`. In live mode the database
applies the same rules, so data a person isn't allowed to see is never sent to their
browser:

| `access.ts` rule | Database rule |
|---|---|
| `canSeeTerritory` / `visibleSessions` | Managers read sessions in their territories; ops admins read all; coaches read only sessions they're assigned to; sales reps none |
| `visibleIntakes` | Reps read their own intakes; managers their territories |
| `visibleRoster` | Coaches read active coaches in their own territory (no pay table access) |
| `canSeeMoney` | Only management can read `coach_pay` |
| `canEditAvailability` | Only the coach writes their own availability rows |
| `canChangeSettings`, `canEditTerms` | Ops admin only |

Changes that must pass the rules engine (saving a coaching staff, rescheduling, sales
intake with its coverage check) go through a server function that runs the **same
`src/engine/` code** before writing. The browser's checks stay too, for instant
feedback; the server's checks are the ones that count.

Secrets: the Supabase "service" key, which bypasses every rule, lives only in the
server functions' settings. The browser only ever has the public key, which is safe to
publish because the database rules limit what it can do.

## The Staff screen

- One list per territory (all territories for ops admins): name, role, level, status
  chip (**Invited** yellow, **Active**, **Deactivated** muted), last sign-in.
- Row actions, shown only when allowed: Resend invite, Cancel invite, Change role or
  territory, Deactivate, Reactivate.
- Deactivate opens a confirmation that names the future shifts that will need
  re-staffing.
- It replaces today's Coaching Staff "Active" checkbox; the rest of that screen stays.
- Ops admins get an **Audit log** tab: filter by person, event or date.

In demo mode the Staff screen works too, against the browser copy, so reviewers can try
inviting and deactivating; the "invite email" is shown on screen instead of sent.

## Audit log events

Invite sent, invite resent, invite cancelled, invite accepted, signed in, role changed,
territory changed, deactivated, reactivated, anonymized, pay rate changed, level
changed. Existing per-session and per-coach history stays as it is; the audit log is
the company-wide record of account changes.

## Testing

- **Unit tests** (Vitest, like today): `canInvite`, `canDeactivate`, the last-admin
  guard, and the data-source layer in demo mode. `npm run check` must keep passing with
  no Supabase present, so GitHub Actions and the public demo are unaffected.
- **Database rule tests:** run Supabase locally (its command-line tool runs it in
  Docker), sign in as one test user per role and check each one can read and write
  exactly what the table above says, and nothing else. These run before any live
  deploy.
- **End to end:** invite a user, accept the invite, sign in, deactivate, confirm the old
  session is rejected.

## Phases

Each phase ends with passing checks and its own version, per the changelog rules.

| Phase | What | Visible change | Version |
|---|---|---|---|
| 0 | Decisions below; create the Supabase project | None | – |
| 1 | Split the store into demo and live data sources; demo behaves exactly as today | None | v2.4.0 |
| 2 | Database tables, `coach_pay` split, access rules, rule tests, seed the fictional company | None (local only) | v2.5.0 |
| 3 | Sign-in screen and live mode; identity from the session, not the address | Live mode only | v2.6.0 |
| 4 | Invitations, Staff screen, deactivate / reactivate, guard rails (both modes) | Staff screen in the demo | v2.7.0 |
| 5 | Audit log table and screen; server functions for rule-checked saves | Audit tab in the demo | v2.8.0 |
| 6 | Live deployment, README and screenshots updated | New README section | v3.0.0 |

## Decisions needed before Phase 1

1. **Provider:** Supabase (recommended) or another.
2. **Coach sign-in:** email magic link (free, recommended) or a texted code (more
   familiar on phones, but every text costs money).
3. **A live instance or not:** keep live mode as code plus screenshots only, or run a
   private live copy of the fictional company with test accounts to show in interviews.
   The public link stays in demo mode either way.
4. **Invite rules:** confirm the "who may invite whom" table above.

## Where we left off

Plan written 2026-11-01. Next: the user answers the four decisions above, then Phase 1.

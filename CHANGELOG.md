# Changelog

Every version is tagged in git (`vX.Y.Z`). To restore one, check out its tag and
commit it as a new version; history is never rewritten.

## v2.5.0 (2026-11-01 ET): accounts plan, phase 2 (local database and its rules)

No visible change: the public demo doesn't use the database. This adds the database
the live version will use, running locally in Docker (no Supabase account).

- Tables for the whole company. Pay rates and coach change logs sit in a
  management-only table, and a center's price in one only management and the signing
  rep can read, so those numbers never reach anyone else.
- Read rules that mirror the app's own access rules, and read-only access for
  browsers: every change will go through server code that runs the same actions.
- Nothing can be deleted: the database refuses, even for server code.
- Sign-up is invitation only.
- `npm run db:start`, `db:reset` (loads the fictional company, one sign-in per
  person), `test:db`, `db:stop`.
- 203 app tests (5 new, for converting data to rows and back), plus 12 database tests
  that sign in as all 42 people and check each one reads exactly what the app's rules
  allow.

Restore this if: the local database setup gets in the way; the app itself is unchanged
from v2.4.1.

## v2.4.1 (2026-11-01 ET): accounts plan, no account needed yet

- `docs/accounts-plan.md`: phases 2 to 5 run on Supabase's local version in Docker, so no
  Supabase account is needed until a live online copy is wanted. Plan only; no app
  changes.

## v2.4.0 (2026-11-01 ET): accounts plan, phase 1 (data layer split)

No visible change: the demo works exactly as before. Underneath, the app is ready to
run against a shared database later.

- Every change the app can make is now a named, pure action in `src/data/actions.ts`
  (the current data and the user in, the new data and a result out). Each still
  re-checks permissions and rules.
- New `src/data/source.ts`: a data source decides where data lives. The only one so far
  is the demo source (this browser's localStorage copy, same key as before, so saved
  demos carry over). A live source comes in a later phase.
- `src/store.ts` is now a thin layer: one async function per action. Every screen waits
  for the answer, the way it will have to when a server is behind it.
- 198 tests (was 192): actions never change the data they're given, a refused action
  leaves the data and subscribers untouched, reset rebuilds the company, and every
  action has a store function.

Restore this if: anything in the demo behaves differently from v2.3.2.

## v2.3.2 (2026-11-01 ET): accounts plan decisions

- `docs/accounts-plan.md` records the four decisions: Supabase, email magic links for
  everyone (no paid texts), no live instance yet (code, tests and screenshots only), and
  the invite rules as proposed. Plan only; no app changes.

## v2.3.1 (2026-11-01 ET): plan for real sign-in and staff accounts

- New `docs/accounts-plan.md`: how a real deployment would add sign-in (invite only,
  email links), adding staff by invitation, deactivating instead of deleting, access
  rules enforced by the database, and an audit log, while the public demo keeps its
  "pick a demo user" screen. Plan only; no app changes.
- PLAN.md links to it from the "Later" list.

## v2.3.0 (2026-10-11 03:00 ET): confirmations open the Sunday before

- Coaches can only confirm a shift from the Sunday before its week (the work week starts
  Monday). Before that the phone shows "Confirm from October 18" and a short note why:
  plans change, so a confirmation only means something close to the week. The rule is in
  the engine, so it holds even if the screen were skipped.
- Managers no longer see the red "coach hasn't confirmed" flag on shifts whose week
  hasn't opened yet; the session panel says "Confirms from Sunday, October 18" instead,
  and the dashboard's "Coach unconfirmed" count only counts open weeks.
- Demo data follows the same rule.
- 192 tests (was 188).

## v2.2.1 (2026-10-11 02:30 ET): review round 6

- Section labels: the user picked tan E (greige); every label, day bar and coach-phone
  day label uses it now. The six trial tans are gone. Availability cells keep their tan.
- Bulk staffing is clearer: the counts come from a dry run, so "Add Jordan to all N"
  only appears when it will fill something (no more button that does nothing). Dates
  the coaches can't take are listed with the full date, time and reason, each with a
  "Staff this date" button to pick different coaches for just that one.
- Mark confirmed with facility confirms only this session, then asks "Also confirm the
  other N pending sessions of this program?" (Yes / No, just this one). The standalone
  confirm-all button is gone from the session panel; the Sales pipeline keeps its own.
- Coach phone: a little wider (520px), and the directory grows to fit the longest name
  so no row wraps; on a real phone it still fits the screen.

## v2.2.0 (2026-10-11 01:45 ET): review round 5

**Bulk staffing**
- Staff one session, then "All open sessions (N)" adds the same coaches to every other
  open session of that program they can work; with more than one day a week there are
  "Mondays only" / "Thursdays only" buttons too. Each session gets the full rule check,
  one after another. Sessions they can't do (busy, not available, would need an
  override) stay open and are listed with the reason, ready for the next coaches.
- "Confirm all N pending in this program" next to "Mark confirmed with facility".
- Sales pipeline cards: "Confirm all with the facility" and "Staff the first open
  session"; the "need coaching staff" count is red.

**Sales intake**
- Entering the address by hand now means all of it: street, city, state, ZIP. A ZIP we
  don't have on file is placed at the middle of the territory (drive times marked
  approximate). "Search for the address instead" goes back to the address search.
- Day buttons: no tan; unpicked days match the fields, picked days stay blue.
- Section labels: six tan candidates, browner and lighter than before, one per section
  (A sales identification, B facility, C point of contact, D program terms, E groups,
  F space). TEMPORARY: once the user picks one, every label uses it.

**Look**
- Table day bars and the coach phone's day labels: one lighter tan, all the same shade
  (some had a blue edge or a darker tan).
- Coach phone directory rows alternate colors.

188 tests (was 181): bulk staffing, bulk confirm, permissions, hand-typed addresses.

## v2.1.0 (2026-10-11 00:30 ET): review round 4

**Sales intake**
- Address search: start typing and pick the right address from a list (free
  OpenStreetMap search, no account or key, so it can never cost anything). City, state
  and ZIP fill in. Typing it by hand is still there as a fallback.
- Each weekday has its own first date, start and end time, and its own groups
  ("Thursday groups", "Friday groups"), so Fridays can start a week after Thursdays.
  A first date that isn't on its weekday is refused.
- One cycle price at the bottom for the whole package, with the per-session math.
- Phone numbers format themselves (5025999296 → 502-599-9296); ext. is optional.
- Emails must be real: candyqueen@gmail.con is refused with "did you mean gmail.com?".
  Wrong fields are outlined in red with a message, like any web form.
- Longer cycles: 10 and 16 weeks.

**Sessions**
- Reschedules take a note too; notes show a 300-character limit as you type.
- Status badges explain themselves on hover (e.g. "Confirmed with the facility").

**Calendar**
- Day view: one day, every territory side by side, arrows step a day at a time;
  click a day name in the week view to jump to it.

**Look**
- Dates spelled out everywhere ("October 12, 2026 – October 24, 2026"), in charcoal.
- Cards and panels a shade grayer so colors stand out.
- Light tan as the counterweight: day headers, table day bars, unavailable hours,
  intake section labels, the coach phone's day labels. The field being edited turns
  light blue.
- No gold. Red = a problem (needs coaching staff, no coach assigned, coaches who
  haven't confirmed), yellow = pending ("Pending" replaces "Not yet"), plum = rule issues.
- Alternating row colors in tables and lists.
- Coach picker on the start page: pick the territory, then the coach.

**Demo data + tests**
- A Thursday + Friday program whose first three Thursdays were cancelled and made up at
  the end; Clover Patch's signed program starts Fridays a week after Thursdays.
- 181 tests (was 158): multi-day programs at 8/10/12/16 weeks with reschedules, the
  cancelled-Thursdays case, per-day start dates, phone and email checks, address results.

Note: saved demo data from older versions is reset once (new storage key).

## v2.0.1 (2026-10-10 23:05 ET): more color, less white

- More gray-blue: a blue header bar, blue-gray tabs, column headers, day headers, card
  and section accents.
- Gray added for shading: alternating table rows and calendar days, shaded day labels
  on the coach's phone.
- No pure or near-white anywhere: page, cards, panels and fields are all very light grays.

Restore this if: the screens feel too dark or busy (v2.0.0 was lighter).

## v2.0.0 (2026-10-10 22:40 ET): SoccerSessions, after a full review

Renamed from Crewboard to **SoccerSessions** (new link: lyversemason.github.io/soccer-sessions).
Everything below came from clicking through v1 and recording notes, the way the original
system was used day to day.

**Program terms and cycles**
- The sales rep now enters the program terms at signing: cycle length, 1 to 3 days a week,
  start date, start and end time, and the price for the whole cycle, with the per-session
  math shown. Territory managers see them; only an ops admin can change the price later
  (logged).
- Every session shows where it falls in its cycle ("session 3 of 8"), when the cycle
  started and when it really ends. Reschedules and make-up sessions push the end date out;
  cancelled sessions without a make-up are flagged.
- The ops admin dashboard lists cycles ending within two weeks, for renewals.
- Sales reps can edit a submission until a territory manager confirms it. Sessions change
  in place, extra ones are cancelled with a reason (never deleted), and it's all logged.

**Coaches**
- Availability belongs to the coach: usual week, one-week changes, and days off (vacations,
  exams). A weekly "Has your availability changed?" check-in. Managers see it all,
  including who hasn't confirmed this week, but can't change it.
- Coaching Staff page (was Roster): click a coach to change level, pay rate, phone, email or
  active status. Territory managers and ops admins can; every change is logged.
- Reschedules text the coaching staff to re-confirm (logged); the coach's phone shows
  "Moved: confirm".
- Call and text are round icon buttons everywhere.

**Look and wording**
- Calm light palette (off-white, gray-blue, light tan, gold dates); no dark mode.
- Dates with the year; week ranges like 10-12-2026 – 10-17-2026.
- Session panel regrouped: big center name, program box at the top, labeled facility
  details (space, surface, obstacles, weather backup), groups with a count, coaching staff,
  status, collapsible history.
- "Coaching staff" instead of "crew"; "territory manager" everywhere.
- A red (i) "Coach hasn't confirmed" (click to call or text) replaces "Waiting for coach".
- One chip per staffing rule replaces "This crew passes every rule"; the Save button shows
  whether it can save (amber when an override is needed, red when blocked).
- Explanations moved into an optional **Demo guide** (top right) so screens read like a
  working tool; a hover tip replaces the "click a territory" instruction.
- Intake: new groups default to 30 minutes, an explicit end time (with a check that the
  groups fit), an "Obstacles on site" heading.
- 158 tests.

Restore this if: you want the original Crewboard design and data model (v1.0.1). Note that
v1 lived at the old link, which no longer works after the rename.

## v1.0.1 (2026-10-10 21:40 ET): fixes from the first review

- A "Crew saved." or "Confirmed with the facility." message disappears as soon as the
  crew is changed (it no longer says "saved" over unsaved changes) and fades after 5 seconds.
- A trainee alone now explains that trainees don't count toward the 1:12 ratio, instead
  of the misleading "a group of 12 is more than 18 children per coach".
- Rescheduled sessions get the next normal number (s145), not a random string.
- Reschedules read like a person wrote them everywhere: "Moved → Mon Oct 12, 11:30am" on
  the calendar, "Rescheduled to Mon Oct 12, 11:30am–12:15pm" in history and the coach view.
- Facility contacts get their own names, so a director is never named like a coach.
- 137 tests.

Restore this if: any of these messages reads worse than before (v1.0.0).

## v1.0.0 (2026-10-10 19:30 ET): first public release

- Public README: live demo link, two-minute walkthrough, feature table, screenshots,
  and how it was built by directing AI coding agents.
- GitHub Actions: type-check, lint and tests must pass before every deploy to GitHub Pages.
- `npm run screenshots` regenerates the README images from a running preview.
- Disabled buttons are clearly grey; shorter per-date reasons in the coverage panel
  ("Needs 4 coaches, 3 free"); readable override names in session history.
- Demo generator: reschedule example tries nearby weekdays, and a new test checks the
  demo data for every 5th day of the coming year (134 tests total).
- MIT license.

Restore this if: you want the first version that was live on GitHub Pages.

## v0.2.0 (2026-10-10 19:40 ET): all four role views

- Demo login picker; hash routes so every screen has a shareable link.
- Fictional demo company generated fresh each week, staffed by the real rules engine,
  with planted cases: a travel override, a ratio override, a reschedule, a cancellation,
  a coach availability conflict, and a new sales intake waiting for a crew.
- Territory manager: week calendar (days visually separated), table with date range,
  status and "only problems" filters, session panel with live rule checks per coach,
  override dialog with the exact warnings, reschedule (keeps original) and cancel
  (reason code), full history log, roster with availability editor.
- Sales rep: full intake form (facility, contact, cadence and groups, space, weather
  backup), address standardizing, live coverage check per date, locked Submit,
  suggested open slots; "My submissions" status view without coach names or money.
- Coach phone view: my shifts by day, confirm one or the whole week, shift package with
  tap-to-map, tap-to-call/text, shift-mates; territory directory; weekly availability.
- Ops admin: per-territory dashboard, open rule issues list, global buffer and drive
  speed settings; sales pipeline with management-only program terms and margin per session.
- On weekends the default week is the coming week.
- 61 tests (engine, store actions, demo data is fictional and valid).

Restore this if: you want the full app before the public README/deploy work.

## v0.1.0 (2026-10-10 19:05 ET): rules engine

- Data model for territories, centers, coaches, sessions, intakes and settings.
- Validation engine: time conflicts (block), travel time + configurable buffer,
  lead-coach rule, 1:12 ratio with a second coach at 13, 18-per-coach override cap
  (block above), availability, territory and active checks.
- Exact override warning wording from the spec.
- Sales coverage check (same rules, no overrides, never assigns) + open-slot suggestions.
- Session lifecycle with no delete: confirm, reschedule (keeps original, links new),
  cancel with reason code; coach confirmation.
- Role-based access functions; pay rates stripped for non-management.
- 49 unit tests.

Restore this if: you want just the engine without any screens.

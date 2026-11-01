# SoccerSessions: plan and spec

SoccerSessions (first released as "Crewboard") is a scheduling and sales-intake system for **Bramblewood Youth Soccer**, a
*fictional* company that sends soccer coaches to daycares and schools in three markets:
Louisville KY, Knoxville TN and Oakland CA. Every company, center, coach, phone number
and dollar figure in this repo is made up.

It's a public rebuild of a system I designed and ran at a previous job. The original
is private, so this version uses fresh code and invented data.

## The problem

A field-service business schedules dozens of independent contractor coaches across
several cities. Before this system existed, three things went wrong over and over:

1. **Sales booked slots nobody could staff.** A rep on the phone with a daycare would
   promise "Tuesdays at 10" without knowing whether a qualified coach was free.
2. **Managers made unsafe assignments.** A coach was double-booked, given too little
   time to drive between centers, sent alone with 15 toddlers, or sent with no lead
   coach on site.
3. **Records disappeared.** Rescheduled or cancelled sessions were deleted, so nobody
   could audit what happened or why.

## Roles

| Role | Sees | Can do |
|---|---|---|
| Operations admin | Every territory | Everything a territory manager can, plus global settings (travel buffer, drive speed) and correcting a program's price after signing |
| Territory manager | Only their territory | Calendar/table views, assign the coaching staff, override warnings, lifecycle changes, edit coaches (level, pay rate, contact, active), read program terms |
| Sales rep | The intake form and their own submissions | Submit a new center with its program terms (must pass the live coverage check); edit a submission until a territory manager confirms it |
| Coach | Only their own shifts + their territory's coach directory | Confirm shifts (one or the whole week), tap-to-map, call/text buttons, own their availability: usual week, one-week changes, days off, weekly check-in |

Coach pay rates and margins are management-only: removed from the data before it
reaches a coach or sales screen, not just hidden. A sales rep sees the price of the
centers they signed, because they entered it.

## The rules engine

Every assignment is checked against these rules. Managers' assignment screen and the
sales intake check run **the same code** (`src/engine/validate.ts`).

| # | Rule | Severity |
|---|---|---|
| I | A coach can't be in two sessions at overlapping times | **Block** (physically impossible) |
| II | Between sessions at different centers, the gap must be ≥ drive time + safety buffer (buffer is a setting, default 30 min) | Manager may override |
| III | Every session needs a lead coach; assistants/trainees can't run one alone or together | Manager may override |
| IV | 1 counted coach per 12 children in the largest group; 13 children means a second coach | Manager may override, up to 18 per coach |
| IV | More than 18 children per coach | **Block** |
| – | Coach is outside their marked weekly availability | Manager may override |
| – | Coach is from another territory, or inactive | **Block** |

Overrides show a confirmation dialog with the exact warning for each broken rule, e.g.
*"Are you sure you want to override this constraint? Warning: This assignment violates
calculated travel time between centers."* Each confirmed override is saved on the
session with who did it and when.

**Decisions I made where the spec was silent:**
- Trainees (shadow coaches) don't count toward the 1:12 ratio. They're there to learn.
- Back-to-back sessions at the *same* center don't need the travel buffer.
- The ratio uses the largest group in a session block, since groups rotate through one at a time.
- Drive time is estimated from straight-line distance × 1.3 road factor ÷ average speed
  (25 mph default). A production version would call a routing API; this keeps the demo
  offline and testable.

## Sales intake + live coverage check

While the rep fills in the form, the app checks in the background whether the current
coaching staff can cover the requested days, time and group sizes **on every date** of
the program. It uses the same rules with no overrides allowed. It looks for any qualified
combination (a free lead plus enough counted coaches) and **never assigns anyone**. If
any date fails, the Submit button is disabled and the app suggests open slots of the
same length that do work, so the rep can negotiate on the call.

Submitted intakes create **pending, unassigned** sessions on the territory calendar
for the manager to staff.

## Session lifecycle

`pending → confirmed → rescheduled | cancelled`

- There is no delete, anywhere.
- **Rescheduled** keeps the original record (status *rescheduled* + required
  Rescheduled Date) and creates a new linked session. Coaches must re-confirm.
- **Cancelled** keeps the record with a required reason code (and a note for "Other").
- Every change is logged in the session's history.

## v2: changes from reviewing v1 (2026-10-10)

The person who ran the original system clicked through v1 and recorded notes. v2 is
the result:

- **Program terms belong to sales.** The rep enters cycle length (1, 2, 4, 8, 12 or 20
  weeks), which days of the week (1 to 3 days), the start date, start and end time, and
  the **price for the whole cycle** (centers pay per cycle, not per week). The form shows
  what that works out to per session. Territory managers see the terms; only an ops
  admin can change the price afterwards, and the change is logged.
- **Cycle tracking.** Every session shows "session 3 of 8", when the cycle started and
  when it will *really* end. The end date is read from the sessions, so reschedules and
  make-up sessions push it out ("pushed back from Nov 5"). Cancelled sessions with no
  make-up are flagged. The ops admin dashboard lists cycles ending within two weeks for
  renewal conversations.
- **Sales can edit a submission** until a territory manager confirms it (and before it
  starts), e.g. when the director calls back with a new time. Sessions change in
  place, extra ones are cancelled with the reason "Program changed before it started",
  never deleted, and every change is logged.
- **Availability belongs to the coach.** Coaches set their usual week, make one-week
  changes, and add days off (vacations, exams). They confirm their availability every
  week ("Has your availability changed?" → "No, it's the same"). Managers see all of
  it, including who hasn't confirmed this week, but can't change it. The rules engine
  treats a day off like any other unavailability, with the reason in the warning.
- **Reschedules notify the coaching staff** to re-confirm (logged in the history; the
  coach's phone shows "Moved: confirm").
- **Clearer screens:** a calm light palette, dates with the year, a session panel
  grouped into labeled sections, "Coaching staff" (not "crew"), a red (i) for coaches who
  haven't confirmed (click to call or text them), one chip per staffing rule instead of
  "passes every rule", a Save button that shows whether it can save, call/text icon
  buttons, and explanations moved into an optional **Demo guide**.

## Scope

**v1 (this build):** roles + demo logins, rules engine with tests, manager calendar +
table views with live rule badges, crew assignment with override dialog, lifecycle
actions, roster, sales intake with live coverage check and slot suggestions, coach
mobile view (shifts, shift package, tap-to-map, tap-to-call/text, confirm / confirm
week, directory, weekly availability), ops admin dashboard + settings.

**v2:** everything in the section above.

**Later:** real push/SMS reminders, hours × pay
rate dashboard (week / month / 3-week pay cycle), calendar subscription (iCal feed),
bulk copy of a cadence across N weeks, equipment bag inventory, address verification
API, real authentication and a shared database (planned in
[docs/accounts-plan.md](docs/accounts-plan.md)).

## Architecture

- **`src/engine/`**: pure TypeScript, no UI. Types, time and distance helpers,
  validation, coverage, lifecycle, access control, availability (usual week, one-week
  changes, days off) and program cycles. Fully unit-tested (`tests/`).
- **`src/data/seed.ts`**: generates a believable fake company each time the demo
  resets, dated relative to the current week so the demo never looks stale.
- **`src/data/actions.ts`**: every change the app can make (save a coaching staff,
  reschedule, submit an intake…) as a pure function: data and user in, new data and
  a result out. Each one re-checks permissions and rules through the engine.
- **`src/data/source.ts`**: where data lives. The demo source keeps the fictional
  company in the browser's localStorage; a live source backed by a shared database is
  planned in [docs/accounts-plan.md](docs/accounts-plan.md).
- **`src/data/rows.ts`**: converts the app's data to database rows and back.
- **`src/data/live.ts`**: live mode (`npm run dev:live`): email sign-in, and a data
  source that reads through the database's rules. Account changes run on the server;
  the rest is read-only until saving arrives.
- **`server/run-action.ts`**: the server function (bundled into
  `supabase/functions/run-action` by `scripts/build-functions.ts`). It runs the same
  actions as the demo for the signed-in person and saves the changed rows in one
  transaction.
- **`supabase/migrations/`**: the database tables and read rules for the planned live
  version; `tests/db/` signs in as every role and checks them against `access.ts`.
- **`src/store.ts`**: what the screens call. It hands each change to the data source by
  name and returns a promise, so screens already wait for answers the way they will
  when a server is behind them.
- **`src/views/`**: one screen per role/task, React.
- Static build (Vite) deployed to GitHub Pages. No backend: each visitor gets their
  own copy of the demo company in their browser, and "Reset demo" restores it.

# Crewboard: plan and spec

Crewboard is a scheduling and sales-intake system for **Bramblewood Youth Soccer**, a
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
| Operations admin | Every territory | Everything a manager can, plus global settings (travel buffer, drive speed) |
| Territory manager | Only their territory | Calendar/table views, assign coaches, override warnings, lifecycle changes, roster, program terms |
| Sales rep | Only the intake form and their own submissions | Submit a new center, which must pass the live coverage check |
| Coach | Only their own shifts + their territory's coach directory | Confirm shifts (one or the whole week), tap-to-map, tap-to-call, edit weekly availability |

Pay rates and contract money (program terms) are management-only. They're removed
from the data before it reaches a coach or sales screen, not just hidden.

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
roster can cover the requested weekday, time and group sizes **on every date** in the
cadence. It uses the same rules with no overrides allowed. It looks for any qualified
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

## Scope

**v1 (this build):** roles + demo logins, rules engine with tests, manager calendar +
table views with live rule badges, crew assignment with override dialog, lifecycle
actions, roster, sales intake with live coverage check and slot suggestions, coach
mobile view (shifts, shift package, tap-to-map, tap-to-call/text, confirm / confirm
week, directory, weekly availability), ops admin dashboard + settings.

**Later:** dated availability exceptions + weekly re-confirm reminders, hours × pay
rate dashboard (week / month / 3-week pay cycle), calendar subscription (iCal feed),
bulk copy of a cadence across N weeks, equipment bag inventory, address verification
API, real authentication and a shared database.

## Architecture

- **`src/engine/`**: pure TypeScript, no UI. Types, time and distance helpers,
  validation, coverage, lifecycle, access control. Fully unit-tested (`tests/`).
- **`src/data/seed.ts`**: generates a believable fake company each time the demo
  resets, dated relative to the current week so the demo never looks stale.
- **`src/store.ts`**: holds the app state, saves it to the browser's localStorage, and
  is the only place that changes data (always through engine functions).
- **`src/views/`**: one screen per role/task, React.
- Static build (Vite) deployed to GitHub Pages. No backend: each visitor gets their
  own copy of the demo company in their browser, and "Reset demo" restores it.

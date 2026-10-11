# SoccerSessions

**Live demo: https://lyversemason.github.io/soccer-sessions/** (no login: pick a demo user)

SoccerSessions is a scheduling, staffing-rules and sales-intake system for a field-service
business: independent contractor coaches sent to daycares and schools across three
cities. It enforces the operating rules that keep sessions safe and staffable, stops
sales from booking a program the coaching staff can't cover, and tracks every program's
cycle to its real end date.

It's a public rebuild of a system I designed and ran at a previous job (the original
is private). This version uses fresh code and a **fictional company, Bramblewood Youth
Soccer**. Every center, coach, phone number (555-01xx) and dollar figure is made up.

![Session panel: program cycle, labeled facility details, coaching staff and rule checks](docs/screenshots/3-session-panel.png)

## Try it in two minutes

Turn on **Demo guide** (top right) for a short explanation on each screen.

1. **Sales rep (Jamie Ellison).** Start a new center: pick a ZIP, choose Saturdays and
   40 kids. The live check says the coaching staff **can't** cover it, Submit locks, and
   it offers open slots instead. Then open **My submissions**: Clover Patch can still be
   edited because no territory manager has confirmed it yet.
2. **Territory manager, Louisville (Priya Raman).** Open any session. The top box shows
   the program (e.g. session 5 of 8), when the cycle really ends, the price. A red **(i)** marks
   a coach who hasn't confirmed; click it to call or text them. Put an assistant on alone
   and the Save button turns amber: saving asks for the exact override warning from the spec.
3. **Coach (phone view).** Answer "Has your availability changed this week?", add a day
   off, and confirm your shifts. Then look at **Coaching Staff** as the territory manager:
   it shows who has confirmed and the day off, read-only.
4. **Ops admin (Dana Whitfield).** The dashboard lists cycles ending in the next two weeks
   (renewal time). Change the safety buffer from 30 to 60 minutes and watch new
   drive-time issues appear across territories.

Everything you change is saved in your browser only. **Reset demo** restores it.

## What it does

| | |
|---|---|
| **Role-based access** | Ops admins see all territories; territory managers only theirs; sales reps only the intake and their own submissions; coaches only their own shifts. Coach pay rates are stripped from the data for non-managers, not just hidden. |
| **Rules engine** | Blocks double-booking. Checks drive time between centers plus a configurable safety buffer, requires a lead coach on every session, and enforces 1 coach per 12 children in a group (13 means a second coach; trainees don't count). Territory managers can override with an explicit warning, up to 18 per coach and never past that. Days off and availability count too. |
| **Sales intake** | The rep types the address and picks it from a live address search (free OpenStreetMap lookup, no API key, so it can never run up a bill). Each weekday of the program gets its own first date, times and groups (Thursdays from one week, Fridays from the next), and one price covers the whole cycle. Phone numbers format themselves, misspelled emails like `@gmail.con` are refused, and wrong fields are outlined in red with a message. A live check proves qualified coaches exist on **every** date, using the same rules with no overrides and without assigning anyone. If it can't, Submit is locked and open slots are suggested. Reps can edit a submission until a territory manager confirms it. |
| **Bulk staffing** | Staff one session, then add the same coaches to every other open session of that program they can legally work (or just its Mondays, or Thursdays) in one click. Each session gets the full rule check first, so the button only offers what it can really fill; dates the coaches can't take are listed by name with the reason and a link to staff that one date. Confirming one session with the facility then asks whether to confirm the rest of the program. |
| **Program cycles** | Every session shows "session 3 of 8" and the cycle's real end date, read from the sessions, so reschedules and make-ups push it out. Missing make-ups are flagged and cycles ending soon are listed for renewal. |
| **Session lifecycle** | Pending → confirmed → rescheduled / cancelled. **Nothing is ever deleted**: a reschedule keeps the original, links a new session and texts the coaching staff to re-confirm; a cancellation needs a reason code. Both take an optional note (up to 300 characters). Every change is logged with who and when. |
| **Territory manager views** | Week calendar with a one-day view (every territory side by side), a filterable table with live rule badges, plus Coaching Staff: click a coach to change level, pay rate or contact details (logged), and see availability and weekly check-ins read-only. |
| **Coach phone view** | My shifts by day, a full shift package, tap-to-map, call and text buttons, confirm one shift or the whole week (confirmations open the Sunday before each week, never weeks ahead), a weekly "has your availability changed?" check-in, usual week, one-week changes and days off. |

<table>
<tr>
<td><img src="docs/screenshots/7-intake-blocked.png" alt="Sales intake blocked by the coverage check"></td>
<td><img src="docs/screenshots/4-override-dialog.png" alt="Override warning"></td>
</tr>
<tr>
<td>Sales can't submit a program the coaching staff can't cover, and gets alternatives.</td>
<td>Overrides name the exact rule broken and are logged.</td>
</tr>
<tr>
<td><img src="docs/screenshots/9-staff.png" alt="Coaching Staff page with weekly availability check-ins"></td>
<td><img src="docs/screenshots/6-admin.png" alt="Ops admin dashboard"></td>
</tr>
<tr>
<td>Coaching Staff: who has confirmed this week's availability, hours and cost.</td>
<td>Ops admin: every territory at a glance, cycles ending soon, global settings.</td>
</tr>
</table>

<img src="docs/screenshots/5-coach.png" alt="Coach phone view" width="320">

## How it was built

I don't write code by hand. I build by directing AI coding agents (Claude Code): I
write the spec, make the product decisions, and check the agent's work against real
use.

1. **Spec first.** [PLAN.md](PLAN.md) is the spec, rewritten for a fictional company
   from the operating rules I enforced day to day: who sees what, the scheduling rules,
   the exact override wording, the intake fields and the lifecycle.
2. **Rules engine before screens.** The rules live in one module with no UI
   (`src/engine/`), so they can be tested directly. The territory manager's assignment
   screen and the sales intake call the *same* code, which is what the spec requires.
3. **Tests for every rule.** 192 automated tests cover the edge cases that matter in
   the field: a gap exactly equal to drive + buffer passes and one minute less fails,
   12 kids is fine, 13 needs a second coach, 19 with one coach is blocked even with an
   override, trainees don't count toward the ratio, a day off blocks only that day, a
   reschedule past the planned end pushes the cycle out, a Thursday + Friday program
   whose first three Thursdays were cancelled still delivers all 16 sessions and ends
   three weeks late, 16-week twice-a-week programs count correctly, a start date on the
   wrong weekday is refused, nothing can be deleted, and a
   sales rep can't submit an unstaffable program or edit a confirmed one even by skipping
   the UI. Another set checks the regenerated demo data for every week of the coming year.
4. **Demo data made by the engine.** The fake company is staffed by the real rules
   engine each week, then realistic problems are planted on purpose: a travel override, a
   ratio override, a reschedule, a weather cancellation whose make-up pushes a cycle back,
   a coach's vacation, a coach availability conflict, a new sale waiting for coaches.
5. **Reviewed like a real product.** v1 went live in one evening. Then I clicked through
   it the way I used to run the original, recording my screen and voice, and turned 37
   notes into v2: program terms owned by sales, cycle tracking, editable submissions,
   coach-owned availability with weekly check-ins and days off, reschedule notifications,
   and a calmer, clearer design. The plain-language list is in the
   [changelog](CHANGELOG.md).

Decisions I made where the original spec was silent are listed in
[PLAN.md](PLAN.md#the-rules-engine).

## Project layout

```
src/engine/     Rules engine: types, time + distance, validation, coverage, lifecycle,
                access, availability, program cycles
src/data/       Fictional company generator and ZIP lookup
src/store.ts    The only place data changes, always through the engine
src/views/      One screen per role or task (React)
tests/          Vitest unit tests for the engine, store actions and demo data
scripts/        Screenshot generator for this README
```

Built with TypeScript, React and Vite, and deployed to GitHub Pages by GitHub Actions
on every push (tests must pass first). There's no backend: each visitor gets their own
copy of the demo company in localStorage. A production version would add real sign-in,
a shared database, a routing API for drive times and real text messages. (The address
search is the one live outside call: typed addresses go to the free Photon service.)

## Run it locally

```bash
npm install
npm test          # all tests
npm run dev       # http://localhost:5173
npm run check     # type-check + lint + tests
```

## Versions

Every release is tagged and described in plain language in [CHANGELOG.md](CHANGELOG.md).

## Roadmap

Hours × pay rate by week, month and 3-week pay cycle · calendar subscription (iCal) for
coaches · bulk-copy a schedule across N weeks · equipment bag inventory and custody ·
real SMS reminders.

# Changelog

Every version is tagged in git (`vX.Y.Z`). To restore one, check out its tag and
commit it as a new version; history is never rewritten.

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

# Changelog

Every version is tagged in git (`vX.Y.Z`). To restore one, check out its tag and
commit it as a new version; history is never rewritten.

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

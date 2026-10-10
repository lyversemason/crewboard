# Changelog

Every version is tagged in git (`vX.Y.Z`). To restore one, check out its tag and
commit it as a new version; history is never rewritten.

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

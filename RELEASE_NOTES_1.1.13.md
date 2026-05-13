# v1.1.13 — Daily review customization fix

## Fix
- **Daily review now respects user-customized questions and order**. The settings UI lets users edit each evening review question's content and reorder them via drag-and-drop, but those customizations were not reliably applied when starting a Daily review.

## Root cause
Two interacting defects in `loadSettings`:
1. **Aliasing** — the shallow merge `{...DEFAULT_SETTINGS, ...saved}` left `settings.eveningQuestions` directly aliased to `DEFAULT_SETTINGS.eveningQuestions` when the user had no saved `eveningQuestions` field. Settings-UI edits then mutated the module-level defaults in place.
2. **Language-stale defaults** — `DEFAULT_SETTINGS.eveningQuestions` is computed at module load while the i18n language is still the startup default (`zh`). Users with `language: 'en'` got Chinese default questions mixed in with whatever they customized — which reads from the user's perspective as "customizations didn't take effect."

## Resolution
`loadSettings` now:
- applies the user's saved language **before** any default generation so `t()` resolves in the correct language;
- deep-clones `saved.eveningQuestions` instead of aliasing it to the defaults;
- regenerates fresh defaults via `getDefaultEveningQuestions()` when `saved.eveningQuestions` is missing or empty.

## Verification
- `eslint-plugin-obsidianmd` (recommended config): clean
- `tsc --noEmit -skipLibCheck`: clean
- New test coverage: 41/41 assertions pass across three node-based test files (`test-bug-repro.mjs`, `test-evening-sop.mjs`, `test-save-load.mjs`) that exercise EveningSOP flow + save/load round-trips + before/after of both defects.

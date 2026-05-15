## Fixed

- Fixed Review Daily so it respects the enabled review questions from settings.
- Fixed the review-question settings list so clicking a question row opens the editable detail panel again.
- Added an explicit enable checkbox for each review question in settings.
- Preserved existing behavior for older settings data: questions without an `enabled` field are treated as enabled.
- Fixed CI by declaring the `jsdom` test dependency used by the settings UI regression tests.

## Validation

- Added regression coverage for editing default and newly added review questions.
- Added regression coverage for disabled questions being skipped in Review Daily.
- Verified clean install, full plugin checks, production release assets, and dependency audit before publishing this release.

# TideLog 1.1.46

## 首次洞察画像

- Added a first-run path that builds an initial profile from old journals.
- Imported legacy journals are copied into the TideLog archive and normalized without changing the original notes.
- The first profile report now uses five evidence-backed sections: recurring themes, repeated behavior pattern, possible blind spot, one small experiment, and evidence references.
- Users can optionally copy old journals into TideLog dated daily notes for future Plan, Review, and Insights workflows.

## Onboarding And Settings

- Added old-journal profile entry points in onboarding, Insights, and settings.
- Added privacy copy explaining that journals stay local and AI is only called when the user starts generation.
- Refined AI setup copy and provider/model defaults for a simpler first-run configuration flow.
- Removed the device-management CTA from settings.

## Generation Experience

- Added conservative time ranges for old-journal profile generation.
- Added clearer in-progress messaging near the loading button.
- Report generation now scrolls to the generated report when ready.
- The generate button now switches to a completed state after the report is ready and resets if the selected folder changes.

## Quality

- Updated profile prompts and templates so future AI profile updates use the same evidence-backed standard.
- Added regression coverage for legacy import, source-note protection, report structure, profile merge behavior, onboarding, settings, and first-insight UI states.

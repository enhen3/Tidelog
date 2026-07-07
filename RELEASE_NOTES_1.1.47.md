# TideLog 1.1.47

## Markdown Document Polish

- Added a unified TideLog document style for generated daily notes, weekly plans, monthly plans, insight reports, profile files, principles, patterns, quick capture, plan suggestions, and legacy-imported daily notes.
- Added TideLog callout blocks so AI-generated reports are easier to scan in Obsidian Reading View.
- Kept native Markdown task checkboxes as top-level tasks so Obsidian task parsing continues to work.
- Added regression coverage to prevent future formatting changes from blockquoting tasks or duplicating title emoji.

## Long AI Generation Reliability

- OpenAI-compatible providers now try real SSE streaming before falling back to Obsidian `requestUrl` non-streaming calls.
- Long first-insight/profile generations can show live progress instead of waiting silently on a single long request.
- Added safer fallback handling for empty or malformed stream responses so users do not receive a blank report.
- Improved handling of stream chunks that arrive without a trailing newline.

## First Insight And Profile Cleanups

- Redesigned the old-journal folder picker as a clearer desktop-style folder tree with dedicated expand/collapse controls, aligned folder rows, selected-folder labeling, and keyboard expand/collapse support.
- Hidden machine-readable profile/extraction blocks are stripped more reliably from previews and archived reports.
- First Insight report previews keep internal profile update tags hidden while the model is still streaming.
- Old-journal profile generation keeps the original source notes read-only and archives normalized copies for evidence.

## Release Hardening

- Added AI streaming regression tests.
- Updated development lockfile dependencies to clear current npm audit findings.
- Verified typecheck, API typecheck, Obsidian lint, tests, production build, release asset checks, diff whitespace checks, and npm audit.

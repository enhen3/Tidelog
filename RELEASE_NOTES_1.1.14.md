# v1.1.14 — Settings UI: evening question name & content are editable again

## Fix
The evening review question editor in settings was broken for editing question name and content:
- newly added questions could not have their name modified;
- newly added questions could not have their content edited;
- only delete and add operations were functional.

## Root cause
Three issues in `settings-tab.ts` interacted:

1. **`draggable="true"` on the row** — Chromium/Electron treats children of a draggable element specially; clicking an `<input>` inside such a parent can fail to focus or block text selection. The drag attribute belonged on the drag handle, not the entire row.
2. **In-place name-span ↔ input swap** — the row's name span was replaced with an editable input on expand and swapped back to a span on collapse. This brittle DOM swap was the only path to editing the name and inherited problem (1) above.
3. **No name input in the detail panel** — the detail panel rendered only a content textarea, with no labeled name field. The CSS classes (`tl-q-detail-row`, `tl-q-detail-label`, `tl-q-detail-input`) already existed from an earlier design but were never used.

## Resolution
- Moved `draggable="true"` from the row to the drag handle only. Inputs are no longer descendants of a draggable element.
- Dropped the in-place name-span replacement. The row's name span is now a static label that mirrors the latest name.
- Rebuilt the detail panel with a labeled name input and a labeled content textarea, using the pre-existing CSS classes. Typing in the name input also live-updates the row's name span for at-a-glance scanning.
- Drag-start / drag-end listeners moved from the row to the handle; drop targets remain the rows.

## Verification
- `eslint-plugin-obsidianmd` (recommended config): clean
- `tsc --noEmit -skipLibCheck`: clean
- 65 assertions pass across four node-based test suites:
  - `test-bug-repro.mjs` (13/13)
  - `test-evening-sop.mjs` (16/16)
  - `test-save-load.mjs` (12/12)
  - `test-settings-ui.mjs` (24/24, new) — jsdom-driven coverage for: row/handle draggable separation, expand-collapse, name editing, content editing, edit persistence across collapse, newly-added question editing end-to-end, delete regression guard.

## Fixed

- Fixed the Review Daily question editor not expanding when clicking the triangle icon or question title in the real Obsidian/Electron UI.
- Restored editing of review question names and question text from the expanded detail panel.

## Technical note

The previous test clicked the triangle element directly, but Chromium can report the click target as the text node inside that element. The row click handler did not handle text-node targets, so it threw before opening the editor. This release adds direct triangle/title click handlers and makes the row handler text-node safe.

## Validation

- Added regression coverage for text-node clicks on the triangle and question title.
- Ran the full plugin check before publishing this release.

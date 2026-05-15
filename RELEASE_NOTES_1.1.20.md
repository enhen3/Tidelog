## Fixed

- Fixed the Review Daily question editor failing to open in the real Obsidian settings UI.
- Restored editing of review question names and question content from the expanded editor.

## Root cause

The previous test environment incorrectly polyfilled `document.createDiv()`. The production settings UI used `activeDocument.createDiv()` when opening the detail editor, but that helper is not reliable on `document` in Obsidian. The editor now creates the detail panel with the native document API from the clicked row, then uses normal element helpers inside the panel.

## Validation

- Removed the misleading `document.createDiv()` test polyfill.
- Added an assertion that the settings UI test environment does not provide `document.createDiv()`.
- Verified row click, triangle text-node click, title text-node click, name editing, content editing, collapse/re-expand, enable toggle, newly added question editing, and delete behavior.
- Ran the full plugin check and dependency audit before publishing this release.

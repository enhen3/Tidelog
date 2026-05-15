## TideLog 1.1.22

This release addresses the automated review failures reported for `1.1.21`.

### Fixed

- Removed `obsidianmd/ui/sentence-case` disable comments that are not accepted by Obsidian's automated review.
- Moved brand-name and placeholder UI strings through existing dynamic translation helpers so the source code no longer needs sentence-case rule exceptions.
- Replaced `activeWindow` timer calls with `window` timer calls to match the current Obsidian review recommendations.

### Changed

- Removed the deprecated `builtin-modules` development dependency and replaced it with Node's built-in `module.builtinModules` in the build script.

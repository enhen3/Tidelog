---
description: Obsidian plugin coding standards to pass the ObsidianReviewBot automated scan
---
// turbo-all

# Obsidian Plugin Coding Standards

Follow these rules when writing or modifying code in this Obsidian plugin. These are enforced by the ObsidianReviewBot during PR review.

## Network Requests
- **NEVER** use `fetch()`. Always use `requestUrl` from `obsidian`.
- Import: `import { requestUrl } from 'obsidian';`
- All providers extend `BaseAIProvider` which provides `this.makeRequest()` — always use that.

## UI Text — Sentence Case
- All user-facing strings MUST use **sentence case** (capitalize only the first word and proper nouns).
  - ✅ `'Open chat'`, `'Generate weekly insight'`, `'Start morning review'`
  - ❌ `'Open Chat'`, `'Generate Weekly Insight'`, `'Start Morning Review'`
- This applies to: command names, setting labels, button text, headings, descriptions.
- Chinese text is exempt (no case concept).

## Type Safety
- **NEVER** use `as TFile` type assertion. Use `instanceof TFile` to narrow the type.
  ```typescript
  // ❌ Bad
  const file = vault.getAbstractFileByPath(path) as TFile;
  
  // ✅ Good
  const file = vault.getAbstractFileByPath(path);
  if (file instanceof TFile) { /* use file */ }
  ```
- For view type narrowing, use `'propertyName' in view` instead of `as SomeView`.

## Promise Handling
- Every Promise MUST be either:
  1. `await`ed
  2. `.catch()`ed
  3. `.then(_, errorHandler)`ed
  4. Prefixed with `void` operator
- In event handler callbacks, wrap async code:
  ```typescript
  // ✅ Good
  btn.addEventListener('click', () => {
      void (async () => {
          await someAsyncWork();
      })();
  });
  
  // ✅ Also good for simple cases
  btn.addEventListener('click', () => {
      void someAsyncFunction();
  });
  ```

## CSS / Styling
- **NEVER** set styles directly via `element.style.height`, `element.style.top`, etc.
- Use CSS custom properties via `element.style.setProperty('--tl-varname', value)`.
- Or use `element.setCssProps({ '--tl-varname': value })`.
- All visual styling should be in CSS classes, not inline JS.

## Async Methods
- Don't mark methods `async` if they contain no `await` expression.
- Exception: `onOpen()` and `onClose()` in views — these MUST be async because the `ItemView` base class requires `Promise<void>` return type.

## Escape Characters
- Don't escape characters inside regex character classes `[...]` that don't need escaping.
- Inside `[...]`: `.`, `)`, `*`, `/` are literal — no need for `\\.`, `\\)`, `\\*`, `\\/`.

## Plugin Name
- Don't include the plugin name ("TideLog") in settings headings. Use generic labels.
  - ✅ `'Pro'`, `'AI configuration'`
  - ❌ `'TideLog Pro'`, `'TideLog AI Configuration'`

## Unused Variables & Imports
- Remove unused imports and variables before committing.
- Common catches: unused `TFile` import, unused `setIcon` import, unused catch parameter `e`.

## Pre-commit Checklist
1. `npx tsc --noEmit --skipLibCheck` — must pass with 0 errors
2. `npm run build` — esbuild must succeed
3. No `fetch(` calls in source
4. No `as TFile` assertions
5. No `element.style.height/top/bottom` 
6. All UI text in sentence case
7. All promises handled (void/await/catch)

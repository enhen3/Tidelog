# v1.1.16 — Official directory submission readiness

## Review readiness

- Replaced the MIT license with a TideLog source-available license that preserves source review while restricting redistribution and license-gate bypasses.
- Added a privacy policy covering local vault data, AI provider requests, license verification, Afdian purchase links, Cloudflare Workers logs, and D1 rate-limit counters.
- Expanded the README with Free vs Pro details, Afdian purchase flow, AI-provider account requirements, network-use disclosure, and support guidance.

## Reliability

- Removed startup vault writes and automatic view opening; TideLog now starts passive file-link listening only after Obsidian restores the workspace.
- Replaced background file writes with `Vault.process` wrappers to avoid conflicts with other plugins editing the same files.
- Added D1-backed rate limiting for license activation, verification, deactivation, portal lookup, and portal device unbinding.

## Release process

- Removed tracked build artifacts from source control and ignored generated JavaScript files.
- Split build and local deploy scripts so `npm run build` no longer writes into a personal vault path.
- Added CI and `npm run check` to run typecheck, Obsidian lint, tests, production build, and release-asset validation.

## Verification

- `npm run check`
- `npx tsc --noEmit -p api/tsconfig.json`
- `npm --prefix api run test:portal`

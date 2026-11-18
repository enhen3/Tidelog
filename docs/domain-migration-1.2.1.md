# TideLog API domain migration — 1.2.1

Migration date: 2026-11-18.

The plugin now uses `https://tidelog-api.soren.cfd` for trials, licenses, managed AI, quotas, and the device portal. `src/services/api-endpoints.ts` owns the shared origin. The release asset check rejects a bundle that still contains the retiring host.

## Backend continuity

Both domains attach to the existing `tidelog-license-api` Worker and its existing D1 binding. The migration adds a Cloudflare Custom Domain and retains the legacy `tidelog-api.mydreamchronicle.com/*` route. It does not deploy new Worker code, migrate a database, or change licenses, device identities, trials, or quotas.

Routes were applied using the installed Wrangler version:

```sh
./node_modules/.bin/wrangler triggers deploy --dry-run --config api/wrangler.toml
./node_modules/.bin/wrangler triggers deploy --config api/wrangler.toml
```

Wrangler recreated the legacy route ID while preserving its pattern, Worker target, and failure behavior. Private deployment snapshots remain outside version control under `api/.wrangler/`.

## Compatibility boundary

- Existing clients keep calling the old hostname until upgraded. Keep that route available while the old domain remains registered and delegated.
- `mydreamchronicle.com` expires on December 5, 2026. Users should upgrade before that date. Publishing an update does not automatically upgrade installed copies; an HTTP redirect cannot help once the old hostname stops resolving.
- Supporting users who cannot upgrade beyond that date requires retaining control of the old domain. No domain renewal or payment is included in this migration.
- This patch preserves 1.2.0 behavior. Upgrades from 1.1.49 or earlier also include the managed-AI changes in 1.2.0 and require Obsidian 1.11.4 or newer.

## Validation

- Run `npm run check` for type checks, lint, regressions, build, and release assets.
- Generate and validate a clean demo vault. Existing demo notes from earlier dates are not removed by the generator and can contain historical broken links.
- Check HTTPS health, the portal, trial status, and quota reads through both hosts, using a synthetic device ID that has no trial or license. Do not start a trial or generate paid AI output for this check.
- Confirm the deployed Worker version and D1 binding are unchanged. Verify the VPS hostname records remain unchanged.
- Compare the three release assets with the local build and clean demo copies using SHA-256. Record GitHub Actions and official Obsidian scan status separately.

## Recovery

Keep both domains enabled during investigation. If a new-domain routing mistake requires reversal, remove only the new custom-domain entry from `api/wrangler.toml` and apply triggers again; retain the legacy route. This restores the pre-migration routing, but 1.2.1 clients will need the new host restored to reconnect. Do not roll back the database or redeploy old Worker code for a domain-only problem.

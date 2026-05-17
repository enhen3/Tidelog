# v1.1.32 — Commercial flow hardening

This patch tightens paid-product behavior before broader distribution:

- Fixes License activation error handling so invalid keys, revoked keys, and device-limit errors show the server's business message instead of being misreported as network failures.
- Retries transient License server 5xx responses before surfacing a failure to the user.
- Locks the standalone Kanban view for Free users so the product behavior matches the public Free vs Pro feature table.
- Adds commercial-flow regression tests for License API error handling and Pro gating.

Verification:

- `npm run check`
- `npm --prefix api run test:portal`
- Live License API `/health`, `/portal`, invalid activation, and invalid lookup checks
- Obsidian official plugin dashboard review status check for the previous release

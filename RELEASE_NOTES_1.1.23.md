# TideLog 1.1.23

This release improves Obsidian community scorecard hygiene without changing the core user workflow.

- Adds root-level Cloudflare Worker types and explicit API type imports so the license service source can be scanned without unresolved type warnings.
- Adds API type checking to the main `npm run check` validation path.
- Cleans up CSS lint warnings around duplicate selectors, short hex colors, and unnecessary `!important` rules.
- Adds `CONTRIBUTING.md` and clearer README disclosures for vault enumeration, vault reads/writes, and network access.
- Adds a GitHub release workflow that uploads release assets and generates artifact attestations for future releases.

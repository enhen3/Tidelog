# v1.1.15 — License portal entry in settings

## Feature
Added direct entries to the License portal from the TideLog settings tab so users don't have to dig through emails to find their key or manage device bindings:

- **Pro users** — a "Manage device bindings" row is shown under the Pro status, with a button that opens the portal so the user can review or unbind old devices when activating on a new machine.
- **Free / not-yet-activated users** — a "Look up my License" row is shown above the purchase link, so users who already bought but lost their email/key can recover it via order ID + email.

Both buttons open `https://tidelog-api.mydreamchronicle.com/portal` in the system browser via `window.open()`. No additional network traffic is initiated by the plugin itself; this is consistent with the network disclosure already documented in the README.

## i18n
Added 6 new strings (3 keys × zh + en) for the new settings entries:
- `settings.manageDevices`, `settings.manageDevicesDesc`, `settings.manageDevicesBtn`
- `settings.lostCode`, `settings.lostCodeDesc`, `settings.lostCodeBtn`

## Verification
- `eslint-plugin-obsidianmd` (recommended config): clean (0 errors, 0 warnings)
- `tsc --noEmit -skipLibCheck`: clean
- All four node-based test suites pass:
  - `test-bug-repro.mjs`
  - `test-evening-sop.mjs`
  - `test-save-load.mjs`
  - `test-settings-ui.mjs`

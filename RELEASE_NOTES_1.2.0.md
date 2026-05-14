# v1.2.0 — Onboarding, pricing transparency, and "Chat with past"

This release is focused on conversion: making it obvious what TideLog does,
why Pro is worth paying for, and how to get started.

## ✨ New

### First-run onboarding wizard
New users now see a 4-step wizard on first launch:
1. Welcome / what TideLog is
2. Recommended provider (OpenRouter, with a direct sign-up link) or pick another
3. Paste API key + one-click connection test
4. Optional: start a morning plan immediately to experience the full flow

Existing users are migrated to "onboarding complete" so the wizard does not
disrupt them.

### Pricing transparency
The Pro upsell modal now shows a real pricing comparison:
- **Annual** — ¥49 / year
- **Lifetime** — ¥99 (one-time, marked "best value")
- Up to 3 devices per license
- 7-day no-questions refund

Prices live in a single `PRICING` constant in `src/constants.ts` so they can
be updated in one place and propagate to ProModal, README, and any future
landing page.

### "Chat with your past self" (Pro)
A new fourth button in the Insight tab loads your last 30 days of journals
+ user profile + principles + patterns as conversation context. Ask things
like:

- "When have I felt anxious about freedom?"
- "What progress have I made this month?"
- "What recurring emotions show up lately?"

The AI grounds replies in your actual journal data and quotes specific dates.

### Anonymous telemetry (opt-out)
Lightweight, anonymous funnel tracking so we can see what works and what
doesn't:
- Events tracked: `plugin_loaded`, `onboarding_started/step/finished`,
  `sop_morning_started`, `sop_evening_started`, `insight_generated`,
  `pro_modal_shown`, `pro_modal_purchase_clicked`, `license_activated`,
  `chat_with_past_started`, `onboarding_key_test_success/fail`.
- Sent to the same Cloudflare Worker that handles licenses.
- Anonymous random ID — **not** derived from vault name or any PII.
- Opt-out toggle in Settings → Privacy.

## 🐛 Fixed

### Anthropic / Gemini: in-band system messages now respected
Both providers used to coerce `role: 'system'` mid-conversation messages into
a second consecutive `user` turn, which the Anthropic API rejects and which
confuses Gemini. They now merge any in-band system messages into the system
prompt before sending. This also fixes a long-standing latent bug in the
"chat with dashboard context" feature when used with Claude.

## ⚙️ Schema migration (v2)

Settings schema bumped to v2:
- `hasCompletedOnboarding` — added (defaults to `true` for existing users)
- `telemetryEnabled` — added (defaults to `true`, opt-out)
- `telemetryAnonymousId` — added (generated lazily on first event)

## 🔌 Worker API v3

The license worker gains two endpoints:
- `POST /events` — anonymous telemetry ingestion (public, write-only)
- `GET  /admin/events` — recent events + 7-day aggregate (admin token)

A migration (`api/migration-v3.sql`) creates the `events` table. Run with
`wrangler d1 execute tidelog-license-db --remote --file=migration-v3.sql`.

## Verification

- `tsc --noEmit -skipLibCheck`: clean
- `eslint`: clean
- Existing node-based test suites: pass

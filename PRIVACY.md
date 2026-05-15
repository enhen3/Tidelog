# TideLog Privacy Policy

Last updated: 2026-05-15

TideLog is designed for local-first use inside your Obsidian vault. The plugin does not include client-side telemetry, analytics SDKs, dynamic ads, or a self-update mechanism.

## Data stored locally

TideLog stores the following in your Obsidian vault or plugin data:

- Daily notes, plans, reviews, dashboard files, insight reports, principles, patterns, and profile notes that the plugin creates or updates.
- Plugin settings, including selected AI provider, model names, folder paths, review question customizations, and Pro license activation state.
- API keys that you enter for your selected AI provider.
- A generated TideLog device identifier used for Pro license activation.

Your vault content remains local unless you explicitly use an AI feature or another network-connected feature described below.

## AI provider requests

When you use AI-powered features, TideLog sends prompts and relevant journal content to the AI provider configured in settings. Supported providers include OpenRouter, Anthropic, Google Gemini, OpenAI, SiliconFlow, and custom OpenAI-compatible endpoints.

TideLog does not control those providers. Their handling of API keys, prompts, responses, logs, retention, and billing is governed by their own terms and privacy policies.

No AI request is made until you configure an API key or endpoint and trigger an AI feature or connection test.

## License verification

If you activate TideLog Pro, TideLog contacts `https://tidelog-api.mydreamchronicle.com`.

The license service receives:

- License key.
- Generated device identifier.
- Activation, verification, deactivation, and portal request timestamps.
- Purchase email and Afdian order ID when these are provided for license lookup or license generation.
- A short-lived hash derived from request metadata for abuse prevention and rate limiting.

The license service does not receive vault note content, AI prompts, AI responses, or AI provider API keys.

License data is used only to validate purchases, enforce the 3-device limit, provide self-service license lookup, support activation issues, prevent abuse, and process refunds or revocations.

## Purchase links

TideLog uses Afdian for purchases. When you open the purchase page, your interaction with Afdian is governed by Afdian's own terms and privacy policy.

## Server logs

The license API is hosted on Cloudflare Workers. Cloudflare may process standard request metadata such as IP address, user agent, request time, path, and response status as part of operating and securing the service.

TideLog stores D1 rate-limit counters keyed by a hash of request metadata and the current rate-limit window. These counters are not used for analytics and are periodically expired.

## Data sharing

The TideLog developer does not sell user data. Data may be shared only when required to operate the license service, comply with law, resolve fraud or abuse, or provide support that you request.

## Data deletion

To request deletion of license records associated with your purchase email or order ID, open a private support request through the support channel listed in `README.md`. Some records may need to be retained for purchase verification, refunds, fraud prevention, accounting, or legal compliance.

## Security notes

Do not post full API keys, full License keys, or private journal content in public GitHub issues.

TideLog is an Obsidian community plugin. Like other plugins, it runs inside Obsidian with access to your vault. Review the source code and install only from official releases.

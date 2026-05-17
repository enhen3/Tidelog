# TideLog 1.1.31

Commercial readiness hardening release.

## Changed

- Stores AI API keys and TideLog Pro license keys in Obsidian SecretStorage instead of ordinary plugin settings data.
- Raises the minimum Obsidian app version to 1.11.4 because SecretStorage is required.
- Masks license keys in activation failure messages so users are not encouraged to paste full keys into support channels.
- Blocks command-palette weekly/monthly insight and dashboard generation when Pro is not active, matching the visible Pro UI.

## Fixed

- Accepts common mood score input like `7` or `7/10` at the end of evening review.
- Preserves the user's joy/emotion review answer instead of overwriting it with the final numeric mood score.
- Uses cryptographically secure randomness for device IDs and license key generation.
- Returns a generic 500 error from the license API instead of exposing internal exception text.
- Removes conflicting follow-up-question instructions from evening review prompts that auto-advance to the next question.

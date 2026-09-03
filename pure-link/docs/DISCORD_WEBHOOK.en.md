# Discord Report Webhook Notifications

[繁體中文](DISCORD_WEBHOOK.zh-Hant.md)

PureLink can send optional Discord webhook notifications when new content reports are submitted. This document explains the configuration, behavior, and privacy constraints.

## Overview

- **D1 remains authoritative**: All reports are stored in D1. Discord is a best-effort notification channel only.
- **Failure isolation**: A Discord outage, webhook failure, or network error will never cause a report submission to fail.
- **Privacy-preserving**: Notifications contain only a sanitized moderation summary. Sensitive fields are explicitly excluded.

## Required Environment Variable

```text
DISCORD_REPORT_WEBHOOK_URL=https://discord.com/api/webhooks/your-webhook-id/your-webhook-token
```

Do not commit the actual webhook URL. Store it as a Worker secret in production:

```bash
npx wrangler secret put DISCORD_REPORT_WEBHOOK_URL
```

## Notification Payload

When a report is successfully stored in D1, an Discord webhook is sent with the following embed:

| Field | Description |
| --- | --- |
| Report ID | Unique identifier (Base58) |
| Category | Phishing, Malware, Impersonation, Copyright, Privacy, or Other |
| PureLink | The slug being reported |
| Reporter | Whether the reporter was "Authenticated" or "Anonymous" |
| Created | ISO timestamp in UTC |
| Summary | Sanitized and truncated report details (max 300 chars) |

## Privacy Constraints

Discord notifications explicitly exclude:

- Passwords, auth tokens, session tokens
- OAuth credentials (Google, etc.)
- Full card or payment data
- IP addresses (only HMAC-derived rate-limit keys are stored)
- Email addresses (not collected in the report form)
- Webhook secrets or API keys
- Recovery or management credentials
- Sensitive headers or cookies

Report details are sanitized before being sent:

1. Control characters are removed
2. `@everyone` and `@here` mentions are neutralized
3. Role and user mentions are stripped of their trigger prefix
4. Free-form details are truncated at 300 characters

## Webhook Behavior

- **Async delivery**: Notifications are sent via `context.waitUntil()` after the HTTP response is sent
- **5-second timeout**: Webhook requests timeout after 5 seconds to prevent blocking
- **No retries**: Failed webhooks are logged server-side but do not retry
- **allowed_mentions**: Discord `allowed_mentions.parse: []` prevents accidental notifications

## Disabling or Rotating the Webhook

1. Remove or empty `DISCORD_REPORT_WEBHOOK_URL` from your environment
2. For rotation, replace the value with the new webhook URL from your Discord channel settings
3. The old webhook will automatically stop receiving notifications once the environment variable is updated

## Security Notes

- Only the configured webhook URL receives notifications
- No user-controlled arbitrary outbound URL or fetch primitive is created
- The webhook URL is never logged; errors log only the report ID and error message
- Discord `allowed_mentions` is set to `parse: []` to prevent mention abuse

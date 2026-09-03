const MAX_DETAILS_LENGTH = 300;
const WEBHOOK_TIMEOUT_MS = 5000;
const DISCORD_MENTION_PATTERN = /@(?:everyone|here|[!&]?[0-9]{17,20})/g;
const DISCORD_WEBHOOK_PATTERN = /^https:\/\/(?:discord\.com|ptb\.discord\.com|canary\.discord\.com)\/api\/webhooks\/[0-9]{17,20}\/[-a-zA-Z0-9_]{1,100}$/;

export function isDiscordReportWebhookConfigured(env) {
  return Boolean(env.DISCORD_REPORT_WEBHOOK_URL && DISCORD_WEBHOOK_PATTERN.test(env.DISCORD_REPORT_WEBHOOK_URL));
}

export async function sendReportNotification({ report, env, context, fetchImplementation = fetch }) {
  if (!isDiscordReportWebhookConfigured(env)) return;

  const payload = buildReportPayload(report);
  const webhookUrl = String(env.DISCORD_REPORT_WEBHOOK_URL);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  const notificationPromise = (async () => {
    try {
      const response = await fetchImplementation(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        console.warn('Discord report webhook delivery failed', { status: response.status, reportId: report.id });
      }
    } catch (error) {
      const errorName = error?.name || 'Error';
      if (errorName === 'AbortError') {
        console.warn('Discord report webhook timed out', { reportId: report.id });
      } else {
        console.warn('Discord report webhook delivery failed', { errorName, reportId: report.id });
      }
    } finally {
      clearTimeout(timeoutId);
    }
  })();

  if (context?.waitUntil) {
    context.waitUntil(notificationPromise);
  }
}

export function buildReportPayload(report) {
  const details = sanitizeAndTruncateDetails(report.details);
  const fields = [
    { name: 'Report ID', value: String(report.id), inline: true },
    { name: 'Category', value: categoryDisplayName(report.category), inline: true },
    { name: 'PureLink', value: String(report.slug), inline: true },
    { name: 'Created', value: formatTimestamp(report.created_at), inline: true },
  ];

  if (details) {
    fields.push({ name: 'Summary', value: details });
  }

  return {
    embeds: [
      {
        title: 'New Report Submitted',
        color: 0xFFCC00,
        fields,
        footer: { text: 'PureLink Report System' },
      },
    ],
    allowed_mentions: { parse: [] },
  };
}

function categoryDisplayName(category) {
  const names = {
    phishing: 'Phishing',
    malware: 'Malware',
    impersonation: 'Impersonation',
    copyright: 'Copyright',
    privacy: 'Privacy',
    other: 'Other',
  };
  return names[category] || category;
}

function formatTimestamp(timestamp) {
  if (!timestamp) return 'Unknown';
  try {
    const date = new Date(timestamp);
    return date.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  } catch {
    return String(timestamp);
  }
}

const SENSITIVE_PATTERNS = [
  /(?:password|passwd|pwd)[:\s]*.{0,50}/gi,
  /(?:token|auth_token|bearer_token)[:\s]*.{0,50}/gi,
  /(?:api[_-]?key|secret[_-]?key|private[_-]?key)[:\s]*.{0,50}/gi,
  /(?:session|cookie|session[_-]?id)[:\s]*.{0,50}/gi,
  /(?:credit[_-]?card|card[_-]?number|cvv|cvc)[:\s]*.{0,50}/gi,
  /(?:google[_-]?(?:client[_-]?id|client[_-]?secret))[:\s]*.{0,50}/gi,
  /(?:oauth|authorization)[-]?[:]?\s*.{0,50}/gi,
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
];

function sanitizeAndTruncateDetails(details) {
  if (!details) return null;
  let sanitized = String(details)
    .replace(DISCORD_MENTION_PATTERN, match => match.startsWith('@') ? match.slice(1) : match)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim();
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }
  if (sanitized.length > MAX_DETAILS_LENGTH) {
    sanitized = sanitized.slice(0, MAX_DETAILS_LENGTH - 3) + '...';
  }
  return sanitized.length > 0 ? sanitized : null;
}

export function sanitizeForDiscord(value) {
  if (!value) return '';
  return String(value)
    .replace(/<@&[0-9]{17,20}>/g, match => match.replace(/<@&/, '').replace(/>/, ''))
    .replace(/<@[!&]?[0-9]{17,20}>/g, match => match.replace(/<@/, '').replace(/>/, ''))
    .replace(DISCORD_MENTION_PATTERN, match => match.startsWith('@') ? match.slice(1) : match)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim();
}

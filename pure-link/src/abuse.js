import { json } from './http.js';

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function enforceWriteProtection({ request, requestUrl, env, db, action, token, context }) {
  if (isTrustedDevelopment(requestUrl, env)) return null;

  if (!env.RATE_LIMIT_SECRET || !env.TURNSTILE_SECRET_KEY) {
    console.error('PureLink write protection is not configured.');
    return json({ error: 'This service is not ready to accept public submissions.' }, { status: 503 });
  }

  const rateLimit = await consumeRateLimit({ request, env, db, action, context });
  if (!rateLimit.allowed) {
    return json(
      { error: 'Too many requests. Please wait a little before trying again.' },
      { status: 429, headers: { 'retry-after': String(rateLimit.retryAfterSeconds) } },
    );
  }

  const turnstile = await verifyTurnstile({ token, secret: env.TURNSTILE_SECRET_KEY, action, hostname: requestUrl.hostname });
  if (!turnstile.success) {
    return json({ error: 'The anti-abuse check could not be verified. Please try again.' }, { status: 403 });
  }

  return null;
}

export async function consumeRateLimit({ request, env, db, action, context, now = Date.now() }) {
  const limits = action === 'report'
    ? { maximum: 8, windowSeconds: 60 * 60 }
    : { maximum: 20, windowSeconds: 10 * 60 };
  const windowStart = Math.floor(now / (limits.windowSeconds * 1000)) * limits.windowSeconds;
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const bucketKey = await createRateLimitKey(env.RATE_LIMIT_SECRET, action, clientIp, windowStart);
  const expiresAt = windowStart + limits.windowSeconds + 60;

  const row = await db.prepare(`
    INSERT INTO rate_limits (bucket_key, request_count, expires_at)
    VALUES (?, 1, ?)
    ON CONFLICT(bucket_key) DO UPDATE SET request_count = request_count + 1
    RETURNING request_count
  `).bind(bucketKey, expiresAt).first();

  const count = Number(row?.request_count || 1);
  context?.waitUntil?.(
    db.prepare('DELETE FROM rate_limits WHERE expires_at < ?')
      .bind(Math.floor(now / 1000))
      .run()
      .catch((error) => console.error('Rate-limit cleanup failed', { message: error?.message })),
  );
  return {
    allowed: count <= limits.maximum,
    retryAfterSeconds: Math.max(1, expiresAt - Math.floor(now / 1000)),
  };
}

export async function createRateLimitKey(secret, action, clientIp, windowStart) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${action}:${windowStart}:${clientIp}`),
  );
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function verifyTurnstile({ token, secret, action, hostname, fetchImplementation = fetch }) {
  if (!token || typeof token !== 'string') return { success: false };

  try {
    const response = await fetchImplementation(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret, response: token }),
    });
    const result = await response.json();
    return {
      success: Boolean(result.success && result.action === action && result.hostname === hostname),
    };
  } catch {
    return { success: false };
  }
}

function isTrustedDevelopment(requestUrl, env) {
  return env.APP_ENV === 'test' || ['localhost', '127.0.0.1', '[::1]'].includes(requestUrl.hostname);
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

import { describe, expect, it, vi } from 'vitest';
import { consumeAuthenticatedCheckoutRateLimit, createRateLimitKey, verifyTurnstile } from '../src/abuse.js';

describe('privacy-preserving abuse protection', () => {
  it('creates unlinkable rate-limit buckets without retaining the IP address', async () => {
    const first = await createRateLimitKey('test-secret', 'create', '203.0.113.4', 1000);
    const second = await createRateLimitKey('test-secret', 'create', '203.0.113.4', 2000);
    expect(first).not.toBe(second);
    expect(first).not.toContain('203.0.113.4');
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('accepts Turnstile only for the expected action and hostname', async () => {
    const fetchImplementation = vi.fn(async () => new Response(JSON.stringify({
      success: true,
      action: 'create',
      hostname: 'pure.example',
    })));
    await expect(verifyTurnstile({
      token: 'token',
      secret: 'secret',
      action: 'create',
      hostname: 'pure.example',
      fetchImplementation,
    })).resolves.toEqual({ success: true });
    await expect(verifyTurnstile({
      token: 'token',
      secret: 'secret',
      action: 'report',
      hostname: 'pure.example',
      fetchImplementation,
    })).resolves.toEqual({ success: false });
  });

  it('uses a short-lived opaque per-account bucket for checkout creation', async () => {
    const buckets = new Map();
    const db = { prepare(sql) {
      const statement = { values: [] };
      return {
        bind(...values) { statement.values = values; return this; },
        async first() {
          const [bucketKey, expiresAt] = statement.values;
          const bucket = buckets.get(bucketKey) || { request_count: 0, expires_at: expiresAt };
          bucket.request_count += 1;
          buckets.set(bucketKey, bucket);
          return { request_count: bucket.request_count };
        },
        async run() { return { success: true, meta: { changes: 0 } }; },
      };
    } };
    const input = { request: new Request('https://pure.example/api/billing/checkout'), env: { RATE_LIMIT_SECRET: 'test-secret' }, db, userId: 'user-123' };
    for (let attempt = 0; attempt < 5; attempt += 1) await expect(consumeAuthenticatedCheckoutRateLimit(input)).resolves.toMatchObject({ allowed: true, configured: true });
    await expect(consumeAuthenticatedCheckoutRateLimit(input)).resolves.toMatchObject({ allowed: false, configured: true });
    expect([...buckets.keys()][0]).not.toContain('user-123');
  });
});

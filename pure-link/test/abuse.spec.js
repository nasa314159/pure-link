import { describe, expect, it, vi } from 'vitest';
import { createRateLimitKey, verifyTurnstile } from '../src/abuse.js';

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
});

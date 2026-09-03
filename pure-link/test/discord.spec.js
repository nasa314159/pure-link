import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { buildReportPayload, isDiscordReportWebhookConfigured, sanitizeForDiscord } from '../src/discord.js';

describe('Discord report webhook', () => {
  describe('isDiscordReportWebhookConfigured', () => {
    it('returns false when webhook URL is not set', () => {
      expect(isDiscordReportWebhookConfigured({})).toBe(false);
    });

    it('returns false when webhook URL is empty', () => {
      expect(isDiscordReportWebhookConfigured({ DISCORD_REPORT_WEBHOOK_URL: '' })).toBe(false);
    });

    it('returns false when webhook URL does not start with https', () => {
      expect(isDiscordReportWebhookConfigured({ DISCORD_REPORT_WEBHOOK_URL: 'http://discord.com/webhook' })).toBe(false);
    });

    it('returns true when valid https webhook URL is configured', () => {
      expect(isDiscordReportWebhookConfigured({ DISCORD_REPORT_WEBHOOK_URL: 'https://discord.com/api/webhooks/123/abc' })).toBe(true);
    });
  });

  describe('buildReportPayload', () => {
    it('creates payload with required fields', () => {
      const report = { id: 'abc123', slug: 'test-link', category: 'phishing', details: 'Suspicious content', created_at: '2026-09-03T12:00:00Z', authenticated: false };
      const payload = buildReportPayload(report);

      expect(payload.embeds).toHaveLength(1);
      expect(payload.embeds[0].title).toBe('New Report Submitted');
      expect(payload.embeds[0].color).toBe(0xFFCC00);
      expect(payload.allowed_mentions.parse).toEqual([]);

      const fields = payload.embeds[0].fields;
      expect(fields.find(f => f.name === 'Report ID')?.value).toBe('abc123');
      expect(fields.find(f => f.name === 'Category')?.value).toBe('Phishing');
      expect(fields.find(f => f.name === 'PureLink')?.value).toBe('test-link');
      expect(fields.find(f => f.name === 'Reporter')?.value).toBe('Anonymous');
    });

    it('shows authenticated for authenticated reporters', () => {
      const report = { id: 'xyz789', slug: 'my-link', category: 'malware', created_at: '2026-09-03T12:00:00Z', authenticated: true };
      const payload = buildReportPayload(report);

      expect(payload.embeds[0].fields.find(f => f.name === 'Reporter')?.value).toBe('Authenticated');
    });

    it('includes summary field when details are provided', () => {
      const report = { id: 'abc123', slug: 'test-link', category: 'phishing', details: 'Bad actor', created_at: '2026-09-03T12:00:00Z', authenticated: false };
      const payload = buildReportPayload(report);

      expect(payload.embeds[0].fields.find(f => f.name === 'Summary')?.value).toBe('Bad actor');
    });

    it('does not include summary field when details are empty', () => {
      const report = { id: 'abc123', slug: 'test-link', category: 'phishing', details: '', created_at: '2026-09-03T12:00:00Z', authenticated: false };
      const payload = buildReportPayload(report);

      expect(payload.embeds[0].fields.find(f => f.name === 'Summary')).toBeUndefined();
    });
  });

  describe('sanitizeForDiscord', () => {
    it('neutralizes @everyone mention', () => {
      expect(sanitizeForDiscord('Hello @everyone')).toBe('Hello everyone');
    });

    it('neutralizes @here mention', () => {
      expect(sanitizeForDiscord('Hi @here')).toBe('Hi here');
    });

    it('neutralizes role mentions', () => {
      expect(sanitizeForDiscord('Notify <@&123456789012345678>')).toBe('Notify 123456789012345678');
    });

    it('neutralizes user mentions', () => {
      expect(sanitizeForDiscord('Message <@123456789012345678>')).toBe('Message 123456789012345678');
    });

    it('removes control characters', () => {
      expect(sanitizeForDiscord('Hello\x00World\x07')).toBe('HelloWorld');
    });

    it('returns empty string for null/undefined', () => {
      expect(sanitizeForDiscord(null)).toBe('');
      expect(sanitizeForDiscord(undefined)).toBe('');
    });
  });

  describe('long report text truncation', () => {
    it('truncates details longer than 300 characters', () => {
      const longText = 'x'.repeat(400);
      const report = { id: 'abc123', slug: 'test-link', category: 'phishing', details: longText, created_at: '2026-09-03T12:00:00Z', authenticated: false };
      const payload = buildReportPayload(report);

      const summary = payload.embeds[0].fields.find(f => f.name === 'Summary');
      expect(summary.value.length).toBeLessThanOrEqual(300);
      expect(summary.value.endsWith('...')).toBe(true);
    });

    it('does not truncate details at exactly 300 characters', () => {
      const exactText = 'x'.repeat(300);
      const report = { id: 'abc123', slug: 'test-link', category: 'phishing', details: exactText, created_at: '2026-09-03T12:00:00Z', authenticated: false };
      const payload = buildReportPayload(report);

      const summary = payload.embeds[0].fields.find(f => f.name === 'Summary');
      expect(summary.value.length).toBe(300);
      expect(summary.value.endsWith('...')).toBe(false);
    });
  });
});

describe('report submission with Discord webhook', () => {
  let db;
  let env;

  beforeEach(() => {
    db = new MemoryD1();
    env = {
      pure_link_db: db,
      APP_ENV: 'test',
      DISCORD_REPORT_WEBHOOK_URL: 'https://discord.com/api/webhooks/123456/abcdef',
    };
  });

  it('stores report when webhook is absent', async () => {
    delete env.DISCORD_REPORT_WEBHOOK_URL;

    const created = await createLinkWithWorker(env, { contentType: 'card', content: 'Test card', slug: 'webhook-test' });
    expect(created.response.status).toBe(201);

    const reportResponse = await worker.fetch(new Request('https://pure.test/api/reports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: 'webhook-test', category: 'phishing', details: 'Test report' }),
    }), env);

    expect(reportResponse.status).toBe(201);
    expect(db.reports).toHaveLength(1);
  });

  it('sends webhook after successful report storage when configured', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    try {
      const created = await createLinkWithWorker(env, { contentType: 'card', content: 'Test card', slug: 'discord-test' });
      expect(created.response.status).toBe(201);

      const reportResponse = await worker.fetch(new Request('https://pure.test/api/reports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: 'discord-test', category: 'malware', details: 'Found malware link' }),
      }), env);

      expect(reportResponse.status).toBe(201);
      expect(db.reports).toHaveLength(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe('https://discord.com/api/webhooks/123456/abcdef');
      expect(options.method).toBe('POST');
      expect(options.headers['content-type']).toBe('application/json');

      const body = JSON.parse(options.body);
      expect(body.embeds[0].fields.find(f => f.name === 'Category')?.value).toBe('Malware');
      expect(body.embeds[0].fields.find(f => f.name === 'Summary')?.value).toBe('Found malware link');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('webhook failure does not fail report creation', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('Network error');
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      const created = await createLinkWithWorker(env, { contentType: 'card', content: 'Test card', slug: 'fail-test' });
      expect(created.response.status).toBe(201);

      const reportResponse = await worker.fetch(new Request('https://pure.test/api/reports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: 'fail-test', category: 'phishing', details: 'Will fail webhook' }),
      }), env);

      expect(reportResponse.status).toBe(201);
      const body = await reportResponse.json();
      expect(body.received).toBe(true);
      expect(body.reference).toBeTruthy();
      expect(db.reports).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('webhook non-2xx response does not fail report creation', async () => {
    const fetchMock = vi.fn(async () => new Response('Internal error', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    try {
      const created = await createLinkWithWorker(env, { contentType: 'card', content: 'Test card', slug: 'error-test' });
      expect(created.response.status).toBe(201);

      const reportResponse = await worker.fetch(new Request('https://pure.test/api/reports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: 'error-test', category: 'phishing', details: 'Server error webhook' }),
      }), env);

      expect(reportResponse.status).toBe(201);
      expect(db.reports).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('webhook is not called for rejected invalid reports', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    try {
      const response = await worker.fetch(new Request('https://pure.test/api/reports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: 'nonexistent', category: 'phishing', details: 'Invalid slug' }),
      }), env);

      expect(response.status).toBe(404);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('webhook is not called for invalid category reports', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    try {
      const created = await createLinkWithWorker(env, { contentType: 'card', content: 'Test card', slug: 'cat-test' });
      expect(created.response.status).toBe(201);

      const response = await worker.fetch(new Request('https://pure.test/api/reports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: 'cat-test', category: 'invalid-category', details: 'Test' }),
      }), env);

      expect(response.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('does not include sensitive data in webhook payload', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    try {
      const created = await createLinkWithWorker(env, { contentType: 'card', content: 'Test card', slug: 'sensitive-test' });
      expect(created.response.status).toBe(201);

      const reportResponse = await worker.fetch(new Request('https://pure.test/api/reports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: 'sensitive-test', category: 'phishing', details: 'Contains password: supersecret123 and token: abc123' }),
      }), env);

      expect(reportResponse.status).toBe(201);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      const summary = body.embeds[0].fields.find(f => f.name === 'Summary')?.value;

      expect(summary).not.toContain('supersecret123');
      expect(summary).not.toContain('abc123');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('neutralizes @everyone and @here mentions in report details', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    try {
      const created = await createLinkWithWorker(env, { contentType: 'card', content: 'Test card', slug: 'mention-test' });
      expect(created.response.status).toBe(201);

      const reportResponse = await worker.fetch(new Request('https://pure.test/api/reports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: 'mention-test', category: 'phishing', details: 'Alert @everyone and @here!' }),
      }), env);

      expect(reportResponse.status).toBe(201);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      const summary = body.embeds[0].fields.find(f => f.name === 'Summary')?.value;

      expect(summary).not.toContain('@everyone');
      expect(summary).not.toContain('@here');
      expect(summary).toContain('everyone');
      expect(summary).toContain('here');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('existing abuse rate-limit behavior remains unchanged', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url.includes('challenges.cloudflare.com')) {
        return new Response(JSON.stringify({ success: true, action: 'report', hostname: 'pure.test' }));
      }
      return new Response('{}', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      const protectedEnv = {
        pure_link_db: db,
        APP_ENV: 'test',
        RATE_LIMIT_SECRET: 'rate-limit-test-secret',
        TURNSTILE_SECRET_KEY: 'turnstile-test-secret',
        TURNSTILE_SITE_KEY: 'site-key',
        DISCORD_REPORT_WEBHOOK_URL: 'https://discord.com/api/webhooks/123/abc',
      };

      const slug = 'ratelimit-same-slug';
      await createLinkWithWorker(protectedEnv, { contentType: 'card', content: 'Test', slug });

      let webhookCalls = 0;
      for (let i = 0; i < 3; i++) {
        const reportResponse = await worker.fetch(new Request('https://pure.test/api/reports', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ slug, category: 'phishing', details: 'Test' }),
        }), protectedEnv);
        expect(reportResponse.status).toBe(201);
        webhookCalls += 1;
      }

      expect(webhookCalls).toBe(3);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

async function createLinkWithWorker(env, body) {
  const response = await worker.fetch(new Request('https://pure.test/api/links', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }), env);
  return { response, body: await response.json() };
}

class MemoryD1 {
  constructor() {
    this.links = new Map();
    this.users = new Map();
    this.sessions = new Map();
    this.reports = [];
    this.nativeTokens = new Map();
    this.rateLimits = new Map();
    this.lemonCheckoutRequests = 0;
  }

  prepare(sql) {
    return new MemoryStatement(this, sql);
  }
}

class MemoryStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql.replace(/\s+/g, ' ').trim();
    this.values = [];
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  async first() {
    if (this.sql.startsWith('SELECT users.id')) {
      const userId = this.db.sessions.get(this.values[0]);
      return userId ? this.db.users.get(userId) || null : null;
    }
    if (this.sql.startsWith('SELECT balance')) return null;
    if (this.sql.startsWith('INSERT INTO rate_limits')) {
      const [bucketKey, expiresAt] = this.values;
      const current = this.db.rateLimits.get(bucketKey) || { request_count: 0, expires_at: expiresAt };
      current.request_count += 1;
      this.db.rateLimits.set(bucketKey, current);
      return { request_count: current.request_count };
    }
    if (this.sql.startsWith('UPDATE native_card_tokens')) {
      const [tokenHash, now] = this.values;
      const token = this.db.nativeTokens.get(tokenHash);
      if (!token || token.used_at != null || Number(token.expires_at) <= Number(now)) return null;
      token.used_at = '2026-08-06 00:00:00';
      return { token_hash: tokenHash };
    }
    if (this.sql.startsWith('SELECT 1 AS found')) {
      return this.db.links.has(this.values[0]) ? { found: 1 } : null;
    }
    if (this.sql.startsWith('SELECT slug, content_type')) {
      return this.db.links.get(this.values[0]) || null;
    }
    if (this.sql.startsWith('SELECT COALESCE(SUM') && this.sql.includes('lemon_support_contributions')) {
      return { net_usd_minor: 0, contribution_count: 0, unconverted_count: 0 };
    }
    throw new Error(`Unsupported first query: ${this.sql}`);
  }

  async all() {
    if (this.sql.startsWith('SELECT public_display_name FROM lemon_support_contributions')) return { results: [] };
    if (this.sql.startsWith('SELECT slug, content_type')) {
      const ownerUserId = this.values[0];
      return {
        results: [...this.db.links.values()]
          .filter((link) => link.owner_user_id === ownerUserId)
          .map(({ slug, content_type, content, signature, theme, status, created_at }) => ({ slug, content_type, content, signature, theme, status, created_at })),
      };
    }
    throw new Error(`Unsupported all query: ${this.sql}`);
  }

  async run() {
    if (this.sql.startsWith('INSERT INTO native_card_tokens')) {
      const [tokenHash, expiresAt] = this.values;
      this.db.nativeTokens.set(tokenHash, { token_hash: tokenHash, expires_at: expiresAt, used_at: null });
      return { success: true, meta: { changes: 1 } };
    }
    if (this.sql.startsWith('DELETE FROM rate_limits')) {
      return { success: true, meta: { changes: 0 } };
    }
    if (this.sql.startsWith('INSERT INTO links')) {
      const [slug, contentType, content, signature, theme, isAffiliate, managementTokenHash, ownerUserId] = this.values;
      if (this.db.links.has(slug)) throw new Error('UNIQUE constraint failed: links.slug');
      const timestamp = '2026-08-06 00:00:00';
      this.db.links.set(slug, {
        slug,
        content_type: contentType,
        content,
        signature,
        theme,
        is_affiliate: isAffiliate,
        management_token_hash: managementTokenHash,
        owner_user_id: ownerUserId,
        status: 'active',
        created_at: timestamp,
        updated_at: timestamp,
        expires_at: null,
      });
      return { success: true, meta: { changes: 1 } };
    }
    if (this.sql.startsWith('DELETE FROM links')) {
      const [slug, managementTokenHash] = this.values;
      const row = this.db.links.get(slug);
      if (!row || row.management_token_hash !== managementTokenHash) {
        return { success: true, meta: { changes: 0 } };
      }
      this.db.links.delete(slug);
      return { success: true, meta: { changes: 1 } };
    }
    if (this.sql.startsWith('INSERT INTO reports')) {
      const [id, slug, category, details] = this.values;
      this.db.reports.push({ id, slug, category, details, status: 'new' });
      return { success: true, meta: { changes: 1 } };
    }
    if (this.sql.startsWith('INSERT INTO lemon_checkout_requests')) {
      this.db.lemonCheckoutRequests += 1;
      return { success: true, meta: { changes: 1 } };
    }
    throw new Error(`Unsupported run query: ${this.sql}`);
  }
}

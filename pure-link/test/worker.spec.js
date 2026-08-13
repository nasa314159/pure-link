import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index.js';

describe('PureLink worker', () => {
  let db;
  let env;

  beforeEach(() => {
    db = new MemoryD1();
    env = { pure_link_db: db, APP_ENV: 'test' };
  });

  it('serves the local MVP status page with privacy headers', async () => {
    const response = await worker.fetch(new Request('https://pure.test/'), env);
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('<h1>Just share.</h1>');
    expect(body).toContain('<p class="lede">No ads. No needless data.</p>');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
  });

  it('shows the persistent sign-in entry when Google OAuth is configured', async () => {
    env.GOOGLE_CLIENT_ID = 'test-client';
    env.GOOGLE_CLIENT_SECRET = 'test-secret';
    const response = await worker.fetch(new Request('https://pure.test/'), env);
    const body = await response.text();
    expect(body).toContain('class="account-entry"');
    expect(body).toContain('href="/auth/google?returnTo=%2F"');
  });

  it('serves privacy, terms, and transparency disclosures', async () => {
    for (const path of ['privacy', 'terms', 'transparency']) {
      const response = await worker.fetch(new Request(`https://pure.test/${path}`), env);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('MVP 說明版本');
    }
  });

  it('fails closed for public writes when abuse protection is not configured', async () => {
    const response = await worker.fetch(new Request('https://pure.test/api/links', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contentType: 'card', content: 'Do not create this' }),
    }), { pure_link_db: db });
    expect(response.status).toBe(503);
    expect(db.links.size).toBe(0);
  });

  it('requires an authenticated same-origin account for formula AI', async () => {
    env.GOOGLE_CLIENT_ID = 'test-client';
    env.GOOGLE_CLIENT_SECRET = 'test-secret';
    const invalidOrigin = await worker.fetch(new Request('https://pure.test/api/formulas/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ description: 'energy equals mass times light speed squared' }),
    }), env);
    expect(invalidOrigin.status).toBe(403);

    const signedOut = await worker.fetch(new Request('https://pure.test/api/formulas/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://pure.test' },
      body: JSON.stringify({ description: 'energy equals mass times light speed squared' }),
    }), env);
    expect(signedOut.status).toBe(401);
    expect(await signedOut.json()).toMatchObject({ loginUrl: '/auth/google?returnTo=%2F%23formula-ai' });
  });

  it('creates, redirects, and previews a URL', async () => {
    const created = await createLink(env, {
      contentType: 'url',
      content: 'https://example.com/shop?ref=friend',
      slug: 'kind-link',
      isAffiliate: true,
    });
    expect(created.response.status).toBe(201);
    expect(created.body.url).toBe('https://pure.test/kind-link');
    expect(created.body.previewUrl).toBe('https://pure.test/kind-link+');
    expect(created.body.managementToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const management = await worker.fetch(new Request(created.body.managementUrl), env);
    expect(management.status).toBe(200);
    expect(await management.text()).toContain('查看分享內容');
    expect(management.headers.get('content-security-policy')).toMatch(/script-src 'self' 'nonce-[^']+'/);

    const redirect = await worker.fetch(new Request(created.body.url, { redirect: 'manual' }), env);
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get('location')).toBe('https://example.com/shop?ref=friend');

    const headRedirect = await worker.fetch(new Request(created.body.url, { method: 'HEAD', redirect: 'manual' }), env);
    expect(headRedirect.status).toBe(302);
    expect(headRedirect.headers.get('location')).toBe('https://example.com/shop?ref=friend');

    const preview = await worker.fetch(new Request(created.body.previewUrl), env);
    const previewHtml = await preview.text();
    expect(previewHtml).toContain('example.com');
    expect(previewHtml).toContain('may provide referral or affiliate benefit');
    expect(preview.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('escapes creator content rather than executing it', async () => {
    const created = await createLink(env, {
      contentType: 'card',
      content: '</script><script>alert(1)</script>',
      signature: '<img src=x onerror=alert(1)>',
      theme: 'night',
    });
    const response = await worker.fetch(new Request(created.body.url), env);
    const body = await response.text();
    expect(body).not.toContain('</script><script>alert(1)</script>');
    expect(body).toContain('&lt;/script&gt;');
    expect(body).toContain('theme-night');
    expect(body).toContain('下載 PNG');
  });

  it('uses the configured public origin and links formula previews to the rendered content', async () => {
    env.PUBLIC_ORIGIN = 'https://no-no.uk';
    const created = await createLink(env, { contentType: 'formula', content: 'x² + y²' });
    expect(created.body.url).toBe(`https://no-no.uk/${created.body.slug}`);
    expect(created.body.previewUrl).toBe(created.body.url);
    expect(created.body.previewLabel).toBe('查看公式');
    expect(created.body.contentType).toBe('formula');
  });

  it('deletes anonymous content only with its management token', async () => {
    const created = await createLink(env, { contentType: 'formula', content: 'E=mc^2' });
    const slug = created.body.slug;

    const denied = await worker.fetch(new Request(`https://pure.test/api/links/${slug}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${'x'.repeat(43)}` },
    }), env);
    expect(denied.status).toBe(404);

    const deleted = await worker.fetch(new Request(`https://pure.test/api/links/${slug}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${created.body.managementToken}` },
    }), env);
    expect(deleted.status).toBe(204);

    const missing = await worker.fetch(new Request(created.body.url), env);
    expect(missing.status).toBe(404);
  });

  it('does not allow reserved or duplicate custom links', async () => {
    const reserved = await createLink(env, { contentType: 'card', content: 'Hello', slug: 'privacy' });
    expect(reserved.response.status).toBe(400);

    const first = await createLink(env, { contentType: 'card', content: 'First', slug: 'same' });
    const duplicate = await createLink(env, { contentType: 'card', content: 'Second', slug: 'same' });
    expect(first.response.status).toBe(201);
    expect(duplicate.response.status).toBe(409);
  });

  it('accepts a report for an existing PureLink', async () => {
    const created = await createLink(env, { contentType: 'card', content: 'Report test', slug: 'report-me' });
    expect(created.response.status).toBe(201);

    const reportPage = await worker.fetch(new Request('https://pure.test/report/report-me'), env);
    expect(reportPage.status).toBe(200);
    expect(await reportPage.text()).toContain('協助我們保持這裡乾淨');

    const response = await worker.fetch(new Request('https://pure.test/api/reports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: 'report-me', category: 'phishing', details: 'Suspicious destination.' }),
    }), env);
    expect(response.status).toBe(201);
    expect(db.reports).toHaveLength(1);
  });
});

async function createLink(env, body) {
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
    this.reports = [];
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
    if (this.sql.startsWith('SELECT 1 AS found')) {
      return this.db.links.has(this.values[0]) ? { found: 1 } : null;
    }
    if (this.sql.startsWith('SELECT slug, content_type')) {
      return this.db.links.get(this.values[0]) || null;
    }
    throw new Error(`Unsupported first query: ${this.sql}`);
  }

  async run() {
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
    throw new Error(`Unsupported run query: ${this.sql}`);
  }
}

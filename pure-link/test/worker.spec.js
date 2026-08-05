import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index.js';

describe('PureLink worker', () => {
  let db;
  let env;

  beforeEach(() => {
    db = new MemoryD1();
    env = { pure_link_db: db };
  });

  it('serves the local MVP status page with privacy headers', async () => {
    const response = await worker.fetch(new Request('https://pure.test/'), env);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Share clearly');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
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
    expect(await management.text()).toContain('Keep this access safe');
    expect(management.headers.get('content-security-policy')).toContain("script-src 'nonce-");

    const redirect = await worker.fetch(new Request(created.body.url, { redirect: 'manual' }), env);
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get('location')).toBe('https://example.com/shop?ref=friend');

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
      const [slug, contentType, content, signature, theme, isAffiliate, managementTokenHash] = this.values;
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
    throw new Error(`Unsupported run query: ${this.sql}`);
  }
}

import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';

describe('PureLink worker', () => {
  let db;
  let env;

  beforeEach(() => {
    db = new MemoryD1();
    env = { pure_link_db: db, APP_ENV: 'test' };
  });

  it('serves the local MVP status page with privacy headers', async () => {
    const redirect = await worker.fetch(new Request('https://pure.test/', { redirect: 'manual' }), env);
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get('location')).toBe('/en/');
    expect(redirect.headers.get('set-cookie')).toBeNull();
    const response = await worker.fetch(new Request('https://pure.test/en/'), env);
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
    const response = await worker.fetch(new Request('https://pure.test/en/'), env);
    const body = await response.text();
    expect(body).toContain('class="account-entry"');
    expect(body).toContain('href="/auth/google?returnTo=%2Fen%2F"');
  });

  it('resolves locale routes without touching shared-content semantics', async () => {
    const chinese = await worker.fetch(new Request('https://pure.test/', { headers: { 'accept-language': 'zh-TW' }, redirect: 'manual' }), env);
    expect(chinese.headers.get('location')).toBe('/zh-Hant/');
    expect(chinese.headers.get('set-cookie')).toBeNull();

    const preference = await worker.fetch(new Request('https://pure.test/', { headers: { cookie: 'purelink_locale=en', 'accept-language': 'zh-TW' }, redirect: 'manual' }), env);
    expect(preference.headers.get('location')).toBe('/en/');

    const english = await worker.fetch(new Request('https://pure.test/en/', { redirect: 'manual' }), env);
    expect(english.status).toBe(200);
    expect(english.headers.get('location')).toBeNull();
    const englishHtml = await english.text();
    expect(englishHtml).toContain('<html lang="en">');
    expect(englishHtml).toContain('hreflang="zh-Hant"');
    expect(englishHtml).toContain('Quick open a PureLink');

    const cookieChineseEnglishRoute = await worker.fetch(new Request('https://pure.test/en/', { headers: { cookie: 'purelink_locale=zh-Hant' } }), env);
    expect(await cookieChineseEnglishRoute.text()).toContain('Quick open a PureLink');

    const cookieEnglishChineseRoute = await worker.fetch(new Request('https://pure.test/zh-Hant/', { headers: { cookie: 'purelink_locale=en' } }), env);
    expect(await cookieEnglishChineseRoute.text()).toContain('快速開啟 PureLink');

    const selected = await worker.fetch(new Request('https://pure.test/locale', {
      method: 'POST', headers: { origin: 'https://pure.test', 'content-type': 'application/x-www-form-urlencoded' },
      body: 'locale=zh-Hant&returnTo=%2Fzh-Hant%2Fprivacy', redirect: 'manual',
    }), env);
    expect(selected.status).toBe(303);
    expect(selected.headers.get('location')).toBe('/zh-Hant/privacy');
    expect(selected.headers.get('set-cookie')).toContain('purelink_locale=zh-Hant');
    expect(selected.headers.get('set-cookie')).toContain('HttpOnly');

    const created = await createLink(env, { contentType: 'url', content: 'https://example.com', slug: 'locale-proof' });
    const open = await worker.fetch(new Request('https://pure.test/locale-proof', { headers: { 'accept-language': 'zh-TW' }, redirect: 'manual' }), env);
    expect(open.status).toBe(302);
    expect(open.headers.get('location')).toBe('https://example.com/');
    const preview = await worker.fetch(new Request('https://pure.test/locale-proof+', { headers: { 'accept-language': 'zh-TW' } }), env);
    expect(await preview.text()).toContain('<html lang="zh-Hant">');

    const prefixedShared = await worker.fetch(new Request('https://pure.test/en/locale-proof', { redirect: 'manual' }), env);
    expect(prefixedShared.status).toBe(404);

    const ordinary = await worker.fetch(new Request('https://pure.test/not-a-locale', { redirect: 'manual' }), env);
    expect(ordinary.status).toBe(404);
    expect(ordinary.headers.get('location')).toBeNull();
  });

  it('serves privacy, terms, transparency, AI credit, and refund disclosures', async () => {
    for (const path of ['privacy', 'terms', 'transparency', 'ai-credits', 'refund-policy']) {
      const response = await worker.fetch(new Request(`https://pure.test/en/${path}`), env);
      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).toMatch(/MVP 說明版本|Last updated/);
    }
  });

  it('publishes a public-only sitemap and points robots.txt to it', async () => {
    env.PUBLIC_ORIGIN = 'https://no-no.uk';
    const robots = await worker.fetch(new Request('https://pure.test/robots.txt'), env);
    expect(robots.status).toBe(200);
    expect(robots.headers.get('content-type')).toContain('text/plain');
    const robotsBody = await robots.text();
    expect(robotsBody).toContain('Allow: /');
    expect(robotsBody).toContain('Disallow: /manage/');
    expect(robotsBody).toContain('Sitemap: https://no-no.uk/sitemap.xml');

    const sitemap = await worker.fetch(new Request('https://pure.test/sitemap.xml'), env);
    expect(sitemap.status).toBe(200);
    expect(sitemap.headers.get('content-type')).toContain('application/xml');
    const sitemapBody = await sitemap.text();
    expect(sitemapBody).toContain('<loc>https://no-no.uk/en/</loc>');
    expect(sitemapBody).toContain('<loc>https://no-no.uk/en/privacy</loc>');
    expect(sitemapBody).toContain('<loc>https://no-no.uk/en/ai-credits</loc>');
    expect(sitemapBody).not.toContain('/account');
    expect(sitemapBody).not.toContain('/manage/');

    for (const path of ['en/', 'robots.txt', 'sitemap.xml', 'en/privacy']) {
      const head = await worker.fetch(new Request(`https://pure.test/${path}`, { method: 'HEAD' }), env);
      expect(head.status).toBe(200);
      expect(await head.text()).toBe('');
    }
  });

  it('serves social and favicon assets for GET and HEAD requests', async () => {
    env.ASSETS = {
      fetch: async (request) => new Response(request.method === 'HEAD' ? null : 'brand asset', {
        headers: { 'content-type': request.url.endsWith('.svg') ? 'image/svg+xml' : 'image/png' },
      }),
    };

    for (const path of ['favicon.svg', 'og.png']) {
      const get = await worker.fetch(new Request(`https://pure.test/${path}`), env);
      expect(get.status).toBe(200);
      expect(get.headers.get('content-type')).toContain('image/');
      expect(await get.text()).toBe('brand asset');

      const head = await worker.fetch(new Request(`https://pure.test/${path}`, { method: 'HEAD' }), env);
      expect(head.status).toBe(200);
      expect(head.headers.get('content-type')).toContain('image/');
      expect(await head.text()).toBe('');
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

  it('serves a noindex, localized native Turnstile verification page only at its dedicated route', async () => {
    env.TURNSTILE_SITE_KEY = 'site-key';
    const response = await worker.fetch(new Request('https://pure.test/native/verify?locale=zh-Hant'), env);
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('<html lang="zh-Hant">');
    expect(body).toContain('noindex, nofollow, noarchive');
    expect(body).toContain('native-card-create');
    expect(body).toContain('/api/native/challenge/complete');
  });

  it('requires a verified, expected-host/action Turnstile response before issuing an opaque native Card token', async () => {
    const protectedEnv = {
      pure_link_db: db,
      PUBLIC_ORIGIN: 'https://no-no.uk',
      RATE_LIMIT_SECRET: 'rate-limit-test-secret',
      TURNSTILE_SECRET_KEY: 'turnstile-test-secret',
    };
    for (const verification of [
      { success: false, action: 'native-card-create', hostname: 'no-no.uk' },
      { success: true, action: 'create', hostname: 'no-no.uk' },
      { success: true, action: 'native-card-create', hostname: 'evil.example' },
    ]) {
      const rejected = await completeNativeChallenge(protectedEnv, verification);
      expect(rejected.response.status).toBe(403);
      expect(db.nativeTokens.size).toBe(0);
    }

    const missing = await worker.fetch(new Request('https://no-no.uk/api/native/challenge/complete', {
      method: 'POST',
      headers: { origin: 'https://no-no.uk', 'content-type': 'application/json' },
      body: JSON.stringify({}),
    }), protectedEnv);
    expect(missing.status).toBe(403);

    const valid = await completeNativeChallenge(protectedEnv, { success: true, action: 'native-card-create', hostname: 'no-no.uk' });
    expect(valid.response.status).toBe(201);
    expect(valid.body.nativeCreateToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(valid.body.expiresIn).toBe(120);
    expect(db.nativeTokens.size).toBe(1);
    expect([...db.nativeTokens.keys()][0]).not.toBe(valid.body.nativeCreateToken);
    expect(JSON.stringify([...db.nativeTokens.values()])).not.toContain(valid.body.nativeCreateToken);
  });

  it('creates exactly one Card from a native token and exposes only its public URL', async () => {
    const token = (await issueTestNativeToken(env)).nativeCreateToken;
    const created = await postNativeCard(env, { content: 'Approved local bundle', nativeCreateToken: token });
    expect(created.response.status).toBe(201);
    expect(created.body).toEqual({ url: expect.stringMatching(/^https:\/\/pure\.test\/[A-Za-z0-9]+$/) });
    const stored = db.links.get(created.body.url.split('/').pop());
    expect(stored.content_type).toBe('card');
    expect(stored.content).toBe('Approved local bundle');

    const replay = await postNativeCard(env, { content: 'Replay', nativeCreateToken: token });
    expect(replay.response.status).toBe(403);
    expect(db.links.size).toBe(1);
  });

  it('rejects malformed or expanded native requests before consuming their authorization', async () => {
    const token = (await issueTestNativeToken(env)).nativeCreateToken;
    const expanded = await postNativeCard(env, { content: 'Approved', nativeCreateToken: token, contentType: 'url', slug: 'not-allowed' });
    expect(expanded.response.status).toBe(400);
    const tooLong = await postNativeCard(env, { content: 'x'.repeat(1001), nativeCreateToken: token });
    expect(tooLong.response.status).toBe(400);
    const valid = await postNativeCard(env, { content: 'Still usable after validation errors', nativeCreateToken: token });
    expect(valid.response.status).toBe(201);

    const malformed = await postNativeCard(env, { content: 'Nope', nativeCreateToken: 'short' });
    expect(malformed.response.status).toBe(400);
  });

  it('atomically prevents repeated, concurrent, and expired native token use from creating two Cards', async () => {
    const concurrentToken = (await issueTestNativeToken(env)).nativeCreateToken;
    const [first, second] = await Promise.all([
      postNativeCard(env, { content: 'First concurrent Card', nativeCreateToken: concurrentToken }),
      postNativeCard(env, { content: 'Second concurrent Card', nativeCreateToken: concurrentToken }),
    ]);
    expect([first.response.status, second.response.status].sort()).toEqual([201, 403]);
    expect(db.links.size).toBe(1);

    const expiring = await issueTestNativeToken(env);
    db.nativeTokens.get(expiring.tokenHash).expires_at = 0;
    const expired = await postNativeCard(env, { content: 'Expired', nativeCreateToken: expiring.nativeCreateToken });
    expect(expired.response.status).toBe(403);
    expect(db.links.size).toBe(1);
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
    expect(await signedOut.json()).toMatchObject({ loginUrl: '/auth/google?returnTo=%2Fen%2F%23formula-ai' });
  });

  it('uses the active localized page locale for API-facing copy', async () => {
    const chinesePage = await worker.fetch(new Request('https://pure.test/zh-Hant/', { headers: { 'accept-language': 'en-US' } }), env);
    expect(await chinesePage.text()).toContain('<html lang="zh-Hant">');

    const chineseCreate = await worker.fetch(new Request('https://pure.test/api/links', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-purelink-locale': 'zh-Hant', 'accept-language': 'en-US' },
      body: JSON.stringify({ contentType: 'card', content: '繁體中文 API 複本' }),
    }), env);
    expect((await chineseCreate.json()).previewLabel).toBe('查看小卡');

    const chineseFormula = await worker.fetch(new Request('https://pure.test/api/formulas/generate', {
      method: 'POST',
      headers: { origin: 'https://pure.test', 'content-type': 'application/json', 'x-purelink-locale': 'zh-Hant', 'accept-language': 'en-US' },
      body: JSON.stringify({ description: 'E equals mc squared' }),
    }), env);
    expect(await chineseFormula.json()).toMatchObject({ error: '請先登入再使用公式生成。', loginUrl: '/auth/google?returnTo=%2Fzh-Hant%2F%23formula-ai' });

    const chineseReport = await worker.fetch(new Request('https://pure.test/api/reports', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-purelink-locale': 'zh-Hant', 'accept-language': 'en-US' },
      body: JSON.stringify({ slug: 'missing-zh', category: 'phishing' }),
    }), env);
    expect(await chineseReport.json()).toMatchObject({ error: '找不到這個 PureLink。' });

    const englishPage = await worker.fetch(new Request('https://pure.test/en/', { headers: { 'accept-language': 'zh-TW' } }), env);
    expect(await englishPage.text()).toContain('<html lang="en">');

    const englishCreate = await worker.fetch(new Request('https://pure.test/api/links', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-purelink-locale': 'en', 'accept-language': 'zh-TW' },
      body: JSON.stringify({ contentType: 'card', content: 'English API copy' }),
    }), env);
    expect((await englishCreate.json()).previewLabel).toBe('View card');

    const englishFormula = await worker.fetch(new Request('https://pure.test/api/formulas/generate', {
      method: 'POST',
      headers: { origin: 'https://pure.test', 'content-type': 'application/json', 'x-purelink-locale': 'en', 'accept-language': 'zh-TW' },
      body: JSON.stringify({ description: 'E equals mc squared' }),
    }), env);
    expect(await englishFormula.json()).toMatchObject({ error: 'Sign in before using formula generation.', loginUrl: '/auth/google?returnTo=%2Fen%2F%23formula-ai' });

    const englishReport = await worker.fetch(new Request('https://pure.test/api/reports', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-purelink-locale': 'en', 'accept-language': 'zh-TW' },
      body: JSON.stringify({ slug: 'missing-en', category: 'phishing' }),
    }), env);
    expect(await englishReport.json()).toMatchObject({ error: 'This PureLink could not be found.' });
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
    expect(await management.text()).toContain('View shared content');
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
    expect(body).toContain('Download PNG');
  });

  it('uses the configured public origin and links formula previews to the rendered content', async () => {
    env.PUBLIC_ORIGIN = 'https://no-no.uk';
    const created = await createLink(env, { contentType: 'formula', content: 'x² + y²' });
    expect(created.body.url).toBe(`https://no-no.uk/${created.body.slug}`);
    expect(created.body.previewUrl).toBe(created.body.url);
    expect(created.body.previewLabel).toBe('View formula');
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
    expect(await reportPage.text()).toContain('Help keep this space clean');

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

async function completeNativeChallenge(env, verification) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(verification))));
  try {
    const response = await worker.fetch(new Request('https://no-no.uk/api/native/challenge/complete', {
      method: 'POST',
      headers: { origin: 'https://no-no.uk', 'content-type': 'application/json' },
      body: JSON.stringify({ turnstileToken: 'turnstile-token' }),
    }), env);
    return { response, body: await response.json() };
  } finally {
    vi.unstubAllGlobals();
  }
}

async function issueTestNativeToken(env) {
  const response = await worker.fetch(new Request('https://pure.test/api/native/challenge/complete', {
    method: 'POST',
    headers: { origin: 'https://pure.test', 'content-type': 'application/json' },
    body: JSON.stringify({ turnstileToken: 'development-bypass' }),
  }), env);
  const body = await response.json();
  const tokenHash = [...env.pure_link_db.nativeTokens.keys()].at(-1);
  return { ...body, tokenHash };
}

async function postNativeCard(env, body) {
  const response = await worker.fetch(new Request('https://pure.test/api/native/cards', {
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
    this.nativeTokens = new Map();
    this.rateLimits = new Map();
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
    throw new Error(`Unsupported first query: ${this.sql}`);
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
    throw new Error(`Unsupported run query: ${this.sql}`);
  }
}

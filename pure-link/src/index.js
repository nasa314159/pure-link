import { normalizeCreateInput, ValidationError } from './content.js';
import { finishGoogleAuth, getCurrentUser, isGoogleAuthConfigured, logout, requireSameOrigin, startGoogleAuth } from './auth.js';
import { enforceWriteProtection } from './abuse.js';
import { recordAggregateMetric } from './analytics.js';
import { html, json, noContent, redirect, text, xml } from './http.js';
import { renderAccountPage, renderCardPage, renderFormulaPage, renderHomePage, renderLegalPage, renderManagePage, renderNotFoundPage, renderReportPage, renderUrlPreview } from './pages.js';
import { FormulaAiError, generateFormulaDraft } from './formula-ai.js';
import { createLinkRepository } from './repository.js';
import { createReport as storeReport, normalizeReportInput } from './reports.js';
import { createManagementToken, createSlug, hashManagementToken } from './security.js';
import { BillingError, createCheckout, getCreditBalance, handleCreemWebhook, isCheckoutConfigured } from './billing.js';
import { getMessages, localeCookie, localizedPath, normalizeLocale, parseLocaleRoute, resolveLocale, resolveResponseLocale } from './i18n.js';

export default {
  async fetch(request, env, context) {
    try {
      return await routeRequest(request, env, context);
    } catch (error) {
      if (error instanceof ValidationError) {
        return json({ error: error.message, field: error.field || null }, { status: 400 });
      }
      if (error instanceof BillingError) {
        return json({ error: error.message }, { status: error.status });
      }
      console.error('PureLink request failed', { name: error?.name, message: error?.message });
      return json({ error: 'PureLink could not complete this request.' }, { status: 500 });
    }
  },
};

export async function routeRequest(request, env, context) {
  const requestUrl = new URL(request.url);
  const originalPath = safePathname(requestUrl.pathname);
  const localeRoute = parseLocaleRoute(originalPath);
  const locale = resolveLocale(request, localeRoute?.locale);
  const path = localeRoute ? localeRoute.path : originalPath;
  const repository = createLinkRepository(env.pure_link_db);
  const isPublicRead = request.method === 'GET' || request.method === 'HEAD';

  if (request.method === 'POST' && originalPath === 'locale') {
    if (!requireSameOrigin(request, env)) return json({ error: 'Invalid request origin.' }, { status: 403 });
    const form = await request.formData();
    const selected = normalizeLocale(form.get('locale')) || resolveLocale(request);
    const returnTo = safeLocaleReturnTo(form.get('returnTo'), selected);
    return redirect(returnTo, 303, { headers: { 'set-cookie': localeCookie(selected) } });
  }

  if (isPublicRead && originalPath === '') {
    return redirect(localizedPath(locale), 302);
  }
  if (isPublicRead && localeRoute && path === '') {
    const nonce = createSlug() + createSlug();
    const turnstileSiteKey = env.TURNSTILE_SITE_KEY || '';
    const googleAuthConfigured = isGoogleAuthConfigured(env);
    const user = googleAuthConfigured ? await getCurrentUser(request, env) : null;
    return publicReadResponse(request, html(renderHomePage(nonce, turnstileSiteKey, googleAuthConfigured, requestUrl.searchParams.get('auth'), user, locale), {}, { scriptNonce: nonce, turnstile: Boolean(turnstileSiteKey) }));
  }
  if (isPublicRead && path === 'robots.txt') {
    const origin = publicOrigin(requestUrl, env);
    return publicReadResponse(request, text([
      'User-agent: *',
      'Allow: /',
      'Disallow: /account',
      'Disallow: /auth/',
      'Disallow: /manage/',
      'Disallow: /report/',
      'Disallow: /api/',
      'Disallow: /en/account',
      'Disallow: /zh-Hant/account',
      'Disallow: /en/manage/',
      'Disallow: /zh-Hant/manage/',
      'Disallow: /en/report/',
      'Disallow: /zh-Hant/report/',
      `Sitemap: ${origin}/sitemap.xml`,
      '',
    ].join('\n'), { headers: { 'cache-control': 'public, max-age=3600' } }));
  }
  if (isPublicRead && path === 'sitemap.xml') {
    return publicReadResponse(request, xml(renderSitemap(publicOrigin(requestUrl, env)), {
      headers: { 'cache-control': 'public, max-age=3600, stale-while-revalidate=86400' },
    }));
  }
  if (isPublicRead && ['privacy', 'terms', 'transparency', 'ai-credits', 'refund-policy'].includes(path)) {
    if (!localeRoute) return redirect(localizedPath(locale, path), 302);
    return publicReadResponse(request, html(renderLegalPage(path, locale)));
  }

  if (isPublicRead && (path.startsWith('assets/') || ['favicon.svg', 'og.png'].includes(path))) {
    if (!env.ASSETS) return text('Asset not found.', { status: 404 });
    return env.ASSETS.fetch(request);
  }

  if (request.method === 'GET' && path === 'auth/google') return startGoogleAuth(request, env);
  if (request.method === 'GET' && path === 'auth/google/callback') return finishGoogleAuth(request, env);
  if (request.method === 'POST' && path === 'auth/logout') {
    if (!requireSameOrigin(request, env)) return json({ error: 'Invalid request origin.' }, { status: 403 });
    return logout(request, env);
  }
  if (request.method === 'POST' && path === 'api/webhooks/creem') {
    return handleCreemWebhook(request, env);
  }
  if (request.method === 'GET' && path === 'account') {
    if (!localeRoute) return redirect(localizedPath(locale, 'account'), 302);
    const user = await getCurrentUser(request, env);
    if (!user) return redirect(`/auth/google?returnTo=${encodeURIComponent(localizedPath(locale, 'account'))}`);
    const nonce = createSlug() + createSlug();
    return html(renderAccountPage(
      user,
      await repository.listByOwner(user.id),
      await getCreditBalance(env.pure_link_db, user.id),
      isCheckoutConfigured(env),
      requestUrl.searchParams.get('purchase'),
      nonce,
      locale,
    ), {}, { scriptNonce: nonce });
  }

  if (request.method === 'POST' && path === 'api/billing/checkout') {
    if (!request.headers.get('origin') || !requireSameOrigin(request, env)) {
      return json({ error: 'Invalid request origin.' }, { status: 403 });
    }
    const user = await getCurrentUser(request, env);
    if (!user) return json({ error: '請先登入再購買 AI 公式額度。' }, { status: 401 });
    return json(await createCheckout({ requestUrl, user, env }));
  }

  if (request.method === 'POST' && (path === 'api/links' || path === 'api/create')) {
    return createLink(request, requestUrl, repository, env, context);
  }

  if (request.method === 'POST' && path === 'api/formulas/generate') {
    return generateFormula(request, env);
  }

  if (request.method === 'POST' && path === 'api/reports') {
    return submitReport(request, requestUrl, env, context);
  }

  if (request.method === 'DELETE' && path.startsWith('api/links/')) {
    const slug = path.slice('api/links/'.length);
    return deleteLink(request, slug, repository, env);
  }

  if (request.method === 'POST' && path.startsWith('api/links/') && path.endsWith('/claim')) {
    if (!requireSameOrigin(request, env)) return json({ error: 'Invalid request origin.' }, { status: 403 });
    const slug = path.slice('api/links/'.length, -'/claim'.length);
    return claimLink(request, slug, repository, env);
  }

  if (request.method === 'GET' && path.startsWith('manage/')) {
    const slug = path.slice('manage/'.length);
    if (!slug || slug.includes('/')) return html(renderNotFoundPage(locale), { status: 404 });
    const link = await repository.findBySlug(slug);
    if (!isAvailable(link)) return html(renderNotFoundPage(locale), { status: 404 });
    const nonce = createSlug() + createSlug();
    const user = await getCurrentUser(request, env);
    return html(renderManagePage(link, nonce, user, isGoogleAuthConfigured(env), locale), {}, { scriptNonce: nonce });
  }

  if (request.method === 'GET' && path.startsWith('report/')) {
    const slug = path.slice('report/'.length);
    if (!slug || slug.includes('/')) return html(renderNotFoundPage(locale), { status: 404 });
    const nonce = createSlug() + createSlug();
    const turnstileSiteKey = env.TURNSTILE_SITE_KEY || '';
    return html(renderReportPage(slug, nonce, turnstileSiteKey, locale), {}, { scriptNonce: nonce, turnstile: Boolean(turnstileSiteKey) });
  }

  // A supported locale prefix is never a second spelling of a shared link.
  // Keep /slug and /slug+ as the only shared-content routes.
  if (localeRoute) return html(renderNotFoundPage(locale), { status: 404 });

  if (!['GET', 'HEAD'].includes(request.method) || path.includes('/')) return html(renderNotFoundPage(locale), { status: 404 });

  const isPreview = path.endsWith('+');
  const slug = isPreview ? path.slice(0, -1) : path;
  if (!slug) return html(renderNotFoundPage(locale), { status: 404 });

  const link = await repository.findBySlug(slug);
  if (!isAvailable(link)) return html(renderNotFoundPage(locale), { status: 404 });

  if (link.content_type === 'url') {
    if (request.method === 'GET') recordAggregateMetric({ context, db: env.pure_link_db, request, metricName: isPreview ? 'preview' : 'open', contentType: 'url' });
    return isPreview ? html(renderUrlPreview(link, locale)) : redirect(link.content, 302);
  }
  if (link.content_type === 'formula') {
    if (request.method === 'GET') recordAggregateMetric({ context, db: env.pure_link_db, request, metricName: 'open', contentType: 'formula' });
    return html(renderFormulaPage(link, locale));
  }
  if (link.content_type === 'card') {
    if (request.method === 'GET') recordAggregateMetric({ context, db: env.pure_link_db, request, metricName: 'open', contentType: 'card' });
    return html(renderCardPage(link, locale));
  }
  return html(renderNotFoundPage(locale), { status: 404 });
}

function safeLocaleReturnTo(value, locale) {
  const path = String(value || '');
  if (path.startsWith('/') && !path.startsWith('//')) return path;
  return localizedPath(locale);
}

async function createLink(request, requestUrl, repository, env, context) {
  const messages = getMessages(resolveResponseLocale(request));
  const input = await readCreateInput(request);
  const protectionResponse = await enforceWriteProtection({
    request,
    requestUrl,
    env,
    db: env.pure_link_db,
    action: 'create',
    token: input.turnstileToken || input['cf-turnstile-response'],
    context,
  });
  if (protectionResponse) return protectionResponse;
  const normalized = normalizeCreateInput(input);
  const managementToken = createManagementToken();
  const managementTokenHash = await hashManagementToken(managementToken);

  let slug = normalized.slug;
  if (slug && await repository.exists(slug)) {
    return json({ error: messages.api.customLinkTaken, field: 'slug' }, { status: 409 });
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    slug ||= createSlug();
    if (await repository.exists(slug)) {
      slug = '';
      continue;
    }

    try {
      const user = await getCurrentUser(request, env);
      await repository.create({ ...normalized, slug, managementTokenHash, ownerUserId: user?.id || null });
      const origin = publicOrigin(requestUrl, env);
      recordAggregateMetric({ context, db: env.pure_link_db, request, metricName: 'create', contentType: normalized.contentType });
      return json({
        slug,
        contentType: normalized.contentType,
        url: `${origin}/${slug}`,
        previewUrl: normalized.contentType === 'url' ? `${origin}/${slug}+` : `${origin}/${slug}`,
        previewLabel: normalized.contentType === 'url' ? messages.home.client.previewUrl : normalized.contentType === 'formula' ? messages.home.client.previewFormula : messages.home.client.previewCard,
        managementUrl: `${origin}/manage/${slug}#${managementToken}`,
        managementToken,
      }, { status: 201 });
    } catch (error) {
      if (!isUniqueConstraintError(error) || normalized.slug) throw error;
      slug = '';
    }
  }

  return json({ error: messages.api.uniqueLinkFailed }, { status: 503 });
}

async function generateFormula(request, env) {
  const messages = getMessages(resolveResponseLocale(request));
  if (!request.headers.get('origin') || !requireSameOrigin(request, env)) {
    return json({ error: messages.api.invalidRequest }, { status: 403 });
  }
  const user = await getCurrentUser(request, env);
  if (!user) {
    const locale = resolveResponseLocale(request);
    return json({ error: messages.api.formulaSignIn, loginUrl: `/auth/google?returnTo=${encodeURIComponent(`${localizedPath(locale)}#formula-ai`)}` }, { status: 401 });
  }

  try {
    const input = await readCreateInput(request);
    return json(await generateFormulaDraft({
      description: input.description,
      userId: user.id,
      db: env.pure_link_db,
      ai: env.AI,
      dailyLimit: Number(user.is_admin) === 1 ? 100 : 5,
      isAdmin: Number(user.is_admin) === 1,
      errorMessages: messages.api,
    }));
  } catch (error) {
    if (error instanceof FormulaAiError) return json({ error: error.message }, { status: error.status });
    throw error;
  }
}

async function submitReport(request, requestUrl, env, context) {
  const messages = getMessages(resolveResponseLocale(request));
  const input = await readCreateInput(request);
  const protectionResponse = await enforceWriteProtection({
    request,
    requestUrl,
    env,
    db: env.pure_link_db,
    action: 'report',
    token: input.turnstileToken || input['cf-turnstile-response'],
    context,
  });
  if (protectionResponse) return protectionResponse;

  const report = normalizeReportInput(input, messages.api);
  const exists = await createLinkRepository(env.pure_link_db).exists(report.slug);
  if (!exists) return json({ error: messages.api.reportNotFound }, { status: 404 });
  await storeReport(env.pure_link_db, report);
  recordAggregateMetric({ context, db: env.pure_link_db, request, metricName: 'report', contentType: 'none' });
  return json({ received: true, reference: report.id }, { status: 201 });
}

async function deleteLink(request, slug, repository, env) {
  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+([A-Za-z0-9_-]{40,})$/i);
  let result;
  if (match) {
    const managementTokenHash = await hashManagementToken(match[1]);
    result = await repository.delete(slug, managementTokenHash);
  } else {
    if (!requireSameOrigin(request, env)) return json({ error: 'Invalid request origin.' }, { status: 403 });
    const user = await getCurrentUser(request, env);
    if (!user) return json({ error: 'A valid management token or account is required.' }, { status: 401 });
    result = await repository.deleteOwned(slug, user.id);
  }
  const changes = Number(result?.meta?.changes ?? result?.changes ?? 0);
  if (changes < 1) return json({ error: 'The link or management token was not found.' }, { status: 404 });
  return noContent();
}

async function claimLink(request, slug, repository, env) {
  const user = await getCurrentUser(request, env);
  if (!user) return json({ error: 'Sign in before linking this PureLink.' }, { status: 401 });
  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+([A-Za-z0-9_-]{40,})$/i);
  if (!match) return json({ error: 'The anonymous management credential is required.' }, { status: 401 });
  const managementTokenHash = await hashManagementToken(match[1]);
  const result = await repository.claim(slug, managementTokenHash, user.id);
  const changes = Number(result?.meta?.changes ?? result?.changes ?? 0);
  if (changes < 1) return json({ error: 'The PureLink or management credential was not found.' }, { status: 404 });
  return noContent();
}

async function readCreateInput(request) {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return request.json();
  if (contentType.includes('form')) return Object.fromEntries(await request.formData());
  throw new ValidationError('Use JSON or form data for this request.');
}

function isAvailable(link) {
  if (!link || link.status !== 'active') return false;
  if (!link.expires_at) return true;
  return new Date(link.expires_at).getTime() > Date.now();
}

function safePathname(pathname) {
  try {
    return decodeURIComponent(pathname).replace(/^\/+|\/+$/g, '');
  } catch {
    throw new ValidationError('The requested path is not valid.');
  }
}

function isUniqueConstraintError(error) {
  return /unique|constraint/i.test(String(error?.message || error));
}

function publicOrigin(requestUrl, env) {
  return String(env.PUBLIC_ORIGIN || requestUrl.origin).replace(/\/$/, '');
}

function renderSitemap(origin) {
  const paths = ['', 'privacy', 'terms', 'transparency', 'ai-credits', 'refund-policy'];
  const urls = ['zh-Hant', 'en'].flatMap((locale) => paths.map((path) => `  <url><loc>${origin}${localizedPath(locale, path)}</loc></url>`)).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function publicReadResponse(request, response) {
  if (request.method !== 'HEAD') return response;
  return new Response(null, { status: response.status, headers: response.headers });
}

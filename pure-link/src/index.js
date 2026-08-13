import { normalizeCreateInput, ValidationError } from './content.js';
import { finishGoogleAuth, getCurrentUser, isGoogleAuthConfigured, logout, requireSameOrigin, startGoogleAuth } from './auth.js';
import { enforceWriteProtection } from './abuse.js';
import { recordAggregateMetric } from './analytics.js';
import { html, json, noContent, redirect, text } from './http.js';
import { renderAccountPage, renderCardPage, renderFormulaPage, renderHomePage, renderLegalPage, renderManagePage, renderNotFoundPage, renderReportPage, renderUrlPreview } from './pages.js';
import { createLinkRepository } from './repository.js';
import { createReport as storeReport, normalizeReportInput } from './reports.js';
import { createManagementToken, createSlug, hashManagementToken } from './security.js';

export default {
  async fetch(request, env, context) {
    try {
      return await routeRequest(request, env, context);
    } catch (error) {
      if (error instanceof ValidationError) {
        return json({ error: error.message, field: error.field || null }, { status: 400 });
      }
      console.error('PureLink request failed', { name: error?.name, message: error?.message });
      return json({ error: 'PureLink could not complete this request.' }, { status: 500 });
    }
  },
};

export async function routeRequest(request, env, context) {
  const requestUrl = new URL(request.url);
  const path = safePathname(requestUrl.pathname);
  const repository = createLinkRepository(env.pure_link_db);

  if (request.method === 'GET' && path === '') {
    const nonce = createSlug() + createSlug();
    const turnstileSiteKey = env.TURNSTILE_SITE_KEY || '';
    return html(renderHomePage(nonce, turnstileSiteKey, isGoogleAuthConfigured(env), requestUrl.searchParams.get('auth')), {}, { scriptNonce: nonce, turnstile: Boolean(turnstileSiteKey) });
  }
  if (request.method === 'GET' && path === 'robots.txt') {
    return text('User-agent: *\nDisallow: /\n', { headers: { 'cache-control': 'public, max-age=3600' } });
  }
  if (request.method === 'GET' && (path === 'privacy' || path === 'terms' || path === 'transparency')) {
    return html(renderLegalPage(path));
  }

  if (request.method === 'GET' && path.startsWith('assets/')) {
    if (!env.ASSETS) return text('Asset not found.', { status: 404 });
    return env.ASSETS.fetch(request);
  }

  if (request.method === 'GET' && path === 'auth/google') return startGoogleAuth(request, env);
  if (request.method === 'GET' && path === 'auth/google/callback') return finishGoogleAuth(request, env);
  if (request.method === 'POST' && path === 'auth/logout') {
    if (!requireSameOrigin(request, env)) return json({ error: 'Invalid request origin.' }, { status: 403 });
    return logout(request, env);
  }
  if (request.method === 'GET' && path === 'account') {
    const user = await getCurrentUser(request, env);
    if (!user) return redirect('/auth/google?returnTo=/account');
    return html(renderAccountPage(user, await repository.listByOwner(user.id)));
  }

  if (request.method === 'POST' && (path === 'api/links' || path === 'api/create')) {
    return createLink(request, requestUrl, repository, env, context);
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
    if (!slug || slug.includes('/')) return html(renderNotFoundPage(), { status: 404 });
    const link = await repository.findBySlug(slug);
    if (!isAvailable(link)) return html(renderNotFoundPage(), { status: 404 });
    const nonce = createSlug() + createSlug();
    const user = await getCurrentUser(request, env);
    return html(renderManagePage(link, nonce, user, isGoogleAuthConfigured(env)), {}, { scriptNonce: nonce });
  }

  if (request.method === 'GET' && path.startsWith('report/')) {
    const slug = path.slice('report/'.length);
    if (!slug || slug.includes('/')) return html(renderNotFoundPage(), { status: 404 });
    const nonce = createSlug() + createSlug();
    const turnstileSiteKey = env.TURNSTILE_SITE_KEY || '';
    return html(renderReportPage(slug, nonce, turnstileSiteKey), {}, { scriptNonce: nonce, turnstile: Boolean(turnstileSiteKey) });
  }

  if (!['GET', 'HEAD'].includes(request.method) || path.includes('/')) return html(renderNotFoundPage(), { status: 404 });

  const isPreview = path.endsWith('+');
  const slug = isPreview ? path.slice(0, -1) : path;
  if (!slug) return html(renderNotFoundPage(), { status: 404 });

  const link = await repository.findBySlug(slug);
  if (!isAvailable(link)) return html(renderNotFoundPage(), { status: 404 });

  if (link.content_type === 'url') {
    if (request.method === 'GET') recordAggregateMetric({ context, db: env.pure_link_db, request, metricName: isPreview ? 'preview' : 'open', contentType: 'url' });
    return isPreview ? html(renderUrlPreview(link)) : redirect(link.content, 302);
  }
  if (link.content_type === 'formula') {
    if (request.method === 'GET') recordAggregateMetric({ context, db: env.pure_link_db, request, metricName: 'open', contentType: 'formula' });
    return html(renderFormulaPage(link));
  }
  if (link.content_type === 'card') {
    if (request.method === 'GET') recordAggregateMetric({ context, db: env.pure_link_db, request, metricName: 'open', contentType: 'card' });
    return html(renderCardPage(link));
  }
  return html(renderNotFoundPage(), { status: 404 });
}

async function createLink(request, requestUrl, repository, env, context) {
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
    return json({ error: 'This custom link is already in use.', field: 'slug' }, { status: 409 });
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
        previewLabel: normalized.contentType === 'url' ? '查看 + 預覽' : normalized.contentType === 'formula' ? '查看公式' : '查看小卡',
        managementUrl: `${origin}/manage/${slug}#${managementToken}`,
        managementToken,
      }, { status: 201 });
    } catch (error) {
      if (!isUniqueConstraintError(error) || normalized.slug) throw error;
      slug = '';
    }
  }

  return json({ error: 'Could not allocate a unique link. Please try again.' }, { status: 503 });
}

async function submitReport(request, requestUrl, env, context) {
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

  const report = normalizeReportInput(input);
  const exists = await createLinkRepository(env.pure_link_db).exists(report.slug);
  if (!exists) return json({ error: 'This PureLink could not be found.' }, { status: 404 });
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

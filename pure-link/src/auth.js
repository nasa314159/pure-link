import { createManagementToken, hashManagementToken } from './security.js';
import { json, redirect } from './http.js';

const SESSION_COOKIE = 'purelink_session';
const OAUTH_STATE_COOKIE = 'purelink_oauth_state';
const SESSION_SECONDS = 60 * 60 * 24 * 30;
const OAUTH_STATE_SECONDS = 10 * 60;
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

export function isGoogleAuthConfigured(env) {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

export async function getCurrentUser(request, env) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token || !env.pure_link_db) return null;
  const tokenHash = await hashManagementToken(token);
  const row = await env.pure_link_db.prepare(`
    SELECT users.id, users.email, users.display_name, users.avatar_url
    FROM user_sessions
    JOIN users ON users.id = user_sessions.user_id
    WHERE user_sessions.token_hash = ? AND user_sessions.expires_at > CURRENT_TIMESTAMP
  `).bind(tokenHash).first();
  return row || null;
}

export async function startGoogleAuth(request, env) {
  if (!isGoogleAuthConfigured(env)) {
    return json({ error: 'Google sign-in is not configured yet.' }, { status: 503 });
  }

  const requestUrl = new URL(request.url);
  const publicOrigin = getPublicOrigin(requestUrl, env);
  const returnTo = safeReturnTo(requestUrl.searchParams.get('returnTo'));
  const state = createManagementToken();
  const verifier = `${createManagementToken()}${createManagementToken()}`;
  const challenge = await createPkceChallenge(verifier);
  const stateHash = await hashManagementToken(state);

  await env.pure_link_db.prepare(`
    INSERT INTO oauth_states (state_hash, code_verifier, return_to, expires_at)
    VALUES (?, ?, ?, datetime('now', '+10 minutes'))
  `).bind(stateHash, verifier, returnTo).run();

  const authorizationUrl = new URL(GOOGLE_AUTH_URL);
  authorizationUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  authorizationUrl.searchParams.set('redirect_uri', `${publicOrigin}/auth/google/callback`);
  authorizationUrl.searchParams.set('response_type', 'code');
  authorizationUrl.searchParams.set('scope', 'openid email profile');
  authorizationUrl.searchParams.set('state', state);
  authorizationUrl.searchParams.set('code_challenge', challenge);
  authorizationUrl.searchParams.set('code_challenge_method', 'S256');
  authorizationUrl.searchParams.set('prompt', 'select_account');

  return redirect(authorizationUrl.toString(), 302, {
    headers: { 'set-cookie': cookie(OAUTH_STATE_COOKIE, state, OAUTH_STATE_SECONDS) },
  });
}

export async function finishGoogleAuth(request, env, fetchImplementation = fetch) {
  if (!isGoogleAuthConfigured(env)) return redirect('/?auth=unavailable');

  const requestUrl = new URL(request.url);
  const state = requestUrl.searchParams.get('state') || '';
  const code = requestUrl.searchParams.get('code') || '';
  const stateCookie = readCookie(request, OAUTH_STATE_COOKIE);
  if (!state || !code || !stateCookie || !constantTimeEqual(state, stateCookie)) {
    return redirect('/?auth=invalid', 302, { headers: { 'set-cookie': clearCookie(OAUTH_STATE_COOKIE) } });
  }

  const stateHash = await hashManagementToken(state);
  const oauthState = await env.pure_link_db.prepare(`
    DELETE FROM oauth_states
    WHERE state_hash = ? AND expires_at > CURRENT_TIMESTAMP
    RETURNING code_verifier, return_to
  `).bind(stateHash).first();
  if (!oauthState) {
    return redirect('/?auth=expired', 302, { headers: { 'set-cookie': clearCookie(OAUTH_STATE_COOKIE) } });
  }

  const publicOrigin = getPublicOrigin(requestUrl, env);
  const tokenResponse = await fetchImplementation(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      code,
      code_verifier: oauthState.code_verifier,
      grant_type: 'authorization_code',
      redirect_uri: `${publicOrigin}/auth/google/callback`,
    }),
  });
  if (!tokenResponse.ok) return redirect('/?auth=failed');
  const tokens = await tokenResponse.json();

  const userResponse = await fetchImplementation(GOOGLE_USERINFO_URL, {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  if (!userResponse.ok) return redirect('/?auth=failed');
  const profile = await userResponse.json();
  if (!profile.sub || profile.email_verified === false) return redirect('/?auth=failed');

  const userId = await upsertGoogleUser(env.pure_link_db, profile);
  const sessionToken = createManagementToken();
  const sessionHash = await hashManagementToken(sessionToken);
  await env.pure_link_db.prepare(`
    INSERT INTO user_sessions (token_hash, user_id, expires_at)
    VALUES (?, ?, datetime('now', '+30 days'))
  `).bind(sessionHash, userId).run();

  const headers = new Headers();
  headers.append('set-cookie', cookie(SESSION_COOKIE, sessionToken, SESSION_SECONDS));
  headers.append('set-cookie', clearCookie(OAUTH_STATE_COOKIE));
  return redirect(safeReturnTo(oauthState.return_to), 302, { headers });
}

export async function logout(request, env) {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) {
    const tokenHash = await hashManagementToken(token);
    await env.pure_link_db.prepare('DELETE FROM user_sessions WHERE token_hash = ?').bind(tokenHash).run();
  }
  return redirect('/', 303, { headers: { 'set-cookie': clearCookie(SESSION_COOKIE) } });
}

export function requireSameOrigin(request, env) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  return origin === getPublicOrigin(new URL(request.url), env);
}

async function upsertGoogleUser(db, profile) {
  const existing = await db.prepare('SELECT id FROM users WHERE google_subject = ?').bind(String(profile.sub)).first();
  const userId = existing?.id || crypto.randomUUID();
  await db.prepare(`
    INSERT INTO users (id, google_subject, email, display_name, avatar_url, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(google_subject) DO UPDATE SET
      email = excluded.email,
      display_name = excluded.display_name,
      avatar_url = excluded.avatar_url,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    userId,
    String(profile.sub),
    String(profile.email || ''),
    String(profile.name || profile.email || 'PureLink user').slice(0, 120),
    String(profile.picture || '').slice(0, 1000) || null,
  ).run();
  return userId;
}

function readCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=');
    if (separator < 0) continue;
    if (pair.slice(0, separator).trim() === name) return decodeURIComponent(pair.slice(separator + 1).trim());
  }
  return '';
}

function cookie(name, value, maxAge) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function clearCookie(name) {
  return `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function safeReturnTo(value) {
  const path = String(value || '/account');
  return path.startsWith('/') && !path.startsWith('//') ? path : '/account';
}

function getPublicOrigin(requestUrl, env) {
  return String(env.PUBLIC_ORIGIN || requestUrl.origin).replace(/\/$/, '');
}

async function createPkceChallenge(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return bytesToBase64Url(new Uint8Array(digest));
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

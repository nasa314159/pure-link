const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function randomBase58(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let result = '';
  for (const byte of bytes) result += BASE58[byte % BASE58.length];
  return result;
}

export function createSlug() {
  return randomBase58(10);
}

export function createManagementToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export async function hashManagementToken(token) {
  const encoded = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return bytesToBase64Url(new Uint8Array(digest));
}

export function constantTimeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const maxLength = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < maxLength; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

// Link-preview fetchers used by social platforms. Matched as lowercase
// substrings of the User-Agent; deliberately excludes search crawlers
// (Googlebot, Bingbot, DuckDuckBot, …), which keep normal redirect behavior.
const SOCIAL_PREVIEW_UA_PATTERN = /facebookexternalhit|meta-externalagent|meta-externaltest|facebookcatalog|discordbot|slackbot|telegrambot|twitterbot|linkedinbot|whatsapp/i;

export function isSocialPreviewCrawler(request) {
  return SOCIAL_PREVIEW_UA_PATTERN.test(request.headers.get('user-agent') || '');
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}


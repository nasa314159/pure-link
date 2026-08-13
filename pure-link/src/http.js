const BASE_SECURITY_HEADERS = Object.freeze({
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
});

export function json(data, init = {}) {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  applyBaseHeaders(headers);
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function html(markup, init = {}, options = {}) {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'text/html; charset=utf-8');
  const scriptSources = ["'self'"];
  if (options.scriptNonce) scriptSources.push(`'nonce-${options.scriptNonce}'`);
  if (options.turnstile) scriptSources.push('https://challenges.cloudflare.com');
  const turnstilePolicy = options.turnstile ? '; frame-src https://challenges.cloudflare.com' : '';
  const connectSources = options.turnstile ? "'self' https://challenges.cloudflare.com" : "'self'";
  const scriptPolicy = `; script-src ${scriptSources.join(' ')}; connect-src ${connectSources}${turnstilePolicy}`;
  headers.set('content-security-policy', `default-src 'none'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'${scriptPolicy}`);
  applyBaseHeaders(headers);
  return new Response(markup, { ...init, headers });
}

export function text(body, init = {}) {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'text/plain; charset=utf-8');
  applyBaseHeaders(headers);
  return new Response(body, { ...init, headers });
}

export function xml(body, init = {}) {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/xml; charset=utf-8');
  applyBaseHeaders(headers);
  return new Response(body, { ...init, headers });
}

export function redirect(location, status = 302, init = {}) {
  const headers = new Headers(init.headers);
  headers.set('location', location);
  headers.set('cache-control', 'no-store');
  applyBaseHeaders(headers);
  return new Response(null, { ...init, status, headers });
}

export function noContent(init = {}) {
  const headers = new Headers(init.headers);
  headers.set('cache-control', 'no-store');
  applyBaseHeaders(headers);
  return new Response(null, { ...init, status: 204, headers });
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function applyBaseHeaders(headers) {
  for (const [name, value] of Object.entries(BASE_SECURITY_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
}

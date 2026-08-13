export const CONTENT_TYPES = Object.freeze(['url', 'formula', 'card']);
export const CARD_THEMES = Object.freeze(['paper', 'mist', 'night']);

export const LIMITS = Object.freeze({
  slug: 30,
  url: 4096,
  formula: 5000,
  card: 1000,
  signature: 60,
});

export const RESERVED_SLUGS = new Set([
  '',
  'api',
  'admin',
  'account',
  'auth',
  'manage',
  'privacy',
  'terms',
  'report',
  'robots.txt',
  'favicon.ico',
]);

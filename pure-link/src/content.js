import { CARD_THEMES, CONTENT_TYPES, LIMITS, RESERVED_SLUGS } from './constants.js';

const TRACKING_PARAMETER_NAMES = new Set([
  'fbclid',
  'gclid',
  'dclid',
  'gbraid',
  'wbraid',
  'igshid',
  'mc_cid',
  'mc_eid',
  'msclkid',
  'si',
]);

export class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

export function normalizeCreateInput(input) {
  if (!input || typeof input !== 'object') {
    throw new ValidationError('Request body must be an object.');
  }

  const contentType = String(input.contentType || input.type || '').toLowerCase();
  if (!CONTENT_TYPES.includes(contentType)) {
    throw new ValidationError('Choose URL, formula, or card.', 'contentType');
  }

  const slug = normalizeSlug(input.slug);
  const signature = normalizeSignature(input.signature);
  const theme = normalizeTheme(input.theme);
  const isAffiliate = input.isAffiliate === true || input.isAffiliate === 'true' || input.isAffiliate === 1 || input.isAffiliate === '1';

  if (contentType === 'url') {
    const content = normalizeUrl(input.content, input.cleanTracking === true || input.cleanTracking === 'true');
    return { slug, contentType, content, signature: null, theme: 'paper', isAffiliate };
  }

  const content = normalizeText(input.content, contentType);
  return {
    slug,
    contentType,
    content,
    signature: contentType === 'card' ? signature : null,
    theme: contentType === 'card' ? theme : 'paper',
    isAffiliate: false,
  };
}

export function suggestContentType(value) {
  const content = String(value || '').trim();
  if (!content) return 'card';

  try {
    normalizeUrl(content, false);
    return 'url';
  } catch {}

  const latexCommand = /\\(?:begin|end|frac|sqrt|sum|int|lim|left|right|text|mathrm|mathbf|mathbb|partial|nabla)\b/;
  const mathSymbols = /[∂∫∑√∞≈≠≤≥±×÷∇]|(?:\$[^$]+\$)/;
  return latexCommand.test(content) || mathSymbols.test(content) ? 'formula' : 'card';
}

export function normalizeUrl(value, cleanTracking = false) {
  let raw = String(value || '').trim();
  if (!raw) throw new ValidationError('Enter a destination URL.', 'content');
  if (raw.length > LIMITS.url) throw new ValidationError(`URL must be ${LIMITS.url} characters or fewer.`, 'content');
  if (/\s/.test(raw)) throw new ValidationError('URLs cannot contain spaces or line breaks.', 'content');
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) raw = `https://${raw}`;

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new ValidationError('Enter a valid URL.', 'content');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new ValidationError('Only HTTP and HTTPS URLs are supported.', 'content');
  }
  if (!url.hostname) throw new ValidationError('The URL must include a hostname.', 'content');
  if (url.username || url.password) throw new ValidationError('URLs containing embedded credentials are not supported.', 'content');

  if (cleanTracking) {
    for (const name of [...url.searchParams.keys()]) {
      if (name.toLowerCase().startsWith('utm_') || TRACKING_PARAMETER_NAMES.has(name.toLowerCase())) {
        url.searchParams.delete(name);
      }
    }
  }

  return url.toString();
}

function normalizeText(value, contentType) {
  const content = String(value || '').replace(/\r\n?/g, '\n').trim();
  const limit = LIMITS[contentType];
  if (!content) throw new ValidationError('Enter content to share.', 'content');
  if (content.length > limit) {
    throw new ValidationError(`${contentType === 'formula' ? 'Formula' : 'Card'} content must be ${limit} characters or fewer.`, 'content');
  }
  return content;
}

function normalizeSlug(value) {
  const slug = String(value || '').trim();
  if (!slug) return '';
  if (slug.length > LIMITS.slug) throw new ValidationError(`Custom links must be ${LIMITS.slug} characters or fewer.`, 'slug');
  if (!/^[A-Za-z0-9_-]+$/.test(slug)) throw new ValidationError('Custom links may only contain letters, numbers, hyphens, and underscores.', 'slug');
  if (RESERVED_SLUGS.has(slug.toLowerCase())) throw new ValidationError('This custom link is reserved.', 'slug');
  return slug;
}

function normalizeSignature(value) {
  const signature = String(value || '').replace(/\s+/g, ' ').trim();
  if (signature.length > LIMITS.signature) throw new ValidationError(`Signatures must be ${LIMITS.signature} characters or fewer.`, 'signature');
  return signature || null;
}

function normalizeTheme(value) {
  const theme = String(value || 'paper').toLowerCase();
  if (!CARD_THEMES.includes(theme)) throw new ValidationError('Choose a valid card theme.', 'theme');
  return theme;
}


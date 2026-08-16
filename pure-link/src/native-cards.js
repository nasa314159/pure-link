import { ValidationError } from './content.js';
import { createManagementToken, hashManagementToken } from './security.js';

export const NATIVE_CREATE_TOKEN_TTL_SECONDS = 120;
export const NATIVE_CREATE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Creates an opaque, one-purpose authorization for the Android multi-link Card flow. The raw
 * value leaves this function only once; D1 keeps its irreversible hash and lifecycle metadata.
 */
export async function issueNativeCreateToken(db, now = Date.now()) {
  const nativeCreateToken = createManagementToken();
  const tokenHash = await hashManagementToken(nativeCreateToken);
  const expiresAt = Math.floor(now / 1000) + NATIVE_CREATE_TOKEN_TTL_SECONDS;
  await db.prepare(`
    INSERT INTO native_card_tokens (token_hash, expires_at)
    VALUES (?, ?)
  `).bind(tokenHash, expiresAt).run();
  return { nativeCreateToken, expiresIn: NATIVE_CREATE_TOKEN_TTL_SECONDS };
}

/**
 * Consumes the token in D1 before Card creation. A later insertion failure intentionally burns
 * the authorization: that is safer than allowing a concurrent replay to create a second Card.
 */
export async function consumeNativeCreateToken(db, nativeCreateToken, now = Date.now()) {
  if (!NATIVE_CREATE_TOKEN_PATTERN.test(String(nativeCreateToken || ''))) return false;
  const tokenHash = await hashManagementToken(nativeCreateToken);
  const row = await db.prepare(`
    UPDATE native_card_tokens
    SET used_at = CURRENT_TIMESTAMP
    WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?
    RETURNING token_hash
  `).bind(tokenHash, Math.floor(now / 1000)).first();
  return Boolean(row);
}

export async function cleanupExpiredNativeCreateTokens(db, now = Date.now()) {
  return db.prepare('DELETE FROM native_card_tokens WHERE expires_at < ?')
    .bind(Math.floor(now / 1000))
    .run();
}

/** The narrow endpoint deliberately has no escape hatch to the general create API. */
export function readNativeCardInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError('Request body must be an object.');
  }
  const allowed = new Set(['content', 'nativeCreateToken']);
  if (Object.keys(input).some((key) => !allowed.has(key))) {
    throw new ValidationError('This endpoint accepts only Card content and a native creation token.');
  }
  if (typeof input.nativeCreateToken !== 'string' || !NATIVE_CREATE_TOKEN_PATTERN.test(input.nativeCreateToken)) {
    throw new ValidationError('A valid native creation token is required.', 'nativeCreateToken');
  }
  if (typeof input.content !== 'string') {
    throw new ValidationError('Enter content to share.', 'content');
  }
  return { content: input.content, nativeCreateToken: input.nativeCreateToken };
}

// SHA-256 hashing for browser management logic. This mirrors the existing
// server primitive (hashManagementToken in src/security.js — identical
// SHA-256 digest, base64url encoding), so the client can re-derive the same
// stored-hash fingerprint the server already uses.
export async function hashManagementToken(token) {
  if (typeof token !== 'string') throw new TypeError('Token must be a string.');
  const encoded = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  const bytes = new Uint8Array(digest);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

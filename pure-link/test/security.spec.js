import { describe, expect, it } from 'vitest';
import { constantTimeEqual, createManagementToken, createSlug, hashManagementToken } from '../src/security.js';

describe('anonymous management credentials', () => {
  it('creates URL-safe slugs and high-entropy tokens', () => {
    expect(createSlug()).toMatch(/^[1-9A-HJ-NP-Za-km-z]{10}$/);
    expect(createManagementToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('stores a one-way token hash and compares it safely', async () => {
    const token = createManagementToken();
    const first = await hashManagementToken(token);
    const second = await hashManagementToken(token);
    expect(first).toBe(second);
    expect(first).not.toContain(token);
    expect(constantTimeEqual(first, second)).toBe(true);
    expect(constantTimeEqual(first, `${second}x`)).toBe(false);
  });
});


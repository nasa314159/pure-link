import { describe, expect, it } from 'vitest';
import { renderHomePage, renderManagePage } from '../src/pages.js';

describe('interactive pages', () => {
  it('emits a syntactically valid creation script with its CSP nonce', () => {
    const html = renderHomePage('test-nonce');
    const script = extractScript(html);
    expect(html).toContain('nonce="test-nonce"');
    expect(html).toContain('網址');
    expect(html).toContain('公式');
    expect(html).toContain('小卡');
    expect(html).toContain('貼上 \\\\frac');
    expect(() => new Function(script)).not.toThrow();
  });

  it('emits a syntactically valid anonymous management script', () => {
    const html = renderManagePage('safe-slug', 'manage-nonce');
    const script = extractScript(html);
    expect(html).toContain('nonce="manage-nonce"');
    expect(() => new Function(script)).not.toThrow();
  });
});

function extractScript(html) {
  const match = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/);
  if (!match) throw new Error('Inline script was not found.');
  return match[1];
}

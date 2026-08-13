import { describe, expect, it } from 'vitest';
import { renderCardPage, renderFormulaPage, renderHomePage, renderManagePage, renderReportPage } from '../src/pages.js';

describe('interactive pages', () => {
  it('emits a syntactically valid creation script with its CSP nonce', () => {
    const html = renderHomePage('test-nonce');
    const script = extractScript(html);
    expect(html).toContain('nonce="test-nonce"');
    expect(html).toContain('網址');
    expect(html).toContain('公式');
    expect(html).toContain('小卡');
    expect(html).toContain('貼上 \\\\frac');
    expect(html).toContain('公式即時預覽');
    expect(html).toContain('data-formula-insert="∫"');
    expect(html).toContain('/assets/formula-editor.js');
    expect(() => new Function(script)).not.toThrow();
  });

  it('offers an optional brand mark for formula and card PNG exports', () => {
    const formula = renderFormulaPage({ slug: 'math', content: 'x²' });
    const card = renderCardPage({ slug: 'kind', content: 'hello', theme: 'paper' });
    expect(formula).toContain('data-export-brand-toggle');
    expect(card).toContain('data-export-brand-toggle');
  });

  it('loads Turnstile as a regular deferred script', () => {
    const html = renderHomePage('test-nonce', 'site-key');
    expect(html).toContain('src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer');
    expect(html).toContain('window.turnstile?.reset();');
    expect(html).not.toContain('type="module" src="https://challenges.cloudflare.com');
  });

  it('emits a syntactically valid anonymous management script', () => {
    const html = renderManagePage({ slug: 'safe-slug', content_type: 'url', owner_user_id: null }, 'manage-nonce');
    const script = extractScript(html);
    expect(html).toContain('nonce="manage-nonce"');
    expect(() => new Function(script)).not.toThrow();
  });

  it('emits a syntactically valid report form script', () => {
    const html = renderReportPage('reported-link', 'report-nonce');
    const script = extractScript(html);
    expect(html).toContain('reported-link');
    expect(() => new Function(script)).not.toThrow();
  });
});

function extractScript(html) {
  const match = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/);
  if (!match) throw new Error('Inline script was not found.');
  return match[1];
}

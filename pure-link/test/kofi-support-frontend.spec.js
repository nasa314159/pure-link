// Regression tests for the Ko-fi overseas donation option on the support page.
// The Ko-fi option is deliberately frontend-only: an ordinary external link to
// the existing official destination, rendered for every visitor in both
// locales, with no checkout rail, backend endpoint, or AI-credit involvement.
import { describe, expect, it } from 'vitest';
import { renderSupportPage } from '../src/pages.js';
import { getMessages } from '../src/i18n.js';
import { KOFI_DONATION_URL } from '../src/kofi.js';

const baseTotals = { netTwd: 0, netUsdMinor: 0, contributionCount: 0, publicSupporters: [] };
const KOFI_LINK = `<a class="support-kofi-button" href="${KOFI_DONATION_URL}" target="_blank" rel="noopener noreferrer">`;

function extractKofiSection(html) {
  const start = html.indexOf('<section class="support-kofi"');
  const end = html.indexOf('</section>', start);
  return start >= 0 && end > start ? html.slice(start, end) : '';
}

function extractCss(html) {
  return html.match(/<style>([\s\S]*?)<\/style>/)?.[1] || '';
}

describe('Ko-fi overseas option is present in both locales', () => {
  it.each(['en', 'zh-Hant'])('renders the Ko-fi option on %s, even with no checkout provider', (locale) => {
    const html = renderSupportPage(baseTotals, {}, '', 'decay-nonce', locale);
    expect(html).toContain('id="support-kofi"');
    expect(html).toContain(KOFI_DONATION_URL);
    expect(html).toContain(getMessages(locale).support.kofiButton);
    expect(html).toContain(getMessages(locale).support.kofiTitle);
  });

  it('labels the two options in balanced region terms in both locales', () => {
    const en = renderSupportPage(baseTotals, { ecpay: true }, '', 'decay-nonce', 'en');
    expect(en).toContain(getMessages('en').support.kofiTitle);
    expect(en).toContain('Taiwan payment (NTD)');
    const zh = renderSupportPage(baseTotals, { ecpay: true }, '', 'decay-nonce', 'zh-Hant');
    expect(zh).toContain(getMessages('zh-Hant').support.kofiTitle);
    expect(zh).toContain('台灣付款（NTD）');
  });
});

describe('Ko-fi link destination and external security', () => {
  it('links to the official Ko-fi destination exactly, never a different host', () => {
    for (const locale of ['en', 'zh-Hant']) {
      const html = renderSupportPage(baseTotals, {}, '', 'decay-nonce', locale);
      expect(html).toContain(KOFI_LINK);
      expect((html.match(/href="https:\/\/ko-fi\.com/g) || []).length).toBe(1);
      expect(html).not.toMatch(/href="https:\/\/ko-fi\.com\/(?!purelink)/);
      expect(html).not.toContain('ko-fi.com/purelink/');
    }
  });

  it('opens securely as an ordinary external link with a noreferrer policy', () => {
    for (const locale of ['en', 'zh-Hant']) {
      const html = renderSupportPage(baseTotals, {}, '', 'decay-nonce', locale);
      expect(html).toContain(KOFI_LINK);
    }
  });

  it('explains that Ko-fi handles the payment externally', () => {
    for (const locale of ['en', 'zh-Hant']) {
      const html = renderSupportPage(baseTotals, {}, '', 'decay-nonce', locale);
      const section = extractKofiSection(html);
      expect(section).toContain(getMessages(locale).support.kofiExternal);
      expect(section).toContain(getMessages(locale).support.kofiNotCredits);
    }
  });
});

describe('ECPay flow remains available and unchanged', () => {
  it('keeps the complete ECPay form when ECPay is the only provider', () => {
    const html = renderSupportPage(baseTotals, { ecpay: true }, '', 'decay-nonce', 'en');
    expect(html).toContain('<form id="support-form">');
    expect(html).toContain('<input type="hidden" name="provider" value="ecpay">');
    for (const preset of ['100', '300', '500', '1000']) expect(html).toContain(`data-support-amount="${preset}"`);
    expect(html).toContain('min="50" max="10000"');
    expect(html).toContain('id="support-ecpay-description"');
    expect(html).toContain('Choose a support amount. Payment is completed securely through ECPay.');
    expect(html).toContain('id="support-ecpay-attribution"');
  });

  it('does not add Ko-fi to the internal support-form provider radio logic', () => {
    const html = renderSupportPage(baseTotals, { ecpay: true, lemon: true }, '', 'decay-nonce', 'en');
    expect((html.match(/<input type="radio" name="provider"/g) || []).length).toBe(2);
    expect(html).not.toMatch(/<input[^>]*name="provider"[^>]*value="kofi"/);
    const script = html.slice(html.indexOf('const supportMessages'), html.indexOf('supportForm.addEventListener'));
    expect(script).toContain('const providerInput = supportForm.querySelector');
    expect(script).toContain("provider === 'ecpay'");
  });

  it('renders the Ko-fi option outside the support form, so it can never submit a checkout', () => {
    const html = renderSupportPage(baseTotals, { ecpay: true }, '', 'decay-nonce', 'en');
    const formEnd = html.indexOf('</form>');
    const kofiStart = html.indexOf('id="support-kofi"');
    expect(formEnd).toBeGreaterThan(-1);
    expect(kofiStart).toBeGreaterThan(formEnd);
  });
});

describe('Ko-fi never promises an AI credit purchase', () => {
  it('states the donation is voluntary and separate from AI Credits in both locales', () => {
    expect(getMessages('en').support.kofiNotCredits).toMatch(/not an AI credit purchase|never completes an AI credit purchase/);
    expect(getMessages('en').support.kofiNotCredits).toMatch(/does not grant/);
    expect(getMessages('zh-Hant').support.kofiNotCredits).toMatch(/不會完成任何 AI 額度購買/);
    expect(getMessages('zh-Hant').support.kofiNotCredits).toMatch(/不會自動授予/);
  });

  it('keeps the Ko-fi section free of checkout markup in both locales', () => {
    for (const locale of ['en', 'zh-Hant']) {
      const section = extractKofiSection(renderSupportPage(baseTotals, { ecpay: true }, '', 'decay-nonce', locale));
      expect(section.length).toBeGreaterThan(0);
      expect(section).not.toContain('<form');
      expect(section).not.toContain('<input');
      expect(section).not.toContain('<button');
      expect(section).not.toContain('data-provider');
    }
  });
});

describe('supporter privacy and public totals are unaffected', () => {
  it('keeps the opt-in supporter rendering identical alongside the Ko-fi option', () => {
    const totals = {
      netTwd: 300,
      netUsdMinor: 100,
      contributionCount: 2,
      publicSupporters: [{ name: 'Tester', message: 'Great project!', amount: '3.00', currency: 'USD' }],
    };
    const html = renderSupportPage(totals, { ecpay: true }, '', 'decay-nonce', 'en');
    expect(html).toContain('section class="support-totals"');
    expect(html).toContain('Great project!');
    expect(extractKofiSection(html)).not.toContain('Tester');
    expect(extractKofiSection(html)).not.toContain('Great project!');
  });

  it('adds no Ko-fi input or attribution collection to the page', () => {
    const kofiFields = renderSupportPage(baseTotals, { ecpay: true }, '', 'decay-nonce', 'en').match(/id="support-kofi-[a-z]+"/g) || [];
    expect(kofiFields.every((field) => ['id="support-kofi-title"'].includes(field))).toBe(true);
  });
});

describe('responsive layout remains usable', () => {
  it('ships grid styles for the Ko-fi card and a mobile stretch for its button', () => {
    const css = extractCss(renderSupportPage(baseTotals, { ecpay: true }, '', 'decay-nonce', 'en'));
    expect(css).toMatch(/\.support-kofi \{[^}]*display: grid;[^}]*border-radius: 1rem;/);
    expect(css).toMatch(/\.support-kofi-button \{[^}]*border-radius: 999px;/);
    expect(css).toMatch(/@media \(max-width: 38rem\) \{ \.support-kofi-button \{[^}]*justify-self: stretch;[^}]*\} \}/);
  });

  it('keeps the Ko-fi card inside the responsive support panel for every branch', () => {
    for (const providers of [{}, { ecpay: true }, { lemon: true }, { ecpay: true, lemon: true }]) {
      const html = renderSupportPage(baseTotals, providers, '', 'decay-nonce', 'zh-Hant');
      expect(html).toContain('class="page support-page"');
      expect(html).toContain('id="support-kofi"');
    }
  });
});

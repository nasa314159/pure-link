// Regression tests for the unified ECPay/Ko-fi support payment actions.
// The production configuration (ECPay only) renders a balanced pair of
// equal-width actions: a green ECPay submit button and a blue Ko-fi external
// link to the verified donation panel. The Ko-fi destination is verified by
// non-paying navigation and Ko-fi's own documentation defines no amount- or
// currency-prefill URL contract, so the link must never carry query
// parameters and privacy stays private-by-default. No third-party script,
// SDK, iframe, CSP source, or backend endpoint is involved.
import { describe, expect, it } from 'vitest';
import { renderSupportPage } from '../src/pages.js';
import { getMessages } from '../src/i18n.js';
import { KOFI_DONATION_URL } from '../src/kofi.js';

const baseTotals = { netTwd: 0, netUsdMinor: 0, contributionCount: 0, publicSupporters: [] };
const KOFI_LINK = `<a class="support-action support-action-kofi" href="${KOFI_DONATION_URL}" target="_blank" rel="noopener noreferrer">`;
const ECPAY_SUBMIT = '<button type="submit" class="support-action support-action-ecpay" id="support-button">';
const FALLBACK_SUBMIT = '<button class="create-button" id="support-button" type="submit">';

function extractCss(html) {
  return html.match(/<style>([\s\S]*?)<\/style>/)?.[1] || '';
}

function extractActionRow(html) {
  const start = html.indexOf('<div class="support-actions');
  const end = html.indexOf('</div>', start);
  return start >= 0 && end > start ? html.slice(start, end) : '';
}

function extractNotes(html) {
  const match = html.match(/<p class="field-help support-actions-note">([\s\S]*?)<\/p><p class="field-help support-actions-privacy">([\s\S]*?)<\/p>/);
  return match ? { note: match[1], privacy: match[2] } : null;
}

describe('unified ECPay/Ko-fi actions in both locales', () => {
  it.each(['en', 'zh-Hant'])('renders the balanced two-action pair on %s under ECPay-only config', (locale) => {
    const html = renderSupportPage(baseTotals, { ecpay: true }, '', 'decay-nonce', locale);
    expect(html).toContain(ECPAY_SUBMIT);
    expect(html).toContain(KOFI_LINK);
    const row = extractActionRow(html);
    expect(row).toContain(ECPAY_SUBMIT);
    expect(row).toContain(KOFI_LINK);
    expect(extractNotes(html).note).toContain(getMessages(locale).support.actionsNote);
  });

  it.each(['en', 'zh-Hant'])('labels both actions with brand and subtitle on %s', (locale) => {
    const html = renderSupportPage(baseTotals, { ecpay: true }, '', 'decay-nonce', locale);
    expect(extractActionRow(html)).toContain(getMessages(locale).support.ecpayButton);
    expect(extractActionRow(html)).toContain('Ko-fi');
    expect(extractActionRow(html)).toContain(getMessages(locale).support.ecpayMethod);
    expect(extractActionRow(html)).toContain(getMessages(locale).support.kofiSubtitle);
  });
});

describe('brand colors, icons, and accessible rendering', () => {
  it('styles ECPay green and Ko-fi blue, with hover and focus states', () => {
    const css = extractCss(renderSupportPage(baseTotals, { ecpay: true }, '', 'decay-nonce', 'en'));
    expect(css).toMatch(/\.support-action-ecpay \{ background: var\(--green\); \}/);
    expect(css).toMatch(/\.support-action-ecpay:hover, \.support-action-ecpay:focus-visible \{ background: var\(--ink\); \}/);
    expect(css).toMatch(/\.support-action-kofi \{ background: #1f7fa6; \}/);
    expect(css).toMatch(/\.support-action-kofi:hover, \.support-action-kofi:focus-visible \{ background: #16628a; \}/);
    expect(css).toMatch(/\.support-action:focus-visible \{ outline: 2px solid currentColor; outline-offset: 2px; \}/);
  });

  it('renders inline SVG icons with no third-party asset, script, or iframe', () => {
    const html = renderSupportPage(baseTotals, { ecpay: true }, '', 'decay-nonce', 'en');
    const row = extractActionRow(html);
    expect((row.match(/<svg class="support-action-icon"/g) || []).length).toBe(2);
    expect(row).toContain('rect x="2.5" y="5.5"');
    expect(row).toContain('aria-hidden="true"');
    expect(html).not.toContain('storage.ko-fi.com');
    expect(html).not.toMatch(/<iframe[^>]*ko-fi/i);
    expect(html).not.toMatch(/<script[^>]*https:\/\/(?!challenges\.cloudflare\.com)/);
  });
});

describe('side-by-side balanced layout with mobile responsiveness', () => {
  it('uses an equal-width two-column grid that stacks on the mobile breakpoint', () => {
    const css = extractCss(renderSupportPage(baseTotals, { ecpay: true }, '', 'decay-nonce', 'en'));
    expect(css).toMatch(/\.support-actions \{ display: grid; grid-template-columns: repeat\(auto-fit, minmax\(9\.5rem, 1fr\)\); gap: \.55rem; margin: \.9rem 0 \.4rem; \}/);
    expect(css).toMatch(/@media \(max-width: 38rem\) \{ \.support-actions \{ grid-template-columns: 1fr; \} \}/);
    expect(css).toMatch(/\.support-action \{ display: grid; gap: \.1rem; place-content: center; justify-items: center; min-height: 3\.6rem;/);
  });
});

describe('verified Ko-fi destination and no invented prefill', () => {
  it('links to the verified donation panel exactly, without query parameters', () => {
    expect(KOFI_DONATION_URL).toBe('https://ko-fi.com/purelink/donate');
    for (const locale of ['en', 'zh-Hant']) {
      const html = renderSupportPage(baseTotals, { ecpay: true }, '', 'decay-nonce', locale);
      expect(html).toContain(KOFI_LINK);
      expect((html.match(/href="https:\/\/ko-fi\.com/g) || []).length).toBe(1);
      expect(html).not.toMatch(/https:\/\/ko-fi\.com\/purelink\/donate\?/);
      expect(html).not.toMatch(/ko-fi\.com\/purelink\/donate\?(?:amount|currency)=/i);
      expect(html).not.toMatch(/href="https:\/\/ko-fi\.com\/(?!purelink\/donate)/);
    }
  });

  it('states the amount and currency are chosen on Ko-fi, with no transferred-amount claim', () => {
    expect(getMessages('en').support.actionsNote).toMatch(/choose and confirm the final amount and currency/);
    expect(getMessages('en').support.actionsNote).toMatch(/handled externally by Ko-fi/);
    expect(getMessages('zh-Hant').support.actionsNote).toMatch(/選擇並確認最終金額與幣別/);
    expect(getMessages('zh-Hant').support.actionsNote).toMatch(/在外部處理/);
    for (const locale of ['en', 'zh-Hant']) {
      expect(getMessages(locale).support.actionsNote).not.toMatch(/same (?:NT\$ )?amount|converted|automatic (?:USD|exchange)/i);
    }
  });

  it('marks the Ko-fi opener as an external new-tab link with noreferrer security', () => {
    for (const locale of ['en', 'zh-Hant']) {
      expect(renderSupportPage(baseTotals, { ecpay: true }, '', 'decay-nonce', locale)).toContain(KOFI_LINK);
    }
  });
});

describe('ECPay checkout behavior remains available and unchanged', () => {
  it('keeps the complete ECPay form, validation ranges, presets, and attribution', () => {
    const html = renderSupportPage(baseTotals, { ecpay: true }, '', 'decay-nonce', 'en', 'site-key');
    expect(html).toContain('<form id="support-form">');
    expect(html).toContain('<input type="hidden" name="provider" value="ecpay">');
    for (const preset of ['100', '300', '500', '1000']) expect(html).toContain(`data-support-amount="${preset}"`);
    expect(html).toContain('min="50" max="10000"');
    expect(html).toContain('id="support-ecpay-description"');
    expect(html).toContain('id="support-ecpay-attribution"');
    expect(html).toContain('data-action="support-checkout"');
  });

  it('keeps the ECPay action a real submit wired to the existing checkout script', () => {
    const html = renderSupportPage(baseTotals, { ecpay: true }, '', 'decay-nonce', 'en');
    expect(html).toContain(ECPAY_SUBMIT);
    const script = html.slice(html.indexOf('const supportMessages'), html.indexOf('supportForm.addEventListener(\'submit\'') + 1);
    expect(script).toContain('const supportButton = document.getElementById(\'support-button\')');
    expect(script.slice(script.indexOf('const updateSupportMethod'))).toContain("provider === 'ecpay'");
  });

  it('still requires the ECPay amount and stays independent of the Ko-fi action', () => {
    const html = renderSupportPage(baseTotals, { ecpay: true }, '', 'decay-nonce', 'en');
    expect(html).toMatch(/<label class="field-label" for="support-amount">[^<]*<\/label>/);
    expect(html).toContain('id="support-amount"');
    expect(getMessages('en').support.amount).toMatch(/ECPay amount/);
    expect(getMessages('zh-Hant').support.amount).toMatch(/綠界支持金額/);
  });
});

describe('the Ko-fi action can never submit the ECPay checkout', () => {
  it('is a plain external anchor, not a submit control and not a form action', () => {
    const html = renderSupportPage(baseTotals, { ecpay: true }, '', 'decay-nonce', 'en');
    const row = extractActionRow(html);
    expect(row).toContain('<a class="support-action support-action-kofi"');
    expect(row).not.toMatch(/<a[^>]*(?:formaction|type="submit"|type='submit')/);
    expect(row).not.toContain('data-provider');
    expect(html).not.toMatch(/<form[^>]*action="https:\/\/ko-fi\.com/);
  });

  it('keeps the Ko-fi action outside any checkout provider selection logic', () => {
    const html = renderSupportPage(baseTotals, { ecpay: true }, '', 'decay-nonce', 'en');
    const script = html.slice(html.indexOf('const updateSupportMethod'), html.indexOf("if (supportForm) supportForm.querySelectorAll('input[name=\"provider\"]')") + 1);
    expect(script).not.toContain('kofi');
    expect(script).not.toContain('support-actions');
  });
});

describe('privacy stays private-by-default and totals are untouched', () => {
  it('states Ko-fi privacy is separate and never auto-published', () => {
    expect(getMessages('en').support.kofiPrivacy).toMatch(/private by default/);
    expect(getMessages('en').support.kofiPrivacy).toMatch(/never publishes it automatically/);
    expect(getMessages('zh-Hant').support.kofiPrivacy).toMatch(/預設為私密/);
    expect(getMessages('zh-Hant').support.kofiPrivacy).toMatch(/不會自動發布/);
  });

  it('collects no PureLink form data on the Ko-fi path', () => {
    const row = extractActionRow(renderSupportPage(baseTotals, { ecpay: true }, '', 'decay-nonce', 'en'));
    expect(row).not.toContain('<input');
    expect(row).not.toContain('<textarea');
    expect(KOFI_LINK).not.toMatch(/\?/);
  });

  it('keeps opt-in supporter rendering and totals hearted unchanged alongside the new actions', () => {
    const totals = {
      netTwd: 300,
      netUsdMinor: 100,
      contributionCount: 2,
      publicSupporters: [{ name: 'Tester', message: 'Great project!', amount: '3.00', currency: 'USD' }],
    };
    const html = renderSupportPage(totals, { ecpay: true }, '', 'decay-nonce', 'en');
    expect(html).toContain('section class="support-totals"');
    expect(html).toContain('Great project!');
    expect(extractActionRow(html)).not.toContain('Tester');
  });
});

describe('fallback configurations stay coherent', () => {
  it('keeps the previous single submit plus a standalone Ko-fi row without ECPay', () => {
    for (const providers of [{}, { lemon: true }, { ecpay: true, lemon: true }]) {
      const html = renderSupportPage(baseTotals, providers, '', 'decay-nonce', 'en');
      expect(html).not.toContain(ECPAY_SUBMIT);
      if (providers.ecpay || providers.lemon) expect(html).toContain(FALLBACK_SUBMIT);
      else expect(html).toContain('Support checkout is not available yet.');
      expect(html).toContain('<div class="support-actions support-actions-standalone">');
      expect(extractActionRow(html)).toContain(KOFI_LINK);
    }
  });
});

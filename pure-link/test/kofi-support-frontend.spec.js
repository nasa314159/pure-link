// Regression tests for the separated ECPay / Ko-fi support page UX.
// The page keeps one unified Support surface but separates three workflows:
// 1. Taiwan: ECPay one-time donations with a chosen TWD amount (green submit,
//    inside the checkout form).
// 2. International: Ko-fi voluntary one-time tips in USD (blue action in a
//    separate section OUTSIDE the form; the supporter chooses the amount,
//    name, and message on ko-fi.com — Ko-fi documents no amount- or
//    currency-prefill URL contract, so links never carry query parameters).
// 3. International: Ko-fi membership (verified tiers page, US$3/month
//    Supporter tier, no AI credits or premium entitlements).
// Verified by non-paying navigation (2026-11). No third-party script, SDK,
// iframe, CSP source, or backend endpoint is involved; no D1 or schema change.
import { describe, expect, it } from 'vitest';
import { renderSupportPage } from '../src/pages.js';
import { getMessages } from '../src/i18n.js';
import { KOFI_DONATION_URL, KOFI_MEMBERSHIP_URL } from '../src/kofi.js';

const baseTotals = { netTwd: 0, netUsdMinor: 0, contributionCount: 0, publicSupporters: [] };
const LOCALES = ['en', 'zh-Hant'];
const KOFI_TIP_LINK = `<a class="support-action support-action-kofi" href="${KOFI_DONATION_URL}" target="_blank" rel="noopener noreferrer">`;
const KOFI_MEMBERSHIP_LINK = `<a class="support-action support-action-kofi support-action-kofi-membership" href="${KOFI_MEMBERSHIP_URL}" target="_blank" rel="noopener noreferrer">`;
const ECPAY_SUBMIT = '<button type="submit" class="support-action support-action-ecpay" id="support-button">';
const FALLBACK_SUBMIT = '<button class="create-button" id="support-button" type="submit">';
const KOFI_SECTION_OPEN = '<section class="support-kofi" aria-labelledby="support-kofi-heading">';
const FORM_OPEN = '<form id="support-form">';
const FORM_CLOSE = '</form>';

function extractCss(html) {
  return html.match(/<style>([\s\S]*?)<\/style>/)?.[1] || '';
}

function extractForm(html) {
  const start = html.indexOf(FORM_OPEN);
  const end = html.indexOf(FORM_CLOSE, start);
  return start >= 0 && end > start ? html.slice(start, end + FORM_CLOSE.length) : '';
}

function extractKofiSection(html) {
  const start = html.indexOf(KOFI_SECTION_OPEN);
  const end = html.indexOf('</section>', start);
  return start >= 0 && end > start ? html.slice(start, end) : '';
}

function render(locale, providers = { ecpay: true }, turnstileSiteKey = '') {
  return renderSupportPage(baseTotals, providers, '', 'decay-nonce', locale, turnstileSiteKey, '');
}

describe('one unified page with three separated workflows, both locales', () => {
  it.each(LOCALES)('renders the ECPay submit inside the form and the Ko-fi section outside it on %s', (locale) => {
    const html = render(locale);
    const form = extractForm(html);
    const kofiSection = extractKofiSection(html);
    expect(html).toContain(ECPAY_SUBMIT);
    expect(html).toContain(KOFI_SECTION_OPEN);
    expect(form).toContain(ECPAY_SUBMIT);
    expect(form).not.toContain(KOFI_TIP_LINK);
    expect(form).not.toContain(KOFI_MEMBERSHIP_LINK);
    expect(kofiSection).toContain(KOFI_TIP_LINK);
    expect(kofiSection).toContain(KOFI_MEMBERSHIP_LINK);
    expect(kofiSection).toContain(getMessages(locale).support.kofiHeading);
    expect(kofiSection).toContain(getMessages(locale).support.kofiIntro);
    expect(kofiSection).not.toContain('id="support-amount"');
    expect(kofiSection).not.toContain('name="public');
  });

  it.each(LOCALES)('labels the Ko-fi tip as voluntary one-time USD support on %s', (locale) => {
    const m = getMessages(locale).support;
    expect(m.kofiSubtitle).toMatch(/ko-fi\.com/);
    expect(m.kofiSubtitle).toMatch(locale === 'en' ? /one-time tip/i : /單次自由贊助/);
    expect(m.kofiSubtitle).toMatch(locale === 'en' ? /USD/ : /美元/);
    expect(m.kofiIntro).toMatch(locale === 'en' ? /voluntary/i : /自願/);
    expect(m.kofiIntro).toMatch(locale === 'en' ? /US dollars/ : /美元計價/);
    expect(m.kofiIntro).toMatch(locale === 'en' ? /choose and confirm the amount, name, and message on ko-fi\.com/ : /選擇並確認金額、名稱與留言/);
  });

  it.each(LOCALES)('states the Ko-fi workflows never use the ECPay form on %s', (locale) => {
    const m = getMessages(locale).support;
    expect(m.actionsNote).toMatch(locale === 'en' ? /Ko-fi support below is separate/ : /Ko-fi 支持彼此獨立/);
    expect(m.actionsNote).toMatch(locale === 'en' ? /never uses this form/ : /不會使用這個表單/);
    expect(m.kofiIntro).toMatch(locale === 'en' ? /does not use the PureLink checkout form/ : /不使用 PureLink 的結帳表單/);
  });
});

describe('verified Ko-fi destinations and no invented prefill', () => {
  it('uses the verified donation and membership pages exactly, without query parameters', () => {
    expect(KOFI_DONATION_URL).toBe('https://ko-fi.com/purelink/donate');
    expect(KOFI_MEMBERSHIP_URL).toBe('https://ko-fi.com/purelink/tiers');
    for (const locale of LOCALES) {
      const html = render(locale);
      expect(html).toContain(KOFI_TIP_LINK);
      expect(html).toContain(KOFI_MEMBERSHIP_LINK);
      expect((html.match(/href="https:\/\/ko-fi\.com\//g) || []).length).toBe(2);
      expect(html).not.toMatch(/ko-fi\.com\/purelink\/(?:donate|tiers)\?/i);
      expect(html).not.toMatch(/ko-fi\.com\/[^\s"]*\?(?:amount|currency)=/i);
      expect(html).not.toMatch(/href="https:\/\/ko-fi\.com\/(?!purelink\/(?:donate|tiers))/);
    }
  });

  it('keeps the donation and membership destinations distinct', () => {
    expect(KOFI_DONATION_URL).not.toBe(KOFI_MEMBERSHIP_URL);
    const html = render('en');
    expect((html.match(new RegExp(KOFI_DONATION_URL.replace(/[/.]/g, '\\$&'), 'g')) || []).length).toBe(1);
    expect((html.match(new RegExp(KOFI_MEMBERSHIP_URL.replace(/[/.]/g, '\\$&'), 'g')) || []).length).toBe(1);
  });
});

describe('Ko-fi membership copy: verified price, no entitlements, no real-time claims', () => {
  it('describes the Supporter tier at its verified US$3/month price', () => {
    const m = getMessages('en').support;
    expect(m.kofiMembershipSubtitle).toMatch(/Supporter · US\$3\/month/);
    expect(m.kofiMembershipNote).toMatch(/US\$3 per month/);
    expect(m.kofiMembershipNote).toMatch(/billed by Ko-fi in US dollars/);
    expect(getMessages('zh-Hant').support.kofiMembershipSubtitle).toMatch(/Supporter · 每月 US\$3/);
    expect(getMessages('zh-Hant').support.kofiMembershipNote).toMatch(/每月 3 美元/);
  });

  it('claims no AI credits, premium features, or other entitlements for membership', () => {
    for (const locale of LOCALES) {
      const m = getMessages(locale).support;
      expect(m.kofiMembershipNote).toMatch(locale === 'en' ? /no AI credits, premium features, or other PureLink entitlements/ : /不包含 AI 額度、進階功能或任何其他 PureLink 權益/);
      expect(m.kofiMembershipNote).not.toMatch(/includes? AI credits|grants? credits|unlocks?|premium access/i);
      expect(m.kofiMembershipNote).toMatch(locale === 'en' ? /does not display or automatically recognize membership status/ : /不會顯示或自動辨識會員身分/);
    }
    const kofiSection = extractKofiSection(render('en'));
    expect(kofiSection).toContain(getMessages('en').support.kofiMembershipNote);
  });

  it('keeps the general no-benefit boundary and never adds memberships to totals', () => {
    const html = render('en');
    expect(html).toContain('Support provides no AI credits, premium features, subscription, priority treatment, or other product benefit');
    expect(html).not.toMatch(/membership (?:total|count|is included)/i);
    expect(html).not.toMatch(/support totals? (?:include|count)[^.]*membership/i);
  });
});

describe('brand colors, icons, and accessible rendering', () => {
  it('styles ECPay green and Ko-fi blue, with hover and focus states', () => {
    const css = extractCss(render('en'));
    expect(css).toMatch(/\.support-action-ecpay \{ background: var\(--green\); \}/);
    expect(css).toMatch(/\.support-action-ecpay:hover, \.support-action-ecpay:focus-visible \{ background: var\(--ink\); \}/);
    expect(css).toMatch(/\.support-action-kofi \{ background: #1f7fa6; \}/);
    expect(css).toMatch(/\.support-action-kofi:hover, \.support-action-kofi:focus-visible \{ background: #16628a; \}/);
    expect(css).toMatch(/\.support-action:focus-visible \{ outline: 2px solid currentColor; outline-offset: 2px; \}/);
  });

  it('gives the membership action a distinct outlined Ko-fi-blue treatment with focus state', () => {
    const css = extractCss(render('en'));
    expect(css).toMatch(/\.support-action-kofi-membership \{ background: white; color: #1f7fa6; border: 1px solid #1f7fa6; \}/);
    expect(css).toMatch(/\.support-action-kofi-membership:hover, \.support-action-kofi-membership:focus-visible \{ background: #eaf4f9; \}/);
  });

  it('renders inline SVG icons with no third-party asset, script, or iframe', () => {
    const html = render('en');
    const kofiSection = extractKofiSection(html);
    expect((kofiSection.match(/<svg class="support-action-icon"/g) || []).length).toBe(2);
    expect(kofiSection).toContain('aria-hidden="true"');
    expect(html).not.toContain('storage.ko-fi.com');
    expect(html).not.toMatch(/<iframe[^>]*ko-fi/i);
    expect(html).not.toMatch(/<script[^>]*https:\/\/(?!challenges\.cloudflare\.com)/);
  });

  it('keeps the Ko-fi section compact and accessible with a labelled heading', () => {
    const css = extractCss(render('en'));
    expect(css).toMatch(/\.support-kofi \{ display: grid; gap: \.3rem; margin-top: 1rem; padding-top: \.9rem; border-top: 1px solid var\(--line\); \}/);
    expect(css).toMatch(/\.support-kofi-heading \{ font-size: \.95rem; margin: 0; \}/);
    expect(render('en')).toContain(KOFI_SECTION_OPEN);
  });
});

describe('responsive layout stays full-width and tappable on mobile', () => {
  it('uses a two-column action grid that stacks to one full-width column on the mobile breakpoint', () => {
    const css = extractCss(render('en'));
    expect(css).toMatch(/\.support-actions \{ display: grid; grid-template-columns: repeat\(auto-fit, minmax\(9\.5rem, 1fr\)\); gap: \.55rem; margin: \.9rem 0 \.4rem; \}/);
    expect(css).toMatch(/@media \(max-width: 38rem\) \{ \.support-actions \{ grid-template-columns: 1fr; \} \}/);
    expect(css).toMatch(/\.support-action \{ display: grid; gap: \.1rem; place-content: center; justify-items: center; min-height: 3\.6rem;/);
  });
});

describe('ECPay checkout behavior remains available and unchanged', () => {
  it('keeps the complete ECPay form, validation ranges, presets, and attribution', () => {
    const html = render('en', { ecpay: true }, 'site-key');
    expect(html).toContain(FORM_OPEN);
    expect(html).toContain('<input type="hidden" name="provider" value="ecpay">');
    for (const preset of ['100', '300', '500', '1000']) expect(html).toContain(`data-support-amount="${preset}"`);
    expect(html).toContain('min="50" max="10000"');
    expect(html).toContain('id="support-ecpay-description"');
    expect(html).toContain('id="support-ecpay-attribution"');
    expect(html).toContain('data-action="support-checkout"');
    const form = extractForm(html);
    for (const name of ['publicName', 'publicMessage', 'publicAmount']) expect(form).toContain(`name="${name}"`);
    expect(form).toContain('name="displayName"');
    expect(form).toContain('id="support-message"');
  });

  it('keeps the ECPay action a real submit wired to the existing checkout script', () => {
    const html = render('en');
    expect(html).toContain(ECPAY_SUBMIT);
    const script = html.slice(html.indexOf('const supportMessages'), html.indexOf('supportForm.addEventListener(\'submit\'') + 1);
    expect(script).toContain('const supportButton = document.getElementById(\'support-button\')');
    expect(script.slice(script.indexOf('const updateSupportMethod'))).toContain("provider === 'ecpay'");
  });

  it('still requires the ECPay amount and stays independent of the Ko-fi actions', () => {
    const html = render('en');
    expect(html).toMatch(/<label class="field-label" for="support-amount">[^<]*<\/label>/);
    expect(html).toContain('id="support-amount"');
    expect(getMessages('en').support.amount).toMatch(/ECPay amount/);
    expect(getMessages('zh-Hant').support.amount).toMatch(/綠界支持金額/);
    const kofiSection = extractKofiSection(html);
    expect(kofiSection).not.toContain('id="support-amount"');
    expect(kofiSection).not.toContain('data-support-amount');
  });
});

describe('the Ko-fi actions can never submit the ECPay checkout', () => {
  it('are plain external anchors outside the form, not submit controls and not form actions', () => {
    const html = render('en');
    const form = extractForm(html);
    const kofiSection = extractKofiSection(html);
    expect(kofiSection).toContain('<a class="support-action support-action-kofi"');
    expect(kofiSection).not.toMatch(/<a[^>]*(?:formaction|type="submit"|type='submit')/);
    expect(kofiSection).not.toContain('data-provider');
    expect(form).not.toMatch(/<a[^>]*ko-fi\.com/);
    expect(html).not.toMatch(/<form[^>]*action="https:\/\/ko-fi\.com/);
    expect(html.indexOf(FORM_CLOSE)).toBeLessThan(html.indexOf(KOFI_SECTION_OPEN));
  });

  it('opens Ko-fi in a new tab with noreferrer security in both locales', () => {
    for (const locale of LOCALES) {
      const html = render(locale);
      expect(html).toContain(KOFI_TIP_LINK);
      expect(html).toContain(KOFI_MEMBERSHIP_LINK);
    }
  });

  it('keeps the Ko-fi actions outside any checkout provider selection logic', () => {
    const html = render('en');
    const script = html.slice(html.indexOf('const updateSupportMethod'), html.indexOf("if (supportForm) supportForm.querySelectorAll('input[name=\"provider\"]')") + 1);
    expect(script).not.toContain('kofi');
    expect(script).not.toContain('support-actions');
    expect(script).not.toContain('membership');
  });
});

describe('privacy stays private-by-default and totals are untouched', () => {
  it('states Ko-fi privacy is separate and never auto-published', () => {
    expect(getMessages('en').support.kofiPrivacy).toMatch(/private by default/);
    expect(getMessages('en').support.kofiPrivacy).toMatch(/never publishes it automatically/);
    expect(getMessages('zh-Hant').support.kofiPrivacy).toMatch(/預設為私密/);
    expect(getMessages('zh-Hant').support.kofiPrivacy).toMatch(/不會自動發布/);
    const kofiSection = extractKofiSection(render('en'));
    expect(kofiSection).toContain(getMessages('en').support.kofiPrivacy);
  });

  it('collects no PureLink form data on the Ko-fi path', () => {
    const kofiSection = extractKofiSection(render('en'));
    expect(kofiSection).not.toContain('<input');
    expect(kofiSection).not.toContain('<textarea');
    expect(KOFI_TIP_LINK).not.toMatch(/\?/);
    expect(KOFI_MEMBERSHIP_LINK).not.toMatch(/\?/);
  });

  it('keeps opt-in supporter rendering and totals unchanged alongside the separated actions', () => {
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
});

describe('payment-provider configuration is untouched in every deployment shape', () => {
  it('keeps the fallback single submit plus the separated Ko-fi section without ECPay', () => {
    for (const providers of [{}, { lemon: true }, { ecpay: true, lemon: true }]) {
      const html = render('en', providers);
      expect(html).not.toContain(ECPAY_SUBMIT);
      if (providers.ecpay || providers.lemon) expect(html).toContain(FALLBACK_SUBMIT);
      else expect(html).toContain('Support checkout is not available yet.');
      expect(html).toContain(KOFI_SECTION_OPEN);
      const kofiSection = extractKofiSection(html);
      expect(kofiSection).toContain(KOFI_TIP_LINK);
      expect(kofiSection).toContain(KOFI_MEMBERSHIP_LINK);
    }
  });
});

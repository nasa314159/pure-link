import { describe, expect, it } from 'vitest';
import { getMessages } from '../src/i18n.js';
import { renderSupportPage } from '../src/pages.js';
import { createSupportHarness, getSupportScript } from './support-harness.js';

const LOCALES = ['en', 'zh-Hant'];
const baseTotals = { netTwd: 0, netUsdMinor: 0, contributionCount: 0, publicSupporters: [] };
const allProviders = { ecpay: true, lemon: true, paypal: true };

function render(totals = baseTotals, providers = {}, locale = 'en', returnState = '') {
  return renderSupportPage(totals, providers, returnState, 'support-nonce', locale, providers.ecpay || providers.paypal || providers.lemon ? 'site-key' : '', '');
}

function runScript(providers = allProviders, locale = 'en', harnessOptions = {}) {
  const html = render(baseTotals, providers, locale);
  const script = getSupportScript(html);
  const harness = createSupportHarness({ locale, ...harnessOptions });
  // Mirror the rendered page's provider selector (hidden input or radios) so
  // the form data and the method-switching logic see a provider value.
  const provider = harness.sandbox.document.createElement('input');
  provider.setAttribute('name', 'provider');
  provider.setAttribute('type', 'hidden');
  const singleProvider = Object.entries(providers).filter(([, enabled]) => enabled);
  provider.value = singleProvider.length === 1 ? singleProvider[0][0] : 'ecpay';
  provider.setAttribute('value', provider.value);
  harness.form.appendChild(provider);
  harness.run(script);
  harness.setProvider = (value) => {
    provider.value = String(value);
    provider.setAttribute('value', String(value));
    provider.dispatchEvent({ type: 'change' });
  };
  return harness;
}

describe('PayPal support section rendering', () => {
  it.each(LOCALES)('renders the USD presets, custom range, and distinct PayPal controls on %s', (locale) => {
    const html = render(baseTotals, allProviders, locale);
    const m = getMessages(locale).support;
    // Amounts and currency are unambiguous: the PayPal section carries US$
    // figures and never the NT$ label.
    expect(html).toContain('id="support-paypal-amount-controls"');
    expect(html).toContain('data-support-paypal-amount="5"');
    expect(html).toContain('data-support-paypal-amount="10"');
    expect(html).toContain('data-support-paypal-amount="20"');
    expect(html).toContain('data-support-paypal-amount="30"');
    expect(html).toContain('>US$5</button>');
    expect(html).toContain('id="support-paypal-amount"');
    expect(html).toContain('min="3" max="300" step="0.01"');
    expect(html).toContain(m.paypalAmount);
    expect(html).toContain(m.paypalCustomAmount);
    // Distinct checkout state: a dedicated radio and its own submit button.
    expect(html).toContain('<input type="radio" name="provider" value="paypal"');
    expect(html).toContain('id="support-paypal-button"');
    expect(html).toContain(m.paypalSubtitle);
    // Shared attribution is a single renamed section.
    expect(html).toContain('id="support-attribution"');
    expect(html).not.toContain('id="support-ecpay-attribution"');
    // The ECPay section keeps its own currency figures.
    expect(html).toContain('data-support-amount="100"');
    expect(html).toContain('>NT$100</button>');
    // Three independent publication consents.
    expect((html.match(/type="checkbox" name="publicName"/g) || []).length).toBe(1);
    expect((html.match(/type="checkbox" name="publicMessage"/g) || []).length).toBe(1);
    expect((html.match(/type="checkbox" name="publicAmount"/g) || []).length).toBe(1);
  });

  it('hides and never renders the PayPal UI while its checkout flag is off', () => {
    const html = render(baseTotals, { ecpay: true, lemon: true, paypal: false }, 'en');
    expect(html).not.toContain('id="support-paypal-amount-controls"');
    expect(html).not.toContain('value="paypal"');
    expect(html).not.toContain('id="support-paypal-button"');
    expect(html).not.toContain('data-support-paypal-amount="5"');
    expect(html).not.toContain('id="support-paypal-amount"');
    // The remaining rails are untouched.
    expect(html).toContain('id="support-amount-controls"');
    expect(html).toContain('value="lemon"');
  });

  it('renders a hidden PayPal provider input when PayPal is the only checkout rail', () => {
    const html = render(baseTotals, { ecpay: false, lemon: false, paypal: true }, 'en');
    expect(html).toContain('<input type="hidden" name="provider" value="paypal">');
    expect(html).toContain('id="support-paypal-amount-controls"');
    expect(html).toContain('id="support-paypal-button"');
    expect(html).not.toContain('id="support-amount-controls"');
    // No Sandbox checkout exposure: the approval URL never appears in the page.
    expect(html).not.toContain('checkoutnow');
  });

  it('keeps Ko-fi independent of both checkout rails in every configuration', () => {
    for (const providers of [allProviders, { ecpay: true }, { paypal: true }, {}]) {
      const html = render(baseTotals, providers, 'en');
      expect(html).toContain('<section class="support-kofi" aria-labelledby="support-kofi-heading">');
      expect(html).toContain('href="https://ko-fi.com/purelink/donate"');
      expect(html).toContain('href="https://ko-fi.com/purelink/tiers"');
    }
  });

  it.each(LOCALES)('keeps the public supporter rows in their own currency on %s', (locale) => {
    const totals = {
      netTwd: 300,
      netUsdMinor: 800,
      contributionCount: 2,
      publicSupporters: [
        { name: 'twd-fan', message: '', amount: 300 },
        { name: 'usd-fan', message: '', amountText: '8.00', currency: 'USD' },
      ],
    };
    const html = render(totals, allProviders, locale);
    // Currencies are formatted in their own denomination and never summed.
    expect(html).toContain('twd-fan');
    expect(html).toContain('usd-fan');
    // en-US renders "$8.00"; zh-TW renders "US$8.00".
    expect(html).toContain(locale === 'en' ? '$8.00' : 'US$8.00');
  });
});

describe('PayPal checkout flow in the inline script', () => {
  it('submits the PayPal amount and consent fields and opens the returned approval URL', async () => {
    const harness = runScript(allProviders, 'en');
    harness.setProvider('paypal');
    harness.paypalAmount.value = '20';
    harness.setPublicMessage(true);
    harness.setMessage('hello');
    const assignCalls = [];
    harness.sandbox.location.assign = (url) => assignCalls.push(url);
    // The handler always preventDefaults the browser submission.
    expect(harness.submit()).toBe(true);
    await new Promise((resolve) => setImmediate(resolve));
    expect(harness.fetchCalls).toHaveLength(1);
    expect(harness.fetchCalls[0].url).toBe('/api/support/checkout');
    const body = JSON.parse(harness.fetchCalls[0].options.body);
    expect(body.provider).toBe('paypal');
    expect(body.amount).toBe('20');
    expect(body.publicMessage).toBe('true');
    expect(body.message).toBe('hello');
    expect(assignCalls).toEqual(['https://example.com/redirect']);
    // The exact USD amount is shown before the redirect happens.
    expect(harness.status.hidden).toBe(false);
    expect(harness.status.textContent).toBe('Opening PayPal to complete your US$20.00 support…');
  });

  it('shows the exact two-decimal amount for a cents input', async () => {
    const harness = runScript(allProviders, 'en');
    harness.setProvider('paypal');
    harness.paypalAmount.value = '3.5';
    harness.submit();
    await new Promise((resolve) => setImmediate(resolve));
    expect(harness.status.textContent).toBe('Opening PayPal to complete your US$3.50 support…');
    const body = JSON.parse(harness.fetchCalls[0].options.body);
    expect(body.amount).toBe('3.5');
  });

  it('keeps the ECPay opening copy for the ECPay rail', async () => {
    const harness = runScript({ ecpay: true }, 'en');
    harness.submit();
    await new Promise((resolve) => setImmediate(resolve));
    expect(harness.status.textContent).toBe('Opening secure support checkout…');
    const body = JSON.parse(harness.fetchCalls[0].options.body);
    expect(body.provider).toBe('ecpay');
    expect(body.amount).toBe('100');
  });

  it('uses localized PayPal copy for zh-Hant', async () => {
    const harness = runScript(allProviders, 'zh-Hant');
    harness.setProvider('paypal');
    harness.submit();
    await new Promise((resolve) => setImmediate(resolve));
    expect(harness.status.textContent).toBe('正在前往 PayPal 完成 US$5.00 的支持…');
  });

  it('saves and restores the PayPal amount draft separately from the ECPay amount', () => {
    const harness = runScript(allProviders, 'en');
    harness.paypalAmount.value = '30';
    harness.form.dispatchEvent({ type: 'input' });
    const draft = harness.getDraft();
    expect(draft.paypalAmount).toBe('30');
    expect(draft.amount).toBe('100');
  });
});

describe('existing rails remain intact alongside PayPal', () => {
  it('preserves the ECPay-only markup contract', () => {
    const html = render(baseTotals, { ecpay: true }, 'en');
    expect(html).toContain('<button type="submit" class="support-action support-action-ecpay" id="support-button" data-provider-submit="ecpay">');
    expect(html).toContain('<input type="hidden" name="provider" value="ecpay">');
    expect(html).toContain('id="support-message-counter"');
  });

  it('preserves the lemon-only fallback contract', () => {
    const html = render(baseTotals, { lemon: true }, 'en');
    expect(html).toContain('<input type="hidden" name="provider" value="lemon">');
    expect(html).toContain('id="support-lemon-attribution"');
    expect(html).toContain('<button class="create-button" id="support-button" type="submit">');
  });

  it('keeps the disabled-checkout notice and Ko-fi section', () => {
    const html = render(baseTotals, {}, 'en');
    expect(html).toContain('Support checkout is not available yet.');
    expect(html).toContain('class="support-kofi"');
    expect(html).not.toContain('id="support-form"');
  });
});

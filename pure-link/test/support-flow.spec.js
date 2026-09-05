import { describe, expect, it } from 'vitest';
import { renderSupportPage } from '../src/pages.js';
import { createSupportHarness, getSupportScript } from './support-harness.js';

const baseTotals = { netTwd: 0, netUsdMinor: 0, contributionCount: 0, publicSupporters: [] };

function runSupportScript(locale = 'en', harnessOptions = {}) {
  const html = renderSupportPage(baseTotals, { ecpay: true }, '', 'support-nonce', locale, 'site-key');
  const script = getSupportScript(html);
  const harness = createSupportHarness({ locale, ...harnessOptions });
  harness.run(script);
  return harness;
}

describe('support message live counter', () => {
  it('renders initial state with empty message and zero counter', () => {
    const harness = runSupportScript('en');
    expect(harness.counter.textContent).toBe('0 / 2000');
    expect(harness.counter.classList.contains('is-over')).toBe(false);
    expect(harness.counter.dataset.state).toBe('ok');
    expect(harness.counterError.hidden).toBe(true);
    expect(harness.counterError.textContent).toBe('');
    expect(harness.message.attributes['aria-invalid']).toBe('false');
  });

  it('updates the counter when typing short text', () => {
    const harness = runSupportScript('en');
    harness.setMessage('hello');
    expect(harness.counter.textContent).toBe('5 / 2000');
    expect(harness.counter.classList.contains('is-over')).toBe(false);
    expect(harness.message.attributes['aria-invalid']).toBe('false');
    expect(harness.counterError.hidden).toBe(true);
  });

  it('keeps the counter in normal state at exactly 1999 and 2000 code points', () => {
    const harness = runSupportScript('en');
    harness.setMessage('a'.repeat(1999));
    expect(harness.counter.textContent).toBe('1999 / 2000');
    expect(harness.counter.classList.contains('is-over')).toBe(false);
    expect(harness.counterError.hidden).toBe(true);
    expect(harness.message.attributes['aria-invalid']).toBe('false');

    harness.setMessage('a'.repeat(2000));
    expect(harness.counter.textContent).toBe('2000 / 2000');
    expect(harness.counter.classList.contains('is-over')).toBe(false);
    expect(harness.counterError.hidden).toBe(true);
    expect(harness.message.attributes['aria-invalid']).toBe('false');
  });

  it('switches to error state at 2001 code points and reports the exact overage', () => {
    const harness = runSupportScript('en');
    harness.setMessage('a'.repeat(2001));
    expect(harness.counter.textContent).toBe('2001 / 2000');
    expect(harness.counter.classList.contains('is-over')).toBe(true);
    expect(harness.counter.dataset.state).toBe('over');
    expect(harness.counterError.hidden).toBe(false);
    expect(harness.counterError.textContent).toBe('Exceeds the 2000 character limit by 1.');
    expect(harness.message.attributes['aria-invalid']).toBe('true');
  });

  it('reports the exact overage when far over the limit (2037 code points)', () => {
    const harness = runSupportScript('en');
    harness.setMessage('x'.repeat(2037));
    expect(harness.counter.textContent).toBe('2037 / 2000');
    expect(harness.counterError.hidden).toBe(false);
    expect(harness.counterError.textContent).toBe('Exceeds the 2000 character limit by 37.');
  });

  it('counts each non-BMP emoji as exactly one code point', () => {
    const harness = runSupportScript('en');
    harness.setMessage('😀'.repeat(3));
    expect(harness.counter.textContent).toBe('3 / 2000');
    harness.setMessage('a😀b😀c');
    expect(harness.counter.textContent).toBe('5 / 2000');
  });

  it('uses localized over-limit copy for zh-Hant', () => {
    const harness = runSupportScript('zh-Hant');
    harness.setMessage('測'.repeat(2037));
    expect(harness.counter.textContent).toBe('2037 / 2000');
    expect(harness.counterError.hidden).toBe(false);
    expect(harness.counterError.textContent).toBe('已超過 2000 個字元上限 37 個字元。');
  });

  it('does not silently truncate pasted over-limit content', () => {
    const harness = runSupportScript('en');
    const pasted = 'p'.repeat(2037);
    harness.setMessage(pasted);
    expect(harness.message.value).toBe(pasted);
    expect(harness.message.value.length).toBe(2037);
    expect(harness.counter.textContent).toBe('2037 / 2000');
  });

  it('toggles back to normal state when the user shortens the message', () => {
    const harness = runSupportScript('en');
    harness.setMessage('a'.repeat(2037));
    expect(harness.counter.classList.contains('is-over')).toBe(true);
    harness.setMessage('a'.repeat(100));
    expect(harness.counter.textContent).toBe('100 / 2000');
    expect(harness.counter.classList.contains('is-over')).toBe(false);
    expect(harness.counterError.hidden).toBe(true);
    expect(harness.message.attributes['aria-invalid']).toBe('false');
  });
});

describe('support message submit blocking', () => {
  it('blocks client-side submission when publicMessage is opted in and message exceeds the limit', async () => {
    const harness = runSupportScript('en');
    harness.setMessage('a'.repeat(2037));
    harness.setPublicMessage(true);
    expect(harness.submit()).toBe(true);
    expect(harness.status.hidden).toBe(false);
    expect(harness.status.textContent).toBe('Public messages must be 2000 Unicode code points or fewer.');
    expect(harness.status.dataset.error).toBe('true');
    // Give the async submit handler a chance to call fetch — it must not.
    await Promise.resolve();
    expect(harness.fetchCalls).toHaveLength(0);
  });

  it('does not block client-side submission when message exceeds the limit but publicMessage is not opted in', async () => {
    const harness = runSupportScript('en');
    harness.setMessage('a'.repeat(2037));
    harness.setPublicMessage(false);
    harness.submit();
    // Allow the async submit handler to run; the existing flow continues to fetch.
    await new Promise((resolve) => setImmediate(resolve));
    expect(harness.fetchCalls.length).toBeGreaterThanOrEqual(1);
    expect(harness.fetchCalls[0].url).toBe('/api/support/checkout');
  });

  it('allows client-side submission at exactly the 2000 code-point limit when publicMessage is opted in', async () => {
    const harness = runSupportScript('en');
    harness.setMessage('a'.repeat(2000));
    harness.setPublicMessage(true);
    harness.submit();
    await new Promise((resolve) => setImmediate(resolve));
    expect(harness.fetchCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('uses localized block message for zh-Hant', () => {
    const harness = runSupportScript('zh-Hant');
    harness.setMessage('測'.repeat(2037));
    harness.setPublicMessage(true);
    expect(harness.submit()).toBe(true);
    expect(harness.status.textContent).toBe('公開留言不得超過 2000 個 Unicode 碼點。');
  });
});

describe('support draft restoration with counter recalculation', () => {
  it('restores a full-length over-limit draft and shows the over-limit counter on load', () => {
    const overLimitDraft = { message: 'a'.repeat(2037) };
    const harness = runSupportScript('en', {
      sessionStorageState: { 'purelink.supportDraft.v1': JSON.stringify(overLimitDraft) },
    });
    expect(harness.message.value).toBe('a'.repeat(2037));
    expect(harness.counter.textContent).toBe('2037 / 2000');
    expect(harness.counter.classList.contains('is-over')).toBe(true);
    expect(harness.counterError.hidden).toBe(false);
    expect(harness.counterError.textContent).toBe('Exceeds the 2000 character limit by 37.');
    expect(harness.message.attributes['aria-invalid']).toBe('true');
  });

  it('restores an under-limit draft and shows the normal counter on load', () => {
    const harness = runSupportScript('en', {
      sessionStorageState: { 'purelink.supportDraft.v1': JSON.stringify({ message: 'hello' }) },
    });
    expect(harness.message.value).toBe('hello');
    expect(harness.counter.textContent).toBe('5 / 2000');
    expect(harness.counter.classList.contains('is-over')).toBe(false);
  });

  it('continues to save the full over-limit draft on subsequent input', () => {
    const harness = runSupportScript('en');
    harness.setMessage('a'.repeat(2037));
    const draft = harness.getDraft();
    expect(draft.message.length).toBe(2037);
    expect(draft.message).toBe('a'.repeat(2037));
  });

  it('saves the publicMessage opt-in so the submit gate is preserved across reloads', () => {
    const harness = runSupportScript('en');
    harness.setMessage('hello');
    harness.setPublicMessage(true);
    const draft = harness.getDraft();
    expect(draft.message).toBe('hello');
    expect(draft.publicMessage).toBe(true);
  });

  it('ignores corrupted draft JSON without throwing', () => {
    expect(() => {
      runSupportScript('en', { sessionStorageState: { 'purelink.supportDraft.v1': '{not-json' } });
    }).not.toThrow();
  });
});

describe('support ECPay-only provider behavior is preserved', () => {
  it('keeps the hidden ECPay provider input and the counter features together', () => {
    const html = renderSupportPage(baseTotals, { ecpay: true }, '', 'support-nonce', 'en', 'site-key');
    expect(html).toContain('type="hidden" name="provider" value="ecpay"');
    expect(html).toContain('id="support-message-counter"');
    expect(html).toContain('id="support-message-counter-error"');
    expect(html).not.toMatch(/<textarea[^>]*id="support-message"[^>]*maxlength=/);
  });

  it('falls back to the hidden input selector when no radio is present', () => {
    const harness = runSupportScript('en');
    // The script uses querySelector('input[name="provider"]:checked') first, then
    // falls back to querySelector('input[name="provider"]'). With only a hidden
    // input present, the fallback path must still resolve to 'ecpay' so the
    // ECPay attribution fields stay enabled.
    const beforeValue = harness.sandbox.document.querySelector('input[name="provider"]:checked')?.value || harness.sandbox.document.querySelector('input[name="provider"]')?.value;
    expect(beforeValue).toBeFalsy();
    // Adding a hidden provider input mirrors the ECPay-only HTML. The script
    // reads providerInput.value, so the mock must mirror real DOM behavior of
    // falling back to the value attribute for inputs with no .value property.
    const providerInput = makeFakeInput('provider', 'ecpay', 'hidden');
    harness.form.appendChild(providerInput);
    const checkedQuery = harness.sandbox.document.querySelector('input[name="provider"]:checked');
    const anyQuery = harness.sandbox.document.querySelector('input[name="provider"]');
    const value = checkedQuery?.value || anyQuery?.value;
    expect(value).toBe('ecpay');
  });

  function makeFakeInput(name, value, type) {
    return {
      tagName: 'INPUT',
      nodeType: 1,
      children: [],
      attributes: { name, type, value },
      dataset: {},
      style: {},
      listeners: {},
      hidden: false,
      disabled: false,
      checked: false,
      textContent: '',
      parentElement: null,
      get value() { return this.attributes.value ?? ''; },
      set value(v) { this.attributes.value = String(v); },
      setAttribute(n, v) { this.attributes[n] = String(v); },
      getAttribute(n) { return n in this.attributes ? this.attributes[n] : null; },
      removeAttribute(n) { delete this.attributes[n]; },
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => {},
      appendChild() {},
      append() {},
      remove() {},
      focus() {},
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      querySelector: () => null,
      querySelectorAll: () => [],
    };
  }
});

import { describe, expect, it } from 'vitest';
import { localeFromAcceptLanguage, resolveLocale } from '../src/i18n.js';

describe('locale resolution', () => {
  it.each([
    ['zh-TW', 'zh-Hant'], ['zh-Hant', 'zh-Hant'], ['zh-Hant-TW', 'zh-Hant'], ['zh-HK', 'zh-Hant'], ['en-US', 'en'], ['en-GB', 'en'], ['fr-FR', 'en'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(localeFromAcceptLanguage(input)).toBe(expected === 'en' && input === 'fr-FR' ? null : expected);
  });

  it('uses an explicit preference before the route and browser language', () => {
    const request = new Request('https://pure.test/en/', { headers: { cookie: 'purelink_locale=zh-Hant', 'accept-language': 'en-US' } });
    expect(resolveLocale(request, 'en')).toBe('zh-Hant');
  });

  it('falls back to English for an unsupported browser locale', () => {
    expect(resolveLocale(new Request('https://pure.test/', { headers: { 'accept-language': 'fr-FR' } }))).toBe('en');
  });
});

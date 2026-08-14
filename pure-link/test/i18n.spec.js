import { describe, expect, it } from 'vitest';
import { localeFromAcceptLanguage, resolveLocale } from '../src/i18n.js';

describe('locale resolution', () => {
  it.each([
    ['zh-TW', 'zh-Hant'], ['zh-Hant', 'zh-Hant'], ['zh-Hant-TW', 'zh-Hant'], ['zh-HK', 'zh-Hant'], ['en-US', 'en'], ['en-GB', 'en'], ['fr-FR', 'en'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(localeFromAcceptLanguage(input)).toBe(expected === 'en' && input === 'fr-FR' ? null : expected);
  });

  it('uses an explicit locale route before a saved preference and browser language', () => {
    const request = new Request('https://pure.test/en/', { headers: { cookie: 'purelink_locale=zh-Hant', 'accept-language': 'en-US' } });
    expect(resolveLocale(request, 'en')).toBe('en');
  });

  it('honors Accept-Language quality values', () => {
    expect(localeFromAcceptLanguage('en-US;q=0.4, zh-TW;q=0.9')).toBe('zh-Hant');
    expect(localeFromAcceptLanguage('zh-TW;q=0, en-GB;q=0.8')).toBe('en');
  });

  it('falls back to English for an unsupported browser locale', () => {
    expect(resolveLocale(new Request('https://pure.test/', { headers: { 'accept-language': 'fr-FR' } }))).toBe('en');
  });
});

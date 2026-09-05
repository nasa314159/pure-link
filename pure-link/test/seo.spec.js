import { describe, expect, it } from 'vitest';
import { renderHomePage, renderStartPage, renderLegalPage, renderSupportPage, renderAccountPage, renderManagePage, renderReportPage, renderFormulaPage, renderCardPage } from '../src/pages.js';

function extractJsonLd(html) {
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function extractAllJsonLd(html) {
  const matches = html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g);
  const results = [];
  for (const match of matches) {
    try {
      results.push(JSON.parse(match[1]));
    } catch {
      // skip invalid JSON
    }
  }
  return results;
}

describe('SEO metadata', () => {
  describe('canonical URLs', () => {
    it('uses https://no-no.uk for canonical URLs on English pages', () => {
      const enHome = renderHomePage('test-nonce', '', false, '', null, 'en');
      expect(enHome).toContain('<link rel="canonical" href="https://no-no.uk/en/">');

      const enStart = renderStartPage('en');
      expect(enStart).toContain('<link rel="canonical" href="https://no-no.uk/en/start">');

      const enPrivacy = renderLegalPage('privacy', 'en');
      expect(enPrivacy).toContain('<link rel="canonical" href="https://no-no.uk/en/privacy">');

      const enCredits = renderLegalPage('ai-credits', 'en');
      expect(enCredits).toContain('<link rel="canonical" href="https://no-no.uk/en/ai-credits">');
    });

    it('uses https://no-no.uk for canonical URLs on Chinese pages', () => {
      const zhHome = renderHomePage('test-nonce', '', false, '', null, 'zh-Hant');
      expect(zhHome).toContain('<link rel="canonical" href="https://no-no.uk/zh-Hant/">');

      const zhStart = renderStartPage('zh-Hant');
      expect(zhStart).toContain('<link rel="canonical" href="https://no-no.uk/zh-Hant/start">');

      const zhPrivacy = renderLegalPage('privacy', 'zh-Hant');
      expect(zhPrivacy).toContain('<link rel="canonical" href="https://no-no.uk/zh-Hant/privacy">');
    });

    it('does not include canonical URL on noindex pages', () => {
      const formula = renderFormulaPage({ slug: 'test', content: 'x^2' }, 'en');
      expect(formula).toContain('<meta name="robots" content="noindex, nofollow, noarchive">');
      expect(formula).not.toContain('<link rel="canonical"');

      const card = renderCardPage({ slug: 'test', content: 'hello' }, 'en');
      expect(card).toContain('<meta name="robots" content="noindex, nofollow, noarchive">');
      expect(card).not.toContain('<link rel="canonical"');

      const account = renderAccountPage({ email: 'test@example.com' }, [], 0, {}, '', 'test-nonce', 'en');
      expect(account).toContain('<meta name="robots" content="noindex, nofollow, noarchive">');
      expect(account).not.toContain('<link rel="canonical"');
    });
  });

  describe('hreflang alternate links', () => {
    it('includes hreflang for both locales on indexable English pages', () => {
      const enHome = renderHomePage('test-nonce', '', false, '', null, 'en');
      expect(enHome).toContain('hreflang="zh-Hant"');
      expect(enHome).toContain('hreflang="en"');
      expect(enHome).toContain('hreflang="x-default"');
      expect(enHome).toContain('hreflang="zh-Hant" href="https://no-no.uk/zh-Hant/"');
      expect(enHome).toContain('hreflang="x-default" href="https://no-no.uk/en/"');
    });

    it('includes hreflang for both locales on indexable Chinese pages', () => {
      const zhHome = renderHomePage('test-nonce', '', false, '', null, 'zh-Hant');
      expect(zhHome).toContain('hreflang="zh-Hant"');
      expect(zhHome).toContain('hreflang="en"');
      expect(zhHome).toContain('hreflang="x-default"');
    });

    it('does not include hreflang on noindex pages', () => {
      const formula = renderFormulaPage({ slug: 'test', content: 'x^2' }, 'en');
      expect(formula).not.toContain('hreflang=');

      const account = renderAccountPage({ email: 'test@example.com' }, [], 0, {}, '', 'test-nonce', 'en');
      expect(account).not.toContain('hreflang=');
    });

    it('includes hreflang on start page in both locales', () => {
      const enStart = renderStartPage('en');
      expect(enStart).toContain('hreflang="zh-Hant"');
      expect(enStart).toContain('hreflang="en"');
      expect(enStart).toContain('hreflang="x-default"');

      const zhStart = renderStartPage('zh-Hant');
      expect(zhStart).toContain('hreflang="zh-Hant"');
      expect(zhStart).toContain('hreflang="en"');
      expect(zhStart).toContain('hreflang="x-default"');
    });

    it('exposes all three hreflang values on each indexable page', () => {
      const enHome = renderHomePage('test-nonce', '', false, '', null, 'en');
      const hreflangMatches = enHome.match(/hreflang="([^"]+)"/g);
      const hreflangValues = hreflangMatches ? hreflangMatches.map(m => m.match(/hreflang="([^"]+)"/)[1]) : [];
      expect(hreflangValues).toContain('en');
      expect(hreflangValues).toContain('zh-Hant');
      expect(hreflangValues).toContain('x-default');
    });
  });

  describe('JSON-LD structured data', () => {
    it('includes WebSite JSON-LD on indexable pages', () => {
      const enHome = renderHomePage('test-nonce', '', false, '', null, 'en');
      const jsonLd = extractJsonLd(enHome);
      expect(jsonLd).not.toBeNull();
      expect(jsonLd['@type']).toBe('WebSite');
      expect(jsonLd.name).toBe('PureLink');
      expect(jsonLd.url).toBe('https://no-no.uk');
    });

    it('includes valid JSON-LD on start page', () => {
      const enStart = renderStartPage('en');
      const jsonLd = extractJsonLd(enStart);
      expect(jsonLd).not.toBeNull();
      expect(jsonLd['@type']).toBe('WebSite');
      expect(jsonLd.name).toBe('PureLink');
    });

    it('includes valid JSON-LD on legal pages', () => {
      const enPrivacy = renderLegalPage('privacy', 'en');
      const jsonLd = extractJsonLd(enPrivacy);
      expect(jsonLd).not.toBeNull();
      expect(jsonLd['@type']).toBe('WebSite');

      const enCredits = renderLegalPage('ai-credits', 'en');
      const jsonLdCredits = extractJsonLd(enCredits);
      expect(jsonLdCredits).not.toBeNull();
      expect(jsonLdCredits['@type']).toBe('WebSite');
    });

    it('does not include JSON-LD on noindex pages', () => {
      const formula = renderFormulaPage({ slug: 'test', content: 'x^2' }, 'en');
      const jsonLd = extractJsonLd(formula);
      expect(jsonLd).toBeNull();

      const account = renderAccountPage({ email: 'test@example.com' }, [], 0, {}, '', 'test-nonce', 'en');
      const accountJsonLd = extractJsonLd(account);
      expect(accountJsonLd).toBeNull();
    });

    it('includes minimal truthful WebSite JSON-LD without SearchAction', () => {
      const enHome = renderHomePage('test-nonce', '', false, '', null, 'en');
      const jsonLd = extractJsonLd(enHome);
      expect(jsonLd['@context']).toBe('https://schema.org');
      expect(jsonLd['@type']).toBe('WebSite');
      expect(jsonLd.name).toBe('PureLink');
      expect(jsonLd.url).toBe('https://no-no.uk');
      expect(jsonLd.description).toBeTruthy();
      expect(jsonLd.potentialAction).toBeUndefined();
    });
  });

  describe('Google site verification', () => {
    it('does not render verification tag when not configured', () => {
      const enHome = renderHomePage('test-nonce', '', false, '', null, 'en', '');
      expect(enHome).not.toContain('google-site-verification');
    });

    it('renders verification tag when configured', () => {
      const enHome = renderHomePage('test-nonce', '', false, '', null, 'en', 'google123abc');
      expect(enHome).toContain('google-site-verification');
      expect(enHome).toContain('content="google123abc"');
    });

    it('verification tag only appears on indexable pages', () => {
      const verificationValue = 'test-verification-token';
      const enHome = renderHomePage('test-nonce', '', false, '', null, 'en', verificationValue);
      expect(enHome).toContain(`content="${verificationValue}"`);

      const formula = renderFormulaPage({ slug: 'test', content: 'x^2' }, 'en', '', verificationValue);
      expect(formula).not.toContain('google-site-verification');
    });
  });

  describe('private/account pages remain noindex', () => {
    it('account page is noindex', () => {
      const account = renderAccountPage({ email: 'test@example.com' }, [], 0, {}, '', 'test-nonce', 'en');
      expect(account).toContain('<meta name="robots" content="noindex, nofollow, noarchive">');
    });

    it('manage page is noindex', () => {
      const manage = renderManagePage({ slug: 'test', content_type: 'url', owner_user_id: null }, 'test-nonce', null, false, 'en');
      expect(manage).toContain('<meta name="robots" content="noindex, nofollow, noarchive">');
    });

    it('report page is noindex', () => {
      const report = renderReportPage('test-slug', 'test-nonce', '', 'en');
      expect(report).toContain('<meta name="robots" content="noindex, nofollow, noarchive">');
    });

    it('formula content page is noindex', () => {
      const formula = renderFormulaPage({ slug: 'test', content: 'x^2' }, 'en');
      expect(formula).toContain('<meta name="robots" content="noindex, nofollow, noarchive">');
    });

    it('card content page is noindex', () => {
      const card = renderCardPage({ slug: 'test', content: 'hello' }, 'en');
      expect(card).toContain('<meta name="robots" content="noindex, nofollow, noarchive">');
    });
  });

  describe('Open Graph metadata', () => {
    it('includes og:url with canonical URL on indexable pages', () => {
      const enHome = renderHomePage('test-nonce', '', false, '', null, 'en');
      expect(enHome).toContain('<meta property="og:url" content="https://no-no.uk/en/">');
    });

    it('includes og:site_name on all pages', () => {
      const enHome = renderHomePage('test-nonce', '', false, '', null, 'en');
      expect(enHome).toContain('<meta property="og:site_name" content="PureLink">');

      const formula = renderFormulaPage({ slug: 'test', content: 'x^2' }, 'en');
      expect(formula).toContain('<meta property="og:site_name" content="PureLink">');
    });

    it('includes og:image with proper dimensions', () => {
      const enHome = renderHomePage('test-nonce', '', false, '', null, 'en');
      expect(enHome).toContain('<meta property="og:image" content="https://no-no.uk/og.png?v=1">');
      expect(enHome).toContain('<meta property="og:image:width" content="1200">');
      expect(enHome).toContain('<meta property="og:image:height" content="630">');
    });
  });

  describe('Twitter card metadata', () => {
    it('includes twitter:card on all pages', () => {
      const enHome = renderHomePage('test-nonce', '', false, '', null, 'en');
      expect(enHome).toContain('<meta name="twitter:card" content="summary_large_image">');

      const formula = renderFormulaPage({ slug: 'test', content: 'x^2' }, 'en');
      expect(formula).toContain('<meta name="twitter:card" content="summary_large_image">');
    });

    it('includes twitter:image on indexable pages', () => {
      const enHome = renderHomePage('test-nonce', '', false, '', null, 'en');
      expect(enHome).toContain('<meta name="twitter:image" content="https://no-no.uk/og.png?v=1">');
    });
  });
});
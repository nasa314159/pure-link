import { describe, expect, it } from 'vitest';
import { constantTimeEqual, createManagementToken, createSlug, hashManagementToken, isSocialPreviewCrawler } from '../src/security.js';

describe('social preview crawler detection', () => {
  const requestWithUserAgent = (userAgent) => new Request('https://no-no.uk/slug', { headers: userAgent ? { 'user-agent': userAgent } : {} });

  it('classifies the exact Meta and Threads preview fetchers as social preview crawlers', () => {
    // Meta's long-standing link preview crawler (Facebook, Messenger, and
    // historically Threads) identifies itself with facebookexternalhit.
    expect(isSocialPreviewCrawler(requestWithUserAgent('facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'))).toBe(true);
    // Meta's current crawler for Threads and Facebook link previews.
    expect(isSocialPreviewCrawler(requestWithUserAgent('meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)'))).toBe(true);
    expect(isSocialPreviewCrawler(requestWithUserAgent('meta-externaltest/1.1'))).toBe(true);
    expect(isSocialPreviewCrawler(requestWithUserAgent('facebookcatalog/1.0'))).toBe(true);
  });

  it('classifies other common link-preview bots as social preview crawlers', () => {
    expect(isSocialPreviewCrawler(requestWithUserAgent('Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)'))).toBe(true);
    expect(isSocialPreviewCrawler(requestWithUserAgent('Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)'))).toBe(true);
    expect(isSocialPreviewCrawler(requestWithUserAgent('TelegramBot (like TwitterBot)'))).toBe(true);
    expect(isSocialPreviewCrawler(requestWithUserAgent('Twitterbot/1.0'))).toBe(true);
    expect(isSocialPreviewCrawler(requestWithUserAgent('LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient)'))).toBe(true);
    expect(isSocialPreviewCrawler(requestWithUserAgent('WhatsApp/2.23.20 A'))).toBe(true);
  });

  it('does not classify search crawlers, browsers, or unknown agents as social preview crawlers', () => {
    expect(isSocialPreviewCrawler(requestWithUserAgent('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'))).toBe(false);
    expect(isSocialPreviewCrawler(requestWithUserAgent('Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/100'))).toBe(false);
    expect(isSocialPreviewCrawler(requestWithUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'))).toBe(false);
    expect(isSocialPreviewCrawler(requestWithUserAgent('Mozilla/5.0 (compatible; InterestingBot/1.0)'))).toBe(false);
    expect(isSocialPreviewCrawler(requestWithUserAgent(''))).toBe(false);
  });
});

describe('anonymous management credentials', () => {
  it('creates URL-safe slugs and high-entropy tokens', () => {
    expect(createSlug()).toMatch(/^[1-9A-HJ-NP-Za-km-z]{10}$/);
    expect(createManagementToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('stores a one-way token hash and compares it safely', async () => {
    const token = createManagementToken();
    const first = await hashManagementToken(token);
    const second = await hashManagementToken(token);
    expect(first).toBe(second);
    expect(first).not.toContain(token);
    expect(constantTimeEqual(first, second)).toBe(true);
    expect(constantTimeEqual(first, `${second}x`)).toBe(false);
  });
});


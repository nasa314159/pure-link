import { describe, expect, it } from 'vitest';
import { AI_CREDIT_PACKS, getAiCreditPack, listAiCreditPacks } from '../src/credit-products.js';
import { renderLegalPage } from '../src/pages.js';

describe('canonical AI credit catalog', () => {
  it('keeps stable product IDs separate from provider IDs and amounts', () => {
    expect(AI_CREDIT_PACKS).toEqual({
      small: { id: 'small', priceTwd: 150, credits: 150 },
      standard: { id: 'standard', priceTwd: 300, credits: 400 },
      large: { id: 'large', priceTwd: 600, credits: 1000 },
    });
    expect(getAiCreditPack('150')).toBeNull();
    expect(listAiCreditPacks().map((pack) => pack.credits)).toEqual([150, 400, 1000]);
  });

  it('keeps the canonical catalog intact but does not advertise purchasable packs publicly by default', () => {
    const page = renderLegalPage('ai-credits', 'en');
    for (const pack of listAiCreditPacks()) {
      expect(page).not.toContain(`${AI_CREDIT_PACKS[pack.id].credits.toLocaleString('en-US')} AI formula drafts — NT$${AI_CREDIT_PACKS[pack.id].priceTwd}`);
    }
    expect(page).toContain('Paid AI credit purchases are currently unavailable during the public beta');
    expect(page).toContain('No payment rail is enabled in this deployment');
    expect(page).not.toContain('Creem');
  });

  it('renders the canonical plans directly from the catalog only when purchases are enabled', () => {
    for (const locale of ['en', 'zh-Hant']) {
      const page = renderLegalPage('ai-credits', locale, { ecpay: true, lemon: true }, '', true);
      for (const pack of listAiCreditPacks()) {
        expect(page).toContain(AI_CREDIT_PACKS[pack.id].priceTwd.toLocaleString('en-US'));
        expect(page).toContain(pack.credits.toLocaleString('en-US'));
      }
      // The purchase CTA links to the account page only; it never names a provider.
      expect(page).toContain('legal-purchase');
      expect(page).toContain(`href="/${locale}/account"`);
      expect(page).not.toContain('ECPay');
      expect(page).not.toContain('Creem');
    }
    const chinese = renderLegalPage('ai-credits', 'zh-Hant', { ecpay: true }, '', true);
    expect(chinese).toContain('小型方案：150 次 AI 公式草稿，NT$150');
    expect(chinese).toContain('標準方案：400 次 AI 公式草稿，NT$300');
    expect(chinese).toContain('大型方案：1,000 次 AI 公式草稿，NT$600');
  });

  it('never shows the purchase CTA when the server would not accept a checkout', () => {
    // Gate on but no configured provider: packs may render, but no CTA and an
    // honest payment status.
    const noProvider = renderLegalPage('ai-credits', 'en', {}, '', true);
    expect(noProvider).toContain('No payment rail is enabled in this deployment');
    expect(noProvider).not.toContain('Sign in to purchase AI formula credits');
    // Gate off with providers configured: the neutral beta message stays.
    const gateOff = renderLegalPage('ai-credits', 'zh-Hant', { ecpay: true, lemon: true }, '', false);
    expect(gateOff).toContain('公開測試期間暫不開放付費 AI 公式額度購買；每日仍有 5 次免費 AI 公式生成');
    expect(gateOff).not.toContain('小型方案：150 次 AI 公式草稿，NT$150');
    expect(gateOff).not.toContain('登入購買 AI 公式額度');
  });
});

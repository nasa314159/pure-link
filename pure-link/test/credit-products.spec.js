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

  it('renders public product information directly from the canonical catalog', () => {
    const page = renderLegalPage('ai-credits', 'en');
    for (const pack of listAiCreditPacks()) {
      expect(page).toContain(`${AI_CREDIT_PACKS[pack.id].credits.toLocaleString('en-US')} AI formula drafts — NT$${AI_CREDIT_PACKS[pack.id].priceTwd}`);
    }
    expect(page).toContain('No payment rail is enabled in this deployment');
    expect(page).not.toContain('Creem');
  });
});

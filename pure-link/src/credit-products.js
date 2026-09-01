// Product identity belongs to PureLink, never to a payment-provider SKU or price.
// Providers map their own IDs to these stable pack IDs.
export const AI_CREDIT_PACKS = Object.freeze({
  small: Object.freeze({ id: 'small', priceTwd: 150, credits: 150 }),
  standard: Object.freeze({ id: 'standard', priceTwd: 300, credits: 400 }),
  large: Object.freeze({ id: 'large', priceTwd: 600, credits: 1000 }),
});

export const AI_CREDIT_PACK_IDS = Object.freeze(Object.keys(AI_CREDIT_PACKS));

export function getAiCreditPack(packId) {
  return AI_CREDIT_PACKS[String(packId || '')] || null;
}

export function listAiCreditPacks() {
  return AI_CREDIT_PACK_IDS.map((packId) => AI_CREDIT_PACKS[packId]);
}

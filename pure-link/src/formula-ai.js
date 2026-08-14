import { ValidationError } from './content.js';
import { consumeFormulaAllowance, restorePurchasedFormulaCredit } from './billing.js';

export const FORMULA_AI_DAILY_LIMIT = 5;
export const FORMULA_AI_ADMIN_DAILY_LIMIT = 100;
export const FORMULA_AI_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_LATEX_LENGTH = 2000;

export class FormulaAiError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'FormulaAiError';
    this.status = status;
  }
}

export async function generateFormulaDraft({ description, userId, db, ai, dailyLimit = FORMULA_AI_DAILY_LIMIT, isAdmin = dailyLimit > FORMULA_AI_DAILY_LIMIT, errorMessages = null }) {
  const prompt = normalizeDescription(description, errorMessages);
  if (!db || !ai || typeof ai.run !== 'function') {
    throw new FormulaAiError(errorMessages?.formulaUnavailable || '公式生成目前無法使用，請稍後再試。', 503);
  }

  await db.prepare("DELETE FROM formula_ai_daily_usage WHERE usage_date < date('now', '-31 days')").run();
  const allowance = await consumeFormulaAllowance({ db, userId, isAdmin });

  let result;
  try {
    result = await ai.run(FORMULA_AI_MODEL, {
      messages: [
        {
          role: 'system',
          content: [
            'Convert the user description into exactly one mathematical formula in LaTeX.',
            'Return JSON with exactly one string field named latex.',
            'The latex value must contain only the formula source: no Markdown, no dollar delimiters, no explanation, no prose outside \\text{} when text is mathematically required.',
            'Preserve the variables and mathematical meaning stated by the user. Do not solve the equation unless explicitly asked.',
          ].join(' '),
        },
        { role: 'user', content: prompt },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          type: 'object',
          properties: { latex: { type: 'string' } },
          required: ['latex'],
          additionalProperties: false,
        },
      },
      max_tokens: 512,
      temperature: 0.1,
    });
  } catch {
    if (allowance.source === 'purchased') await restorePurchasedFormulaCredit(db, userId);
    throw new FormulaAiError(errorMessages?.formulaProviderFailed || 'Cloudflare Workers AI 暫時沒有完成這次生成，這次嘗試仍計入每日額度。');
  }

  let latex;
  try {
    latex = extractLatex(result, errorMessages?.formulaInvalidDraft);
  } catch (error) {
    if (allowance.source === 'purchased') await restorePurchasedFormulaCredit(db, userId);
    throw error;
  }
  return {
    latex,
    remaining: allowance.remaining,
    limit: allowance.limit,
    allowanceSource: allowance.source,
    provider: 'Cloudflare Workers AI',
    model: 'llama-3.1-8b-instruct-fast',
  };
}

export function normalizeDescription(value, errorMessages = null) {
  const description = String(value || '').trim();
  if (!description) throw new ValidationError(errorMessages?.formulaDescriptionRequired || '請先用一句話描述要產生的公式。', 'description');
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new ValidationError(errorMessages?.formulaDescriptionTooLong || `公式描述不得超過 ${MAX_DESCRIPTION_LENGTH} 個字元。`, 'description');
  }
  return description;
}

export function extractLatex(result, invalidDraftMessage = '') {
  let payload = result?.response ?? result;
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    try {
      payload = JSON.parse(trimmed);
    } catch {
      payload = { latex: trimmed };
    }
  }
  let latex = typeof payload?.latex === 'string' ? payload.latex.trim() : '';
  latex = latex.replace(/^```(?:latex|tex)?\s*/i, '').replace(/\s*```$/i, '').trim();
  if (latex.startsWith('$$') && latex.endsWith('$$')) latex = latex.slice(2, -2).trim();
  else if (latex.startsWith('$') && latex.endsWith('$')) latex = latex.slice(1, -1).trim();

  if (!latex || latex.length > MAX_LATEX_LENGTH || /<\/?[A-Za-z][^>]*>|```/.test(latex)) {
    throw new FormulaAiError(invalidDraftMessage || 'AI 沒有回傳可安全編輯的單一 LaTeX 公式，請換一種描述再試。');
  }
  return latex;
}

import { ValidationError } from './content.js';
import { consumeFormulaAllowance, restoreFormulaAllowance } from './billing.js';
import { isValidFormulaExpression } from './formula.js';

export const FORMULA_AI_DAILY_LIMIT = 5;
export const FORMULA_AI_ADMIN_DAILY_LIMIT = 100;
export const FORMULA_AI_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_LATEX_LENGTH = 2000;

export class FormulaAiError extends Error {
  constructor(message, status = 502, category = 'invalid_draft') {
    super(message);
    this.name = 'FormulaAiError';
    this.status = status;
    this.category = category;
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
    await restoreAllowanceAfterFailure(db, userId, allowance, errorMessages);
    throw new FormulaAiError(
      errorMessages?.formulaProviderFailed || 'Formula generation did not complete. Your allowance was restored; please try again.',
      502,
      'provider_failure',
    );
  }

  let latex;
  try {
    latex = extractLatex(result, errorMessages);
  } catch (error) {
    await restoreAllowanceAfterFailure(db, userId, allowance, errorMessages);
    throw error;
  }
  return {
    latex,
    remaining: allowance.remaining,
    limit: allowance.limit,
    allowanceSource: allowance.source,
    provider: 'Cloudflare Workers AI',
    model: FORMULA_AI_MODEL,
  };
}

async function restoreAllowanceAfterFailure(db, userId, allowance, errorMessages) {
  try {
    await restoreFormulaAllowance(db, userId, allowance);
  } catch {
    throw new FormulaAiError(
      errorMessages?.formulaUnavailable || 'Formula generation is unavailable right now. Please try again.',
      503,
      'quota_rollback_failure',
    );
  }
}

export function normalizeDescription(value, errorMessages = null) {
  const description = typeof value === 'string' ? value.trim() : '';
  if (!description) throw new ValidationError(errorMessages?.formulaDescriptionRequired || '請先用一句話描述要產生的公式。', 'description');
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new ValidationError(errorMessages?.formulaDescriptionTooLong || `公式描述不得超過 ${MAX_DESCRIPTION_LENGTH} 個字元。`, 'description');
  }
  return description;
}

// Workers AI wraps text-generation output in `response`; accept either its JSON
// string or an already-parsed `{ latex }` value. Direct schema values are also
// supported, but bare LaTeX strings and arbitrary nested response fields are not.
export function extractLatex(result, errorMessages = null) {
  const hasResponse = result !== null && typeof result === 'object' && Object.prototype.hasOwnProperty.call(result, 'response');
  let payload = hasResponse ? result.response : result;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload.trim());
    } catch {
      throw unexpectedResponseError(errorMessages);
    }
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw unexpectedResponseError(errorMessages);
  }
  const keys = Object.keys(payload);
  if (keys.length !== 1 || keys[0] !== 'latex' || typeof payload.latex !== 'string') {
    throw unexpectedResponseError(errorMessages);
  }

  let latex = payload.latex.trim();
  latex = latex.replace(/^```(?:latex|tex)?\s*/i, '').replace(/\s*```$/i, '').trim();
  if (latex.startsWith('$$') && latex.endsWith('$$')) latex = latex.slice(2, -2).trim();
  else if (latex.startsWith('$') && latex.endsWith('$')) latex = latex.slice(1, -1).trim();

  if (!latex || latex.length > MAX_LATEX_LENGTH || /<\/?[A-Za-z][^>]*>|```/.test(latex)) {
    throw invalidDraftError(errorMessages);
  }
  if (!isValidFormulaExpression(latex)) {
    throw invalidDraftError(errorMessages);
  }
  return latex;
}

function unexpectedResponseError(errorMessages) {
  return new FormulaAiError(
    errorMessages?.formulaResponseInvalid || 'Formula generation returned an unreadable response. Your allowance was restored; please try again.',
    502,
    'unexpected_response',
  );
}

function invalidDraftError(errorMessages) {
  return new FormulaAiError(
    errorMessages?.formulaInvalidDraft || 'AI did not return a valid editable LaTeX formula. Your allowance was restored; please try a different description.',
    502,
    'invalid_draft',
  );
}

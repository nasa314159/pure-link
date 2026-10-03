import { ValidationError } from './content.js';
import { consumeFormulaAllowance, restoreFormulaAllowance } from './billing.js';
import { isValidFormulaExpression } from './formula.js';
import { FormulaProviderResponseError, runAzureOpenAIFormulaProvider } from './formula-provider.js';

export const FORMULA_AI_DAILY_LIMIT = 5;
export const FORMULA_AI_ADMIN_DAILY_LIMIT = 100;
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

export async function generateFormulaDraft({
  description,
  image = null,
  userId,
  db,
  azureOpenAI,
  inferenceProvider = runAzureOpenAIFormulaProvider,
  fetchImplementation,
  dailyLimit = FORMULA_AI_DAILY_LIMIT,
  isAdmin = dailyLimit > FORMULA_AI_DAILY_LIMIT,
  errorMessages = null,
}) {
  const prompt = normalizeDescription(description, errorMessages);
  validateNormalizedImage(image, errorMessages);
  if (!db || !azureOpenAI?.endpoint?.trim() || !azureOpenAI?.apiKey?.trim() || !azureOpenAI?.deployment?.trim()) {
    throw new FormulaAiError(errorMessages?.formulaUnavailable || '公式生成目前無法使用，請稍後再試。', 503);
  }

  await db.prepare("DELETE FROM formula_ai_daily_usage WHERE usage_date < date('now', '-31 days')").run();
  const allowance = await consumeFormulaAllowance({ db, userId, isAdmin });

  let result;
  try {
    result = await inferenceProvider({ ...azureOpenAI, description: prompt, image, fetchImplementation });
  } catch (error) {
    await restoreAllowanceAfterFailure(db, userId, allowance, errorMessages);
    if (error instanceof FormulaProviderResponseError) throw unexpectedResponseError(errorMessages);
    throw new FormulaAiError(
      errorMessages?.formulaProviderFailed || 'Formula generation did not complete. Your allowance was restored; please try again.',
      502,
      'provider_failure',
    );
  }

  let normalized;
  try {
    normalized = extractFormulaResult(result.output, errorMessages);
  } catch (error) {
    await restoreAllowanceAfterFailure(db, userId, allowance, errorMessages);
    throw error;
  }
  if (normalized.ambiguity === 'needs_context') {
    await restoreAllowanceAfterFailure(db, userId, allowance, errorMessages);
    throw new FormulaAiError(
      errorMessages?.formulaNeedContext || 'Please add a little more context so PureLink can choose the right formula.',
      422,
      'needs_context',
    );
  }
  return {
    latex: normalized.latex,
    remaining: allowance.remaining,
    limit: allowance.limit,
    allowanceSource: allowance.source,
    provider: result.provider,
    model: result.model,
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

export function extractFormulaResult(result, errorMessages = null) {
  const payload = result;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw unexpectedResponseError(errorMessages);
  const keys = Object.keys(payload);
  if (keys.length !== 2 || !keys.includes('latex') || !keys.includes('needs_context')
    || typeof payload.latex !== 'string' || typeof payload.needs_context !== 'boolean') {
    throw unexpectedResponseError(errorMessages);
  }

  const latex = payload.latex.trim();
  if (payload.needs_context) {
    if (latex) throw invalidDraftError(errorMessages);
    return { latex: '', ambiguity: 'needs_context' };
  }

  if (!latex || latex.length > MAX_LATEX_LENGTH || /<\/?[A-Za-z][^>]*>|```/.test(latex)
    || /^\$|\$$/.test(latex) || containsProse(latex)) {
    throw invalidDraftError(errorMessages);
  }
  if (!isValidFormulaExpression(latex)) {
    throw invalidDraftError(errorMessages);
  }
  return { latex };
}

// Kept for callers/tests that want only a formula string; ambiguous responses
// are deliberately not coerced into an empty draft.
export function extractLatex(result, errorMessages = null) {
  const normalized = extractFormulaResult(result, errorMessages);
  if (normalized.ambiguity) throw needsContextError(errorMessages);
  return normalized.latex;
}

function validateNormalizedImage(image, errorMessages) {
  if (image === null) return;
  if (!image || !['image/png', 'image/jpeg'].includes(image.mimeType)
    || !(image.bytes instanceof Uint8Array) || image.bytes.byteLength < 1 || image.bytes.byteLength > 2 * 1024 * 1024) {
    throw new ValidationError(errorMessages?.formulaImageInvalid || 'Use a valid PNG or JPEG reference image.', 'image');
  }
}

function containsProse(latex) {
  const withoutTextCommands = latex
    .replace(/\\(?:text|operatorname|mathrm)\s*\{(?:[^{}]|\{[^{}]*\})*\}/g, '')
    .replace(/\\[A-Za-z]+/g, ' ');
  return /[\u3400-\u9fff]|\b(?:the|this|equation|formula|is given by|therefore|thus|where|assuming|we have|let us)\b/i.test(withoutTextCommands);
}

function needsContextError(errorMessages) {
  return new FormulaAiError(
    errorMessages?.formulaNeedContext || 'Please add a little more context so PureLink can choose the right formula.',
    422,
    'needs_context',
  );
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

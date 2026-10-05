// TEMPORARY diagnostics for the formula AI image-route failure investigation.
// Each event is one compact console line with the stable '[formula-ai-debug]'
// prefix so `wrangler tail --format pretty` reveals which lifecycle stage a
// failing image request passes through. Redaction is enforced by construction:
// every field value is whitelisted before printing, so prompt text, image
// bytes, base64 data URLs, provider response bodies, API keys, request
// headers, and user identifiers can never be emitted. Remove this module and
// its call sites once the failure is diagnosed.

const DEBUG_PREFIX = '[formula-ai-debug]';

const KNOWN_ERROR_NAMES = new Set([
  'Error', 'TypeError', 'RangeError', 'SyntaxError', 'DOMException', 'ValidationError',
  'FormulaProviderRequestError', 'FormulaProviderResponseError', 'FormulaAiError',
]);

const KNOWN_ERROR_CATEGORIES = new Set([
  'timeout', 'network_error', 'authentication', 'deployment_not_found',
  'rate_limited', 'provider_unavailable', 'provider_rejected', 'provider_failure',
  'unexpected_response', 'invalid_draft', 'needs_context', 'quota_rollback_failure',
]);

const KNOWN_RESPONSE_STATUSES = new Set([
  'completed', 'incomplete', 'failed', 'in_progress', 'cancelled', 'queued',
]);
const KNOWN_INCOMPLETE_REASONS = new Set(['max_output_tokens', 'content_filter']);
const KNOWN_IMAGE_MIME = /^image\/[a-z0-9][a-z0-9.+-]{0,31}$/;

// One value per real branch in extractFormulaResult (src/formula-ai.js), in
// validator order. Never contains formula or prompt content.
const KNOWN_VALIDATION_REASONS = new Set([
  'invalid_result_shape',
  'missing_required_field',
  'needs_context_with_nonempty_latex',
  'empty_latex',
  'latex_too_long',
  'invalid_latex',
  'prose_in_latex',
  'unsupported_expression',
]);

export function logFormulaAiDebug(stage, fields = {}) {
  console.log(`${DEBUG_PREFIX} ${JSON.stringify({ stage, ...fields })}`);
}

export function debugErrorName(error) {
  return error !== null && typeof error === 'object' && KNOWN_ERROR_NAMES.has(error.name) ? error.name : null;
}

export function debugErrorCategory(error) {
  return error !== null && typeof error === 'object' && KNOWN_ERROR_CATEGORIES.has(error.category) ? error.category : null;
}

export function debugErrorStatus(error) {
  return error !== null && typeof error === 'object' && typeof error.status === 'number' ? error.status : null;
}

export function debugImageMime(value) {
  return typeof value === 'string' && KNOWN_IMAGE_MIME.test(value) ? value : null;
}

export function debugResponseStatus(payload) {
  return payload !== null && typeof payload === 'object' && KNOWN_RESPONSE_STATUSES.has(payload.status) ? payload.status : null;
}

export function debugIncompleteReason(payload) {
  const reason = payload !== null && typeof payload === 'object' ? payload.incomplete_details?.reason : null;
  return KNOWN_INCOMPLETE_REASONS.has(reason) ? reason : null;
}

// Safe reason for a draft-validation failure: the validator attaches a fixed
// internal reason to its errors; anything unrecognized falls back to a
// non-sensitive catch-all instead of leaking error text.
export function debugValidationReason(error) {
  return error !== null && typeof error === 'object' && KNOWN_VALIDATION_REASONS.has(error.validationReason)
    ? error.validationReason
    : 'other_validation_failure';
}

// Length/shape metadata of the provider draft used by the validator. Counts
// and booleans only — never the latex text itself.
export function debugDraftShape(output) {
  if (output === null || typeof output !== 'object' || Array.isArray(output)) {
    return { needsContext: null, latexPresent: false, latexLength: null };
  }
  const latexLength = typeof output.latex === 'string' ? output.latex.trim().length : null;
  return {
    needsContext: typeof output.needs_context === 'boolean' ? output.needs_context : null,
    latexPresent: latexLength !== null && latexLength > 0,
    latexLength,
  };
}

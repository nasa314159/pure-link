// Unicode code-point counting matches the SQLite length(TEXT) semantics that the
// ECPay support backend enforces in normalizeText: every Unicode code point
// (including surrogate-pair emoji and other non-BMP characters) counts as one.
// Array.from splits a string by code points, so it is the correct, dependency-
// free way to count here.

export const MESSAGE_LIMIT = 2000;

export function countCodePoints(value) {
  if (value == null) return 0;
  return Array.from(String(value)).length;
}

export function isOverLimit(value, limit = MESSAGE_LIMIT) {
  return countCodePoints(value) > limit;
}

export function overBy(value, limit = MESSAGE_LIMIT) {
  const length = countCodePoints(value);
  return Math.max(0, length - limit);
}

export function interpolate(template, values = {}) {
  return String(template || '').replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''));
}

export function formatCounter(messages, value, limit = MESSAGE_LIMIT) {
  const length = countCodePoints(value);
  return interpolate(messages?.messageCounter, { count: length, limit });
}

export function formatOverLimitMessage(messages, value, limit = MESSAGE_LIMIT) {
  const length = countCodePoints(value);
  return interpolate(messages?.messageCounterOver, { count: Math.max(0, length - limit), limit });
}

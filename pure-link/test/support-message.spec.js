import { describe, expect, it } from 'vitest';
import {
  MESSAGE_LIMIT,
  countCodePoints,
  isOverLimit,
  overBy,
  interpolate,
  formatCounter,
  formatOverLimitMessage,
} from '../src/support-message.js';

const sampleMessages = {
  messageCounter: '{count} / {limit}',
  messageCounterOver: 'Exceeds the 2000 character limit by {count}.',
};

const chineseMessages = {
  messageCounter: '{count} / {limit}',
  messageCounterOver: '已超過 2000 個字元上限 {count} 個字元。',
};

describe('support message counter helpers', () => {
  it('exports MESSAGE_LIMIT as 2000 to match backend SQLite semantics', () => {
    expect(MESSAGE_LIMIT).toBe(2000);
  });

  it('counts empty and null values as zero', () => {
    expect(countCodePoints('')).toBe(0);
    expect(countCodePoints(null)).toBe(0);
    expect(countCodePoints(undefined)).toBe(0);
    expect(isOverLimit('')).toBe(false);
    expect(overBy('')).toBe(0);
  });

  it('counts exactly 1999 / 2000 / 2001 code points at the boundary', () => {
    expect(countCodePoints('a'.repeat(1999))).toBe(1999);
    expect(countCodePoints('a'.repeat(2000))).toBe(2000);
    expect(countCodePoints('a'.repeat(2001))).toBe(2001);
    expect(isOverLimit('a'.repeat(1999))).toBe(false);
    expect(isOverLimit('a'.repeat(2000))).toBe(false);
    expect(isOverLimit('a'.repeat(2001))).toBe(true);
    expect(overBy('a'.repeat(2000))).toBe(0);
    expect(overBy('a'.repeat(2001))).toBe(1);
    expect(overBy('a'.repeat(2037))).toBe(37);
  });

  it('counts non-BMP and emoji as code points, matching backend Array.from length', () => {
    expect(countCodePoints('😀')).toBe(1);
    expect(countCodePoints('😀😀😀')).toBe(3);
    expect(countCodePoints('a😀b😀c')).toBe(5);
    expect(countCodePoints('😀'.repeat(2000))).toBe(2000);
    expect(countCodePoints('😀'.repeat(2001))).toBe(2001);
    expect(isOverLimit('😀'.repeat(2001))).toBe(true);
    expect(isOverLimit('😀'.repeat(2000))).toBe(false);
  });

  it('agrees exactly with Array.from(value).length on every sample', () => {
    for (const sample of [
      '',
      'a',
      'a'.repeat(1999),
      'a'.repeat(2000),
      'a'.repeat(2001),
      '😀',
      '中文測試',
      '🎉'.repeat(500),
      '🎉'.repeat(2000),
      '🎉'.repeat(2001),
    ]) {
      expect(countCodePoints(sample)).toBe(Array.from(sample).length);
    }
  });

  it('does not silently truncate when the value exceeds the limit', () => {
    const longValue = 'x'.repeat(2037);
    expect(countCodePoints(longValue)).toBe(2037);
    expect(isOverLimit(longValue)).toBe(true);
    expect(overBy(longValue)).toBe(37);
  });

  it('interpolates {count} and {limit} placeholders safely', () => {
    expect(interpolate('{count} / {limit}', { count: 123, limit: 2000 })).toBe('123 / 2000');
    expect(interpolate('{count} / {limit}', { count: 0, limit: 2000 })).toBe('0 / 2000');
    expect(interpolate('missing {missing}', { other: 1 })).toBe('missing ');
  });

  it('formats the normal counter as "{count} / {limit}"', () => {
    expect(formatCounter(sampleMessages, 'a'.repeat(123))).toBe('123 / 2000');
    expect(formatCounter(sampleMessages, 'a'.repeat(1999))).toBe('1999 / 2000');
    expect(formatCounter(sampleMessages, 'a'.repeat(2000))).toBe('2000 / 2000');
    expect(formatCounter(sampleMessages, '')).toBe('0 / 2000');
  });

  it('formats the over-limit message with the difference using Math.max to avoid negatives', () => {
    expect(formatOverLimitMessage(sampleMessages, 'a'.repeat(2000))).toBe('Exceeds the 2000 character limit by 0.');
    expect(formatOverLimitMessage(sampleMessages, 'a'.repeat(2001))).toBe('Exceeds the 2000 character limit by 1.');
    expect(formatOverLimitMessage(sampleMessages, 'a'.repeat(2037))).toBe('Exceeds the 2000 character limit by 37.');
  });

  it('caller is expected to gate the over-limit message with isOverLimit', () => {
    const valueAtLimit = 'a'.repeat(2000);
    const overValue = 'a'.repeat(2037);
    expect(isOverLimit(valueAtLimit)).toBe(false);
    expect(isOverLimit(overValue)).toBe(true);
    const text = isOverLimit(overValue) ? formatOverLimitMessage(sampleMessages, overValue) : '';
    expect(text).toBe('Exceeds the 2000 character limit by 37.');
  });

  it('formats localized over-limit copy in zh-Hant', () => {
    expect(formatCounter(chineseMessages, '測'.repeat(2001))).toBe('2001 / 2000');
    expect(formatOverLimitMessage(chineseMessages, '測'.repeat(2037))).toBe('已超過 2000 個字元上限 37 個字元。');
  });

  it('treats 2000 code points as the inclusive upper bound', () => {
    expect(isOverLimit('a'.repeat(MESSAGE_LIMIT))).toBe(false);
    expect(isOverLimit('a'.repeat(MESSAGE_LIMIT + 1))).toBe(true);
    expect(overBy('a'.repeat(MESSAGE_LIMIT))).toBe(0);
  });

  it('returns the difference between length and limit (non-negative)', () => {
    expect(overBy('a'.repeat(2000))).toBe(0);
    expect(overBy('a'.repeat(1999))).toBe(0);
    expect(overBy('a'.repeat(2005))).toBe(5);
    expect(overBy('a'.repeat(5000))).toBe(3000);
  });
});

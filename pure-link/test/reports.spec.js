import { describe, expect, it } from 'vitest';
import { normalizeReportInput } from '../src/reports.js';

describe('content reports', () => {
  it('normalizes a minimal report without collecting contact information', () => {
    const report = normalizeReportInput({ slug: 'safe-link', category: 'phishing', details: 'Looks suspicious.' });
    expect(report.slug).toBe('safe-link');
    expect(report.category).toBe('phishing');
    expect(report).not.toHaveProperty('email');
  });

  it('rejects unknown categories and oversized details', () => {
    expect(() => normalizeReportInput({ slug: 'safe', category: 'dislike' })).toThrow(/reason/);
    expect(() => normalizeReportInput({ slug: 'safe', category: 'other', details: 'x'.repeat(1001) })).toThrow(/1000/);
  });
});

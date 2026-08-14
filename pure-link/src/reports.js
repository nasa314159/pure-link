import { ValidationError } from './content.js';
import { randomBase58 } from './security.js';

const REPORT_CATEGORIES = new Set(['phishing', 'malware', 'impersonation', 'copyright', 'privacy', 'other']);

export function normalizeReportInput(input, errorMessages = null) {
  const slug = String(input?.slug || '').trim();
  const category = String(input?.category || '').toLowerCase();
  const details = String(input?.details || '').replace(/\r\n?/g, '\n').trim();
  if (!slug || slug.length > 30 || !/^[A-Za-z0-9_-]+$/.test(slug)) {
    throw new ValidationError(errorMessages?.reportInvalidSlug || 'Choose a valid PureLink to report.', 'slug');
  }
  if (!REPORT_CATEGORIES.has(category)) {
    throw new ValidationError(errorMessages?.reportInvalidCategory || 'Choose a reason for the report.', 'category');
  }
  if (details.length > 1000) {
    throw new ValidationError(errorMessages?.reportDetailsTooLong || 'Report details must be 1000 characters or fewer.', 'details');
  }
  return { id: randomBase58(16), slug, category, details: details || null };
}

export async function createReport(db, report) {
  return db.prepare(`
    INSERT INTO reports (id, slug, category, details, status, created_at)
    VALUES (?, ?, ?, ?, 'new', CURRENT_TIMESTAMP)
  `).bind(report.id, report.slug, report.category, report.details).run();
}

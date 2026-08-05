export function recordAggregateMetric({ context, db, request, metricName, contentType = 'none' }) {
  if (!context?.waitUntil || !db) return;
  const countryCode = normalizeCountryCode(request.cf?.country);
  const metricDate = new Date().toISOString().slice(0, 10);

  context.waitUntil(
    db.prepare(`
      INSERT INTO daily_metrics (metric_date, metric_name, content_type, country_code, count)
      VALUES (?, ?, ?, ?, 1)
      ON CONFLICT(metric_date, metric_name, content_type, country_code)
      DO UPDATE SET count = count + 1
    `).bind(metricDate, metricName, contentType, countryCode).run().catch((error) => {
      console.error('Aggregate metric failed', { metricName, message: error?.message });
    }),
  );
}

export function normalizeCountryCode(value) {
  const code = String(value || '').toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : 'ZZ';
}

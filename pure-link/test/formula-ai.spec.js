import { describe, expect, it, vi } from 'vitest';
import {
  FORMULA_AI_DAILY_LIMIT,
  FORMULA_AI_MODEL,
  FormulaAiError,
  extractLatex,
  generateFormulaDraft,
  normalizeDescription,
} from '../src/formula-ai.js';

describe('formula AI', () => {
  it('validates a short natural-language description', () => {
    expect(normalizeDescription('  energy equals mass times light speed squared  ')).toBe('energy equals mass times light speed squared');
    expect(() => normalizeDescription('')).toThrow('請先用一句話');
    expect(() => normalizeDescription('x'.repeat(501))).toThrow('不得超過 500');
  });

  it('extracts a single editable LaTeX expression and rejects markup', () => {
    expect(extractLatex({ response: { latex: 'E=mc^2' } })).toBe('E=mc^2');
    expect(extractLatex({ response: '{"latex":"$$\\\\frac{a}{b}$$"}' })).toBe('\\frac{a}{b}');
    expect(() => extractLatex({ response: { latex: '<script>alert(1)</script>' } })).toThrow(FormulaAiError);
  });

  it('uses the Cloudflare model without storing the prompt or result in D1', async () => {
    const db = new UsageDb();
    const ai = { run: vi.fn().mockResolvedValue({ response: { latex: '\\nabla^2\\psi=0' } }) };

    const result = await generateFormulaDraft({
      description: 'the Laplace equation for psi',
      userId: 'user-1',
      db,
      ai,
    });

    expect(result).toMatchObject({ latex: '\\nabla^2\\psi=0', remaining: 4, provider: 'Cloudflare Workers AI' });
    expect(ai.run).toHaveBeenCalledWith(FORMULA_AI_MODEL, expect.objectContaining({ max_tokens: 512, temperature: 0.1 }));
    expect(db.boundValues.flat()).not.toContain('the Laplace equation for psi');
    expect(db.boundValues.flat()).not.toContain('\\nabla^2\\psi=0');
  });

  it('enforces the five-per-day account limit atomically', async () => {
    const db = new UsageDb();
    const ai = { run: vi.fn().mockResolvedValue({ response: { latex: 'x=1' } }) };
    for (let count = 0; count < FORMULA_AI_DAILY_LIMIT; count += 1) {
      await generateFormulaDraft({ description: 'x equals one', userId: 'user-1', db, ai });
    }

    await expect(generateFormulaDraft({ description: 'one more', userId: 'user-1', db, ai }))
      .rejects.toMatchObject({ status: 429 });
    expect(ai.run).toHaveBeenCalledTimes(FORMULA_AI_DAILY_LIMIT);
  });
});

class UsageDb {
  constructor() {
    this.count = 0;
    this.boundValues = [];
  }

  prepare(sql) {
    const db = this;
    return {
      bind(...values) {
        db.boundValues.push(values);
        return {
          async first() {
            if (!sql.includes('INSERT INTO formula_ai_daily_usage')) return null;
            if (db.count >= FORMULA_AI_DAILY_LIMIT) return null;
            db.count += 1;
            return { request_count: db.count };
          },
          async run() { return { success: true }; },
        };
      },
      async run() { return { success: true }; },
    };
  }
}

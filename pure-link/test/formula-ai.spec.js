import { describe, expect, it, vi } from 'vitest';
import {
  FORMULA_AI_DAILY_LIMIT,
  FORMULA_AI_ADMIN_DAILY_LIMIT,
  FORMULA_AI_MODEL,
  extractLatex,
  generateFormulaDraft,
  normalizeDescription,
} from '../src/formula-ai.js';

describe('formula AI', () => {
  it('validates a short natural-language description', () => {
    expect(normalizeDescription('  energy equals mass times light speed squared  ')).toBe('energy equals mass times light speed squared');
    expect(() => normalizeDescription('')).toThrow('請先用一句話');
    expect(() => normalizeDescription({ formula: 'E=mc^2' })).toThrow('請先用一句話');
    expect(() => normalizeDescription('x'.repeat(501))).toThrow('不得超過 500');
  });

  it('extracts explicit Workers AI response and direct schema object shapes', () => {
    expect(extractLatex({ response: { latex: 'E=mc^2' } })).toBe('E=mc^2');
    expect(extractLatex({ latex: 'E=mc^2' })).toBe('E=mc^2');
    expect(extractLatex({ response: '{"latex":"$$\\\\frac{a}{b}$$"}' })).toBe('\\frac{a}{b}');
    expect(extractLatex({ response: { latex: 'x < y' } })).toBe('x < y');
  });

  it('classifies malformed response and rejected LaTeX separately', () => {
    expect(() => extractLatex({ response: '' })).toThrow(expect.objectContaining({ category: 'unexpected_response' }));
    expect(() => extractLatex({ response: 'not JSON' })).toThrow(expect.objectContaining({ category: 'unexpected_response' }));
    expect(() => extractLatex({ response: { latex: 'x=1', extra: true } })).toThrow(expect.objectContaining({ category: 'unexpected_response' }));
    expect(() => extractLatex({ response: { latex: '' } })).toThrow(expect.objectContaining({ category: 'invalid_draft' }));
    expect(() => extractLatex({ response: { latex: '<script>alert(1)</script>' } })).toThrow(expect.objectContaining({ category: 'invalid_draft' }));
    expect(() => extractLatex({ response: { latex: '\\notACommand{x}' } })).toThrow(expect.objectContaining({ category: 'invalid_draft' }));
  });

  it('gives an administrator a capped 100-attempt allowance', async () => {
    const db = new UsageDb();
    const ai = { run: vi.fn().mockResolvedValue({ response: { latex: 'x<y' } }) };
    const result = await generateFormulaDraft({
      description: 'x is less than y',
      userId: 'admin-1',
      db,
      ai,
      dailyLimit: FORMULA_AI_ADMIN_DAILY_LIMIT,
    });
    expect(result).toMatchObject({ latex: 'x<y', limit: 100, remaining: 99, model: FORMULA_AI_MODEL });
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

    expect(result).toMatchObject({ latex: '\\nabla^2\\psi=0', remaining: 4, provider: 'Cloudflare Workers AI', model: FORMULA_AI_MODEL });
    expect(ai.run).toHaveBeenCalledWith(FORMULA_AI_MODEL, expect.objectContaining({
      max_tokens: 512,
      temperature: 0.1,
      response_format: expect.objectContaining({ type: 'json_schema' }),
    }));
    expect(db.boundValues.flat()).not.toContain('the Laplace equation for psi');
    expect(db.boundValues.flat()).not.toContain('\\nabla^2\\psi=0');
  });

  it('offers five free generations before requiring purchased credits', async () => {
    const db = new UsageDb();
    const ai = { run: vi.fn().mockResolvedValue({ response: { latex: 'x=1' } }) };
    for (let count = 0; count < FORMULA_AI_DAILY_LIMIT; count += 1) {
      await generateFormulaDraft({ description: 'x equals one', userId: 'user-1', db, ai });
    }

    await expect(generateFormulaDraft({ description: 'one more', userId: 'user-1', db, ai }))
      .rejects.toMatchObject({ status: 402 });
    expect(ai.run).toHaveBeenCalledTimes(FORMULA_AI_DAILY_LIMIT);
  });

  it('uses a purchased credit after the five daily free generations', async () => {
    const db = new UsageDb(2);
    const ai = { run: vi.fn().mockResolvedValue({ response: { latex: 'x=1' } }) };
    for (let count = 0; count < FORMULA_AI_DAILY_LIMIT; count += 1) {
      await generateFormulaDraft({ description: 'x equals one', userId: 'user-1', db, ai });
    }
    const result = await generateFormulaDraft({ description: 'one more', userId: 'user-1', db, ai });
    expect(result).toMatchObject({ allowanceSource: 'purchased', remaining: 1 });
  });

  it('restores free daily allowance when inference fails without exposing provider details', async () => {
    const db = new UsageDb();
    const ai = { run: vi.fn().mockRejectedValue(new Error('secret provider response')) };

    await expect(generateFormulaDraft({ description: 'x equals one', userId: 'user-1', db, ai }))
      .rejects.toMatchObject({ category: 'provider_failure', message: expect.not.stringContaining('secret provider response') });
    expect(db.count).toBe(0);

    ai.run.mockResolvedValue({ response: { latex: 'x=1' } });
    for (let count = 0; count < FORMULA_AI_DAILY_LIMIT; count += 1) {
      await generateFormulaDraft({ description: 'x equals one', userId: 'user-1', db, ai });
    }
    await expect(generateFormulaDraft({ description: 'one more', userId: 'user-1', db, ai }))
      .rejects.toMatchObject({ status: 402 });
    expect(db.count).toBe(FORMULA_AI_DAILY_LIMIT);
  });

  it('restores free allowance for malformed and rejected model responses', async () => {
    const db = new UsageDb();
    const ai = { run: vi.fn().mockResolvedValue({ response: 'not JSON' }) };

    await expect(generateFormulaDraft({ description: 'x equals one', userId: 'user-1', db, ai }))
      .rejects.toMatchObject({ category: 'unexpected_response' });
    expect(db.count).toBe(0);

    ai.run.mockResolvedValue({ response: { latex: '' } });
    await expect(generateFormulaDraft({ description: 'x equals one', userId: 'user-1', db, ai }))
      .rejects.toMatchObject({ category: 'invalid_draft' });
    expect(db.count).toBe(0);

    ai.run.mockResolvedValue({ response: { latex: '<script>bad</script>' } });
    await expect(generateFormulaDraft({ description: 'x equals one', userId: 'user-1', db, ai }))
      .rejects.toMatchObject({ category: 'invalid_draft' });
    expect(db.count).toBe(0);
  });

  it('restores a purchased credit and daily count once when purchased generation fails', async () => {
    const db = new UsageDb(2);
    const success = { run: vi.fn().mockResolvedValue({ response: { latex: 'x=1' } }) };
    for (let count = 0; count < FORMULA_AI_DAILY_LIMIT; count += 1) {
      await generateFormulaDraft({ description: 'x equals one', userId: 'user-1', db, ai: success });
    }

    const failure = { run: vi.fn().mockRejectedValue(new Error('provider failure')) };
    await expect(generateFormulaDraft({ description: 'one more', userId: 'user-1', db, ai: failure }))
      .rejects.toMatchObject({ category: 'provider_failure' });
    expect(db.count).toBe(FORMULA_AI_DAILY_LIMIT);
    expect(db.balance).toBe(2);
    expect(db.purchasedRefunds).toBe(1);

    const result = await generateFormulaDraft({ description: 'one more', userId: 'user-1', db, ai: success });
    expect(result).toMatchObject({ allowanceSource: 'purchased', remaining: 1 });
    expect(db.balance).toBe(1);
  });

  it('restores the free bucket when an earlier free request fails after a paid request starts', async () => {
    const db = new UsageDb(2);
    let rejectPending;
    let signalEntered;
    const entered = new Promise((resolve) => { signalEntered = resolve; });
    const pendingAi = {
      run: vi.fn(() => new Promise((_, reject) => {
        rejectPending = reject;
        signalEntered();
      })),
    };
    const pending = generateFormulaDraft({ description: 'first formula', userId: 'user-1', db, ai: pendingAi });
    await entered;

    const success = { run: vi.fn().mockResolvedValue({ response: { latex: 'x=1' } }) };
    for (let count = 1; count < FORMULA_AI_DAILY_LIMIT; count += 1) {
      await generateFormulaDraft({ description: 'another formula', userId: 'user-1', db, ai: success });
    }
    const purchased = await generateFormulaDraft({ description: 'paid formula', userId: 'user-1', db, ai: success });
    expect(purchased.allowanceSource).toBe('purchased');

    rejectPending(new Error('provider failure'));
    await expect(pending).rejects.toMatchObject({ category: 'provider_failure' });
    const restored = await generateFormulaDraft({ description: 'restored free formula', userId: 'user-1', db, ai: success });
    expect(restored.allowanceSource).toBe('free');
    expect(db.freeCount).toBe(FORMULA_AI_DAILY_LIMIT);
    expect(db.balance).toBe(1);
  });
});

class UsageDb {
  constructor(balance = 0) {
    this.count = 0;
    this.freeCount = 0;
    this.balance = balance;
    this.boundValues = [];
    this.purchasedRefunds = 0;
  }

  prepare(sql) {
    const db = this;
    return {
      bind(...values) {
        db.boundValues.push(values);
        return {
          async first() {
            if (sql.includes('INSERT INTO formula_ai_daily_usage')) {
              const requestedLimit = Number(values[1]) || FORMULA_AI_DAILY_LIMIT;
              if (db.count >= requestedLimit) return null;
              db.count += 1;
              return { request_count: db.count };
            }
            if (sql.includes('UPDATE formula_ai_daily_usage') && sql.includes('free_count = free_count + 1')) {
              const requestedLimit = Number(values[1]) || FORMULA_AI_DAILY_LIMIT;
              if (db.freeCount >= requestedLimit) return null;
              db.freeCount += 1;
              return { free_count: db.freeCount };
            }
            if (sql.includes('UPDATE formula_ai_credit_balances')) {
              if (db.balance < 1) return null;
              db.balance -= 1;
              return { balance: db.balance };
            }
            return null;
          },
          async run() { return db.run(sql, values); },
        };
      },
      async run() { return db.run(sql, []); },
    };
  }

  async batch(statements) {
    for (const statement of statements) await statement.run();
    return statements.map(() => ({ success: true }));
  }

  async run(sql) {
    if (sql.includes('UPDATE formula_ai_daily_usage')) {
      this.count = Math.max(0, this.count - 1);
      if (sql.includes('free_count = MAX(0, free_count - 1)')) this.freeCount = Math.max(0, this.freeCount - 1);
    }
    if (sql.includes('UPDATE formula_ai_credit_balances') && sql.includes('balance = balance + 1')) {
      this.balance += 1;
      this.purchasedRefunds += 1;
    }
    return { success: true };
  }
}

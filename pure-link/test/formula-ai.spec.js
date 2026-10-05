import { describe, expect, it, vi } from 'vitest';
import { AZURE_OPENAI_FORMULA_AI_PROVIDER } from '../src/formula-provider.js';
import {
  FORMULA_AI_DAILY_LIMIT,
  FORMULA_AI_ADMIN_DAILY_LIMIT,
  extractFormulaResult,
  extractLatex,
  generateFormulaDraft,
  normalizeDescription,
} from '../src/formula-ai.js';

const AZURE_OPENAI = {
  endpoint: 'https://formula-test.openai.azure.com/openai/v1/',
  apiKey: 'unit-test-not-a-secret',
  deployment: 'formula-test-deployment',
};

describe('formula AI', () => {
  it('validates a short natural-language description', () => {
    expect(normalizeDescription('  energy equals mass times light speed squared  ')).toBe('energy equals mass times light speed squared');
    expect(() => normalizeDescription('')).toThrow('請先用一句話');
    expect(() => normalizeDescription({ formula: 'E=mc^2' })).toThrow('請先用一句話');
    expect(() => normalizeDescription('x'.repeat(501))).toThrow('不得超過 500');
  });

  it('extracts the existing exact formula output contract', () => {
    expect(extractLatex({ latex: 'E=mc^2', needs_context: false })).toBe('E=mc^2');
    expect(extractLatex({ latex: '\\frac{a}{b}', needs_context: false })).toBe('\\frac{a}{b}');
  });

  it('extracts only exact normalized formula objects', () => {
    expect(extractLatex({ latex: 'x < y', needs_context: false })).toBe('x < y');
  });

  it('classifies malformed response and rejected LaTeX separately', () => {
    expect(() => extractFormulaResult({ latex: '', needs_context: false })).toThrow(expect.objectContaining({ category: 'invalid_draft' }));
    expect(() => extractFormulaResult({ latex: '<script>alert(1)</script>', needs_context: false })).toThrow(expect.objectContaining({ category: 'invalid_draft' }));
    expect(() => extractFormulaResult({ latex: '\\notACommand{x}', needs_context: false })).toThrow(expect.objectContaining({ category: 'invalid_draft' }));
    expect(() => extractFormulaResult({ latex: '```latex\nx=1\n```', needs_context: false })).toThrow(expect.objectContaining({ category: 'invalid_draft' }));
    expect(() => extractFormulaResult({ latex: '$x=1$', needs_context: false })).toThrow(expect.objectContaining({ category: 'invalid_draft' }));
    expect(() => extractFormulaResult({ latex: 'The equation is x=1', needs_context: false })).toThrow(expect.objectContaining({ category: 'invalid_draft' }));
    expect(() => extractFormulaResult({ latex: 'x=1', needs_context: false, extra: true })).toThrow(expect.objectContaining({ category: 'unexpected_response' }));
  });

  it('attaches the safe validation reason matching each real validator branch', () => {
    expect(() => extractFormulaResult('not an object')).toThrow(expect.objectContaining({ validationReason: 'invalid_result_shape' }));
    expect(() => extractFormulaResult({ latex: 42, needs_context: false })).toThrow(expect.objectContaining({ validationReason: 'missing_required_field' }));
    expect(() => extractFormulaResult({ latex: 'x=1', needs_context: false, extra: true })).toThrow(expect.objectContaining({ validationReason: 'missing_required_field' }));
    expect(() => extractFormulaResult({ latex: 'x=1', needs_context: true })).toThrow(expect.objectContaining({ validationReason: 'needs_context_with_nonempty_latex' }));
    expect(() => extractFormulaResult({ latex: '   ', needs_context: false })).toThrow(expect.objectContaining({ validationReason: 'empty_latex' }));
    expect(() => extractFormulaResult({ latex: `x=${'1'.repeat(2000)}`, needs_context: false })).toThrow(expect.objectContaining({ validationReason: 'latex_too_long' }));
    expect(() => extractFormulaResult({ latex: '<b>x=1</b>', needs_context: false })).toThrow(expect.objectContaining({ validationReason: 'invalid_latex' }));
    expect(() => extractFormulaResult({ latex: '```x=1```', needs_context: false })).toThrow(expect.objectContaining({ validationReason: 'invalid_latex' }));
    expect(() => extractFormulaResult({ latex: '$x=1$', needs_context: false })).toThrow(expect.objectContaining({ validationReason: 'invalid_latex' }));
    expect(() => extractFormulaResult({ latex: 'The governing equation is x=1', needs_context: false })).toThrow(expect.objectContaining({ validationReason: 'prose_in_latex' }));
    expect(() => extractFormulaResult({ latex: '\\notACommand{x}', needs_context: false })).toThrow(expect.objectContaining({ validationReason: 'unsupported_expression' }));
  });

  it('keeps valid drafts and the needs_context result behavior unchanged', () => {
    expect(extractLatex({ latex: 'E=mc^2', needs_context: false })).toBe('E=mc^2');
    expect(extractFormulaResult({ latex: '', needs_context: true })).toEqual({ latex: '', ambiguity: 'needs_context' });
    // Valid drafts never carry a validation reason.
    const valid = extractFormulaResult({ latex: 'E=mc^2', needs_context: false });
    expect(valid).toEqual({ latex: 'E=mc^2' });
  });

  it('returns an explicit localized-context path instead of an invented equation', () => {
    expect(extractFormulaResult({ latex: '', needs_context: true })).toEqual({ latex: '', ambiguity: 'needs_context' });
    expect(() => extractFormulaResult({ latex: 'x=1', needs_context: true }))
      .toThrow(expect.objectContaining({ category: 'invalid_draft' }));
  });

  it('gives an administrator a capped 100-attempt allowance', async () => {
    const db = new UsageDb();
    const inferenceProvider = mockInference({ latex: 'x<y', needs_context: false });
    const result = await generateFormulaDraft({
      description: 'x is less than y',
      userId: 'admin-1',
      db,
      azureOpenAI: AZURE_OPENAI,
      inferenceProvider,
      dailyLimit: FORMULA_AI_ADMIN_DAILY_LIMIT,
    });
    expect(result).toMatchObject({ latex: 'x<y', limit: 100, remaining: 99, model: AZURE_OPENAI.deployment });
  });

  it('uses the configured Azure deployment without storing the prompt or result in D1', async () => {
    const db = new UsageDb();
    const inferenceProvider = mockInference({ latex: '\\nabla^2\\psi=0', needs_context: false });

    const result = await generateFormulaDraft({
      description: 'the Laplace equation for psi',
      userId: 'user-1',
      db,
      azureOpenAI: AZURE_OPENAI,
      inferenceProvider,
    });

    expect(result).toMatchObject({ latex: '\\nabla^2\\psi=0', remaining: 4, provider: AZURE_OPENAI_FORMULA_AI_PROVIDER, model: AZURE_OPENAI.deployment });
    expect(inferenceProvider).toHaveBeenCalledWith(expect.objectContaining({
      ...AZURE_OPENAI,
      description: 'the Laplace equation for psi',
      image: null,
    }));
    expect(db.boundValues.flat()).not.toContain('the Laplace equation for psi');
    expect(db.boundValues.flat()).not.toContain('\\nabla^2\\psi=0');
  });

  it('does not expose provider-only metadata', async () => {
    const db = new UsageDb();
    const inferenceProvider = vi.fn().mockResolvedValue({
      output: { latex: 'E=mc^2', needs_context: false },
      provider: AZURE_OPENAI_FORMULA_AI_PROVIDER,
      model: AZURE_OPENAI.deployment,
      reasoning: 'provider-only internal field',
    });
    const result = await generateFormulaDraft({ description: 'mass energy equivalence', userId: 'user-1', db, azureOpenAI: AZURE_OPENAI, inferenceProvider });
    expect(result).toMatchObject({ latex: 'E=mc^2', provider: AZURE_OPENAI_FORMULA_AI_PROVIDER, model: AZURE_OPENAI.deployment });
    expect(result).not.toHaveProperty('reasoning');
  });

  it('keeps Traditional Chinese text and optional image context ephemeral', async () => {
    const db = new UsageDb();
    const inferenceProvider = mockInference({ latex: '\\partial_t u=\\alpha\\partial_x^2u', needs_context: false });
    const image = { mimeType: 'image/png', bytes: new Uint8Array([1, 2, 3]) };

    await generateFormulaDraft({ description: '一維無熱源熱傳導方程', image, userId: 'user-1', db, azureOpenAI: AZURE_OPENAI, inferenceProvider });
    expect(inferenceProvider).toHaveBeenCalledWith(expect.objectContaining({
      description: '一維無熱源熱傳導方程', image, deployment: AZURE_OPENAI.deployment,
    }));
    expect(db.boundValues.flat()).not.toContain('一維無熱源熱傳導方程');
    expect(db.boundValues.flat()).not.toContain('data:image/png;base64,AQID');
  });

  it('rejects an invalid image before allowance consumption', async () => {
    const db = new UsageDb();
    const inferenceProvider = vi.fn();
    await expect(generateFormulaDraft({
      description: 'continuity equation', image: { mimeType: 'image/gif', bytes: new Uint8Array([1]) }, userId: 'user-1', db,
      azureOpenAI: AZURE_OPENAI, inferenceProvider,
    })).rejects.toMatchObject({ field: 'image' });
    expect(db.count).toBe(0);
    expect(inferenceProvider).not.toHaveBeenCalled();
  });

  it('restores daily allowance when it safely asks for more context', async () => {
    const db = new UsageDb();
    const inferenceProvider = mockInference({ latex: '', needs_context: true });
    await expect(generateFormulaDraft({
      description: 'governing equation', userId: 'user-1', db, azureOpenAI: AZURE_OPENAI, inferenceProvider,
      errorMessages: { formulaNeedContext: 'Please add more context.' },
    })).rejects.toMatchObject({ category: 'needs_context', status: 422, message: 'Please add more context.' });
    expect(db.count).toBe(0);
    expect(db.freeCount).toBe(0);
  });

  it('offers five free generations before requiring purchased credits', async () => {
    const db = new UsageDb();
    const inferenceProvider = mockInference({ latex: 'x=1', needs_context: false });
    for (let count = 0; count < FORMULA_AI_DAILY_LIMIT; count += 1) {
      await generateFormulaDraft({ description: 'x equals one', userId: 'user-1', db, azureOpenAI: AZURE_OPENAI, inferenceProvider });
    }

    await expect(generateFormulaDraft({ description: 'one more', userId: 'user-1', db, azureOpenAI: AZURE_OPENAI, inferenceProvider }))
      .rejects.toMatchObject({ status: 402 });
    expect(inferenceProvider).toHaveBeenCalledTimes(FORMULA_AI_DAILY_LIMIT);
  });

  it('uses a purchased credit after the five daily free generations', async () => {
    const db = new UsageDb(2);
    const inferenceProvider = mockInference({ latex: 'x=1', needs_context: false });
    for (let count = 0; count < FORMULA_AI_DAILY_LIMIT; count += 1) {
      await generateFormulaDraft({ description: 'x equals one', userId: 'user-1', db, azureOpenAI: AZURE_OPENAI, inferenceProvider });
    }
    const result = await generateFormulaDraft({ description: 'one more', userId: 'user-1', db, azureOpenAI: AZURE_OPENAI, inferenceProvider });
    expect(result).toMatchObject({ allowanceSource: 'purchased', remaining: 1 });
  });

  it('restores free daily allowance when inference fails without exposing provider details', async () => {
    const db = new UsageDb();
    const inferenceProvider = vi.fn().mockRejectedValue(new Error('secret provider response'));

    await expect(generateFormulaDraft({ description: 'x equals one', userId: 'user-1', db, azureOpenAI: AZURE_OPENAI, inferenceProvider }))
      .rejects.toMatchObject({ category: 'provider_failure', message: expect.not.stringContaining('secret provider response') });
    expect(db.count).toBe(0);
    expect(db.boundValues.flat()).toContain('2026-09-28');

    inferenceProvider.mockImplementation(mockInference({ latex: 'x=1', needs_context: false }));
    for (let count = 0; count < FORMULA_AI_DAILY_LIMIT; count += 1) {
      await generateFormulaDraft({ description: 'x equals one', userId: 'user-1', db, azureOpenAI: AZURE_OPENAI, inferenceProvider });
    }
    await expect(generateFormulaDraft({ description: 'one more', userId: 'user-1', db, azureOpenAI: AZURE_OPENAI, inferenceProvider }))
      .rejects.toMatchObject({ status: 402 });
    expect(db.count).toBe(FORMULA_AI_DAILY_LIMIT);
  });

  it('restores the administrator free counter on timeout', async () => {
    const db = new UsageDb();
    const inferenceProvider = vi.fn().mockRejectedValue(new DOMException('timed out', 'AbortError'));
    await expect(generateFormulaDraft({
      description: 'wave equation', userId: 'admin-1', db, azureOpenAI: AZURE_OPENAI, inferenceProvider,
      dailyLimit: FORMULA_AI_ADMIN_DAILY_LIMIT,
    })).rejects.toMatchObject({ category: 'provider_failure' });
    expect(db.count).toBe(0);
    expect(db.freeCount).toBe(0);
    expect(db.balance).toBe(0);
  });

  it('restores free allowance for malformed and rejected model responses', async () => {
    const db = new UsageDb();
    const inferenceProvider = vi.fn().mockResolvedValue({ output: 'not JSON', provider: AZURE_OPENAI_FORMULA_AI_PROVIDER, model: AZURE_OPENAI.deployment });

    await expect(generateFormulaDraft({ description: 'x equals one', userId: 'user-1', db, azureOpenAI: AZURE_OPENAI, inferenceProvider }))
      .rejects.toMatchObject({ category: 'unexpected_response' });
    expect(db.count).toBe(0);

    inferenceProvider.mockResolvedValue({ output: { latex: '', needs_context: false }, provider: AZURE_OPENAI_FORMULA_AI_PROVIDER, model: AZURE_OPENAI.deployment });
    await expect(generateFormulaDraft({ description: 'x equals one', userId: 'user-1', db, azureOpenAI: AZURE_OPENAI, inferenceProvider }))
      .rejects.toMatchObject({ category: 'invalid_draft' });
    expect(db.count).toBe(0);

    inferenceProvider.mockResolvedValue({ output: { latex: '<script>bad</script>', needs_context: false }, provider: AZURE_OPENAI_FORMULA_AI_PROVIDER, model: AZURE_OPENAI.deployment });
    await expect(generateFormulaDraft({ description: 'x equals one', userId: 'user-1', db, azureOpenAI: AZURE_OPENAI, inferenceProvider }))
      .rejects.toMatchObject({ category: 'invalid_draft' });
    expect(db.count).toBe(0);
  });

  it('logs a sanitized validation reason without any formula or prompt contents', async () => {
    const db = new UsageDb();
    const inferenceProvider = vi.fn().mockResolvedValue({
      output: { latex: '  \\notACommand{SECRET_MARKER}  ', needs_context: false },
      provider: AZURE_OPENAI_FORMULA_AI_PROVIDER,
      model: AZURE_OPENAI.deployment,
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await expect(generateFormulaDraft({ description: 'mass energy equivalence', userId: 'user-1', db, azureOpenAI: AZURE_OPENAI, inferenceProvider }))
        .rejects.toMatchObject({ category: 'invalid_draft', message: 'AI did not return a valid editable LaTeX formula. Your allowance was restored; please try a different description.' });
      expect(db.count).toBe(0);
      const events = logSpy.mock.calls.map((call) => call[0])
        .filter((line) => line.startsWith('[formula-ai-debug] '))
        .map((line) => JSON.parse(line.slice('[formula-ai-debug] '.length)));
      expect(events).toContainEqual({
        stage: 'mapped_failure',
        validationReason: 'unsupported_expression',
        category: 'invalid_draft',
        needsContext: false,
        latexPresent: true,
        latexLength: 27,
        errorName: 'FormulaAiError',
        elapsedMs: expect.any(Number),
      });
      const rendered = logSpy.mock.calls.map((call) => call[0]).join('\n');
      expect(rendered).not.toContain('SECRET_MARKER');
      expect(rendered).not.toContain('notACommand');
      expect(rendered).not.toContain('mass energy equivalence');
    } finally {
      logSpy.mockRestore();
    }
  });

  it('restores a purchased credit and daily count once when purchased generation fails', async () => {
    const db = new UsageDb(2);
    const success = mockInference({ latex: 'x=1', needs_context: false });
    for (let count = 0; count < FORMULA_AI_DAILY_LIMIT; count += 1) {
      await generateFormulaDraft({ description: 'x equals one', userId: 'user-1', db, azureOpenAI: AZURE_OPENAI, inferenceProvider: success });
    }

    const failure = vi.fn().mockRejectedValue(new Error('provider failure'));
    await expect(generateFormulaDraft({ description: 'one more', userId: 'user-1', db, azureOpenAI: AZURE_OPENAI, inferenceProvider: failure }))
      .rejects.toMatchObject({ category: 'provider_failure' });
    expect(db.count).toBe(FORMULA_AI_DAILY_LIMIT);
    expect(db.balance).toBe(2);
    expect(db.purchasedRefunds).toBe(1);

    const result = await generateFormulaDraft({ description: 'one more', userId: 'user-1', db, azureOpenAI: AZURE_OPENAI, inferenceProvider: success });
    expect(result).toMatchObject({ allowanceSource: 'purchased', remaining: 1 });
    expect(db.balance).toBe(1);
  });

  it('restores the free bucket when an earlier free request fails after a paid request starts', async () => {
    const db = new UsageDb(2);
    let rejectPending;
    let signalEntered;
    const entered = new Promise((resolve) => { signalEntered = resolve; });
    const pendingProvider = vi.fn(() => new Promise((_, reject) => {
        rejectPending = reject;
        signalEntered();
      }));
    const pending = generateFormulaDraft({ description: 'first formula', userId: 'user-1', db, azureOpenAI: AZURE_OPENAI, inferenceProvider: pendingProvider });
    await entered;

    const success = mockInference({ latex: 'x=1', needs_context: false });
    for (let count = 1; count < FORMULA_AI_DAILY_LIMIT; count += 1) {
      await generateFormulaDraft({ description: 'another formula', userId: 'user-1', db, azureOpenAI: AZURE_OPENAI, inferenceProvider: success });
    }
    const purchased = await generateFormulaDraft({ description: 'paid formula', userId: 'user-1', db, azureOpenAI: AZURE_OPENAI, inferenceProvider: success });
    expect(purchased.allowanceSource).toBe('purchased');

    rejectPending(new Error('provider failure'));
    await expect(pending).rejects.toMatchObject({ category: 'provider_failure' });
    const restored = await generateFormulaDraft({ description: 'restored free formula', userId: 'user-1', db, azureOpenAI: AZURE_OPENAI, inferenceProvider: success });
    expect(restored.allowanceSource).toBe('free');
    expect(db.freeCount).toBe(FORMULA_AI_DAILY_LIMIT);
    expect(db.balance).toBe(1);
  });

  it('fails closed before consuming quota when Azure configuration is absent', async () => {
    const db = new UsageDb();
    const inferenceProvider = vi.fn();
    await expect(generateFormulaDraft({ description: 'x equals one', userId: 'user-1', db, inferenceProvider }))
      .rejects.toMatchObject({ status: 503 });
    expect(db.count).toBe(0);
    expect(inferenceProvider).not.toHaveBeenCalled();
  });
});

function mockInference(output) {
  return vi.fn(async ({ deployment }) => ({
    output,
    provider: AZURE_OPENAI_FORMULA_AI_PROVIDER,
    model: deployment,
  }));
}

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
              return { request_count: db.count, usage_date: '2026-09-28' };
            }
            if (sql.includes('UPDATE formula_ai_daily_usage') && sql.includes('free_count = free_count + 1')) {
              const requestedLimit = Number(values[2]) || FORMULA_AI_DAILY_LIMIT;
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

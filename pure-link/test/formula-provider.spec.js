import { describe, expect, it, vi } from 'vitest';
import {
  AZURE_OPENAI_FORMULA_AI_PROVIDER,
  FORMULA_OUTPUT_SCHEMA,
  FORMULA_SYSTEM_PROMPT,
  FormulaProviderRequestError,
  FormulaProviderResponseError,
  IMAGE_CONTEXT_INSTRUCTION,
  runAzureOpenAIFormulaProvider,
  unwrapAzureResponsesOutput,
} from '../src/formula-provider.js';

const CONFIG = {
  endpoint: 'https://formula-test.openai.azure.com/openai/v1/',
  apiKey: 'unit-test-not-a-secret',
  deployment: 'formula-test-deployment',
};
const DRAFT = '{"latex":"E=mc^2","needs_context":false}';

function responsesBody(text) {
  return {
    id: 'resp_unit',
    object: 'response',
    status: 'completed',
    model: CONFIG.deployment,
    output: [{
      type: 'message',
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text, annotations: [] }],
    }],
    usage: { input_tokens: 10, output_tokens: 8, total_tokens: 18 },
  };
}

function respond(text, { status = 200 } = {}) {
  return vi.fn(async () => new Response(JSON.stringify(responsesBody(text)), { status, headers: { 'content-type': 'application/json' } }));
}

describe('FORMULA_SYSTEM_PROMPT contract', () => {
  it('asks for needs_context instead of forcing one formula on ambiguous input', () => {
    expect(FORMULA_SYSTEM_PROMPT).toMatch(/needs_context true/i);
    expect(FORMULA_SYSTEM_PROMPT).toMatch(/no single formula is well determined/i);
    expect(FORMULA_SYSTEM_PROMPT).toMatch(/needs_context false only when/i);
  });

  it('forbids forcing a single equation onto systems needing coupled equations', () => {
    expect(FORMULA_SYSTEM_PROMPT).toMatch(/never force a single canonical equation/i);
    expect(FORMULA_SYSTEM_PROMPT).toMatch(/coupled equations/i);
    expect(FORMULA_SYSTEM_PROMPT).toMatch(/state variables/i);
  });

  it('requires preserving the topology and state variables shown in diagrams', () => {
    expect(FORMULA_SYSTEM_PROMPT).toMatch(/structural evidence/i);
    expect(FORMULA_SYSTEM_PROMPT).toMatch(/topology/i);
    expect(FORMULA_SYSTEM_PROMPT).toMatch(/keep the structure, components, and state variables shown/i);
  });

  it('forbids inventing equivalent reductions, components, constitutive laws, or assumptions', () => {
    expect(FORMULA_SYSTEM_PROMPT).toMatch(/never invent equivalent components/i);
    expect(FORMULA_SYSTEM_PROMPT).toMatch(/state reductions/i);
    expect(FORMULA_SYSTEM_PROMPT).toMatch(/do not invent its law/i);
    expect(FORMULA_SYSTEM_PROMPT).toMatch(/constitutive relation is missing/i);
  });

  it('keeps the established strengths of the prompt', () => {
    expect(FORMULA_SYSTEM_PROMPT).toMatch(/mathematically correct expression first/i);
    expect(FORMULA_SYSTEM_PROMPT).toMatch(/valid LaTeX/i);
    expect(FORMULA_SYSTEM_PROMPT).toMatch(/no reasoning or prose in latex/i);
    expect(FORMULA_SYSTEM_PROMPT).toMatch(/Return only the required JSON object/i);
  });

  it('still directs well-specified requests to produce one formula', () => {
    expect(FORMULA_SYSTEM_PROMPT).toMatch(/one appropriate formula follows from the description and image exactly as given/i);
  });

  it('treats reference images as structural evidence, not decoration', () => {
    expect(IMAGE_CONTEXT_INSTRUCTION).toMatch(/structural evidence/i);
    expect(IMAGE_CONTEXT_INSTRUCTION).toMatch(/do not replace several visible elements with an equivalent simplified system/i);
  });
});

describe('runAzureOpenAIFormulaProvider', () => {
  it('posts to the v1-compatible Responses endpoint with the deployment as model', async () => {
    const fetchImpl = respond(DRAFT);
    const result = await runAzureOpenAIFormulaProvider({ ...CONFIG, description: 'E equals mc squared', fetchImplementation: fetchImpl });

    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://formula-test.openai.azure.com/openai/v1/responses');
    expect(options.method).toBe('POST');
    expect(options.headers['api-key']).toBe(CONFIG.apiKey);
    expect(options.headers['content-type']).toBe('application/json');
    const body = JSON.parse(options.body);
    expect(body.model).toBe(CONFIG.deployment);
    expect(body.max_output_tokens).toBe(256);
    expect(body.store).toBe(false);
    expect(body).not.toHaveProperty('temperature');
    expect(body.input[0]).toEqual({ type: 'message', role: 'system', content: FORMULA_SYSTEM_PROMPT });
    expect(body.input[1]).toEqual({ type: 'message', role: 'user', content: 'E equals mc squared' });
    expect(body.text.format).toEqual({
      type: 'json_schema',
      name: 'formula_draft',
      strict: true,
      schema: { ...FORMULA_OUTPUT_SCHEMA },
    });

    expect(result).toStrictEqual({
      output: { latex: 'E=mc^2', needs_context: false },
      provider: AZURE_OPENAI_FORMULA_AI_PROVIDER,
      model: CONFIG.deployment,
    });
  });

  it('accepts a bare resource endpoint and derives the v1 path', async () => {
    const fetchImpl = respond(DRAFT);
    await runAzureOpenAIFormulaProvider({ ...CONFIG, endpoint: 'https://formula-test.openai.azure.com', description: 'x', fetchImplementation: fetchImpl });
    expect(fetchImpl.mock.calls[0][0]).toBe('https://formula-test.openai.azure.com/openai/v1/responses');
  });

  it('sends image context as an ephemeral data-URL input_image part', async () => {
    const fetchImpl = respond(DRAFT);
    await runAzureOpenAIFormulaProvider({
      ...CONFIG,
      description: '一維無熱源熱傳導方程',
      image: { mimeType: 'image/png', bytes: new Uint8Array([1, 2, 3]) },
      fetchImplementation: fetchImpl,
    });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.input[1].type).toBe('message');
    expect(body.input[1].role).toBe('user');
    const userContent = body.input[1].content;
    expect(userContent[0].type).toBe('input_text');
    expect(userContent[0].text).toContain('一維無熱源熱傳導方程');
    expect(userContent[0].text).toContain(IMAGE_CONTEXT_INSTRUCTION);
    expect(userContent[1]).toEqual({ type: 'input_image', image_url: 'data:image/png;base64,AQID', detail: 'high' });
  });

  it('rejects empty provider output as an unsupported response', async () => {
    const fetchImpl = respond('');
    await expect(runAzureOpenAIFormulaProvider({ ...CONFIG, description: 'x', fetchImplementation: fetchImpl }))
      .rejects.toBeInstanceOf(FormulaProviderResponseError);
  });

  it('rejects malformed structured output instead of guessing', async () => {
    const fetchImpl = respond('```latex\nE=mc^2\n```');
    await expect(runAzureOpenAIFormulaProvider({ ...CONFIG, description: 'x', fetchImplementation: fetchImpl }))
      .rejects.toBeInstanceOf(FormulaProviderResponseError);
  });

  it('rejects a non-JSON HTTP body as an unsupported response', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>gateway</html>', { status: 200, headers: { 'content-type': 'text/html' } }));
    await expect(runAzureOpenAIFormulaProvider({ ...CONFIG, description: 'x', fetchImplementation: fetchImpl }))
      .rejects.toBeInstanceOf(FormulaProviderResponseError);
  });

  it('maps provider HTTP error statuses to safe non-leaking categories', async () => {
    const cases = [
      [400, 'provider_rejected'],
      [401, 'authentication'],
      [403, 'authentication'],
      [404, 'deployment_not_found'],
      [429, 'rate_limited'],
      [500, 'provider_unavailable'],
      [503, 'provider_unavailable'],
    ];
    for (const [status, category] of cases) {
      const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: { message: `detail-${status}` } }), { status, headers: { 'content-type': 'application/json' } }));
      const error = await runAzureOpenAIFormulaProvider({ ...CONFIG, description: 'x', fetchImplementation: fetchImpl }).catch((thrown) => thrown);
      expect(error).toBeInstanceOf(FormulaProviderRequestError);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('FormulaProviderRequestError');
      expect(error.category).toBe(category);
      expect(error.status).toBe(status);
      expect(error.message).not.toContain(`detail-${status}`);
    }
  });

  it('classifies network failures and request timeouts separately', async () => {
    const networkFailure = vi.fn(async () => { throw new TypeError('fetch failed'); });
    await expect(runAzureOpenAIFormulaProvider({ ...CONFIG, description: 'x', fetchImplementation: networkFailure }))
      .rejects.toMatchObject({ name: 'FormulaProviderRequestError', category: 'network_error' });

    const hanging = (url, { signal }) => new Promise((_, reject) => {
      signal?.addEventListener('abort', () => reject(new DOMException('This operation was aborted', 'AbortError')));
    });
    await expect(runAzureOpenAIFormulaProvider({ ...CONFIG, description: 'x', fetchImplementation: hanging, timeoutMs: 10 }))
      .rejects.toMatchObject({ name: 'FormulaProviderRequestError', category: 'timeout' });
  });

  it('rejects incomplete or insecure endpoint configuration', async () => {
    await expect(runAzureOpenAIFormulaProvider({ ...CONFIG, endpoint: ' http://formula-test.openai.azure.com ', description: 'x', fetchImplementation: respond(DRAFT) }))
      .rejects.toBeInstanceOf(TypeError);
    await expect(runAzureOpenAIFormulaProvider({ ...CONFIG, endpoint: ' https://formula-test.openai.azure.com/?api-version=v1#frag ', description: 'x', fetchImplementation: respond(DRAFT) }))
      .rejects.toBeInstanceOf(TypeError);
    await expect(runAzureOpenAIFormulaProvider({ ...CONFIG, endpoint: ' https://formula-test.services.ai.azure.com/api/projects/purelink-formula/other ', description: 'x', fetchImplementation: respond(DRAFT) }))
      .rejects.toBeInstanceOf(TypeError);
    await expect(runAzureOpenAIFormulaProvider({ ...CONFIG, apiKey: ' ', description: 'x', fetchImplementation: respond(DRAFT) }))
      .rejects.toThrow('Azure OpenAI configuration is incomplete.');
    await expect(runAzureOpenAIFormulaProvider({ ...CONFIG, deployment: undefined, description: 'x', fetchImplementation: respond(DRAFT) }))
      .rejects.toThrow('Azure OpenAI configuration is incomplete.');
  });

  it('builds the Responses URL for both Azure OpenAI and Foundry Project endpoints', async () => {
    const cases = [
      ['https://formula-test.openai.azure.com', 'https://formula-test.openai.azure.com/openai/v1/responses'],
      ['https://formula-test.openai.azure.com/', 'https://formula-test.openai.azure.com/openai/v1/responses'],
      ['https://formula-test.openai.azure.com/openai/v1', 'https://formula-test.openai.azure.com/openai/v1/responses'],
      ['https://formula-test.openai.azure.com/openai/v1/', 'https://formula-test.openai.azure.com/openai/v1/responses'],
      ['https://formula-test.services.ai.azure.com/api/projects/purelink-formula', 'https://formula-test.services.ai.azure.com/api/projects/purelink-formula/openai/v1/responses'],
      ['https://formula-test.services.ai.azure.com/api/projects/purelink-formula/', 'https://formula-test.services.ai.azure.com/api/projects/purelink-formula/openai/v1/responses'],
      ['https://formula-test.services.ai.azure.com/api/projects/purelink-formula/openai/v1', 'https://formula-test.services.ai.azure.com/api/projects/purelink-formula/openai/v1/responses'],
    ];
    for (const [endpoint, expected] of cases) {
      const fetchImpl = vi.fn(async () => new Response(JSON.stringify(responsesBody(DRAFT)), { status: 200, headers: { 'content-type': 'application/json' } }));
      await runAzureOpenAIFormulaProvider({ ...CONFIG, endpoint, description: 'x', fetchImplementation: fetchImpl });
      expect(fetchImpl.mock.calls[0][0], endpoint).toBe(expected);
    }
  });
});

describe('unwrapAzureResponsesOutput', () => {
  it('parses the assistant output_text as the formula JSON', () => {
    expect(unwrapAzureResponsesOutput(responsesBody(DRAFT))).toEqual({ latex: 'E=mc^2', needs_context: false });
  });

  it('joins output text across assistant items and ignores non-text parts', () => {
    const envelope = responsesBody('');
    envelope.output = [
      { type: 'reasoning', summary: [] },
      { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '{"latex":' }] },
      { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '"E=mc^2","needs_context":false}' }] },
    ];
    expect(unwrapAzureResponsesOutput(envelope)).toEqual({ latex: 'E=mc^2', needs_context: false });
  });

  it('throws for unsupported envelopes and unusable outputs', () => {
    expect(() => unwrapAzureResponsesOutput(null)).toThrow();
    expect(() => unwrapAzureResponsesOutput({ output: 'not an array' })).toThrow();
    expect(() => unwrapAzureResponsesOutput({ output: [{ type: 'reasoning' }] })).toThrow();
    expect(() => unwrapAzureResponsesOutput(responsesBody('plain prose'))).toThrow();
    expect(() => unwrapAzureResponsesOutput(responsesBody('[1,2,3]'))).toThrow();
  });
});

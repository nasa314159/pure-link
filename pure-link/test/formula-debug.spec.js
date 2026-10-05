import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AZURE_OPENAI_FORMULA_AI_PROVIDER,
  runAzureOpenAIFormulaProvider,
} from '../src/formula-provider.js';
import {
  debugErrorCategory,
  debugErrorName,
  debugErrorStatus,
  debugImageMime,
  debugIncompleteReason,
  debugResponseStatus,
  logFormulaAiDebug,
} from '../src/formula-debug.js';

const DEBUG_PREFIX = '[formula-ai-debug] ';
const CONFIG = {
  endpoint: 'https://formula-test.openai.azure.com/openai/v1/',
  apiKey: 'unit-test-not-a-secret',
  deployment: 'formula-test-deployment',
  imageDeployment: 'formula-test-image-deployment',
};
const DESCRIPTION = 'equivalence of mass and energy';
const IMAGE = { mimeType: 'image/png', bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]) };

function responsesBody(text = '{"latex":"E=mc^2","needs_context":false}') {
  return {
    id: 'resp_unit',
    object: 'response',
    status: 'completed',
    output: [{
      type: 'message', role: 'assistant', status: 'completed',
      content: [{ type: 'output_text', text, annotations: [] }],
    }],
  };
}

function emittedLines(log) {
  return log.mock.calls.map((call) => call[0]).filter((line) => line.startsWith(DEBUG_PREFIX))
    .map((line) => JSON.parse(line.slice(DEBUG_PREFIX.length)));
}

describe('formula debug diagnostics', () => {
  afterEach(() => vi.restoreAllMocks());

  it('emits one compact prefixed JSON line per stage', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    logFormulaAiDebug('provider_request', { hasImage: true, imageMime: 'image/png', imageBytes: 18342 });
    expect(log).toHaveBeenCalledTimes(1);
    const line = log.mock.calls[0][0];
    expect(line.startsWith(DEBUG_PREFIX)).toBe(true);
    expect(line).not.toContain('\n');
    expect(JSON.parse(line.slice(DEBUG_PREFIX.length))).toEqual({
      stage: 'provider_request', hasImage: true, imageMime: 'image/png', imageBytes: 18342,
    });
  });

  it('whitelists error names, categories, statuses, and response metadata', () => {
    expect(debugErrorName(new FormulaLike('FormulaProviderRequestError'))).toBe('FormulaProviderRequestError');
    expect(debugErrorName({ name: 'SneakyExfiltration' })).toBeNull();
    expect(debugErrorName(undefined)).toBeNull();
    expect(debugErrorCategory({ category: 'provider_rejected' })).toBe('provider_rejected');
    expect(debugErrorCategory({ category: 'internal provider detail' })).toBeNull();
    expect(debugErrorStatus({ status: 400 })).toBe(400);
    expect(debugErrorStatus({ status: '500' })).toBeNull();
    expect(debugImageMime('image/png')).toBe('image/png');
    expect(debugImageMime('text/html')).toBeNull();
    expect(debugImageMime('image/png;x-leak')).toBeNull();
    expect(debugResponseStatus({ status: 'completed' })).toBe('completed');
    expect(debugResponseStatus({ status: 'another reasoning trace' })).toBeNull();
    expect(debugResponseStatus([])).toBeNull();
    expect(debugIncompleteReason({ incomplete_details: { reason: 'max_output_tokens' } })).toBe('max_output_tokens');
    expect(debugIncompleteReason({ incomplete_details: { reason: 'anything else' } })).toBeNull();
    expect(debugIncompleteReason({})).toBeNull();
  });

  it('logs image routing on the provider request stage without prompt or payload data', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(responsesBody()), { status: 200 }));
    const result = await runAzureOpenAIFormulaProvider({ ...CONFIG, description: DESCRIPTION, image: IMAGE, fetchImplementation: fetchMock });
    expect(result).toMatchObject({ provider: AZURE_OPENAI_FORMULA_AI_PROVIDER, model: CONFIG.imageDeployment });
    const events = emittedLines(log);
    expect(events).toEqual([{
      stage: 'provider_request',
      hasImage: true,
      imageMime: 'image/png',
      imageBytes: IMAGE.bytes.byteLength,
      routedDeployment: CONFIG.imageDeployment,
      imageRouting: true,
      imageDeploymentConfigured: true,
      endpointPath: '/openai/v1/responses',
    }]);
  });

  it('logs sanitized HTTP provider errors without response body details', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ message: 'internal provider detail' }), { status: 400 }));
    await expect(runAzureOpenAIFormulaProvider({ ...CONFIG, description: DESCRIPTION, image: IMAGE, fetchImplementation: fetchMock }))
      .rejects.toMatchObject({ name: 'FormulaProviderRequestError', category: 'provider_rejected', status: 400 });
    const events = emittedLines(log);
    expect(events).toEqual([
      expect.objectContaining({ stage: 'provider_request', routedDeployment: CONFIG.imageDeployment, imageRouting: true }),
      expect.objectContaining({ stage: 'provider_error', status: 400, category: 'provider_rejected', errorName: 'FormulaProviderRequestError' }),
    ]);
    const rendered = log.mock.calls.map((call) => call[0]).join('\n');
    expect(rendered).not.toContain('internal provider detail');
    expect(rendered).not.toContain(CONFIG.apiKey);
    expect(rendered).not.toContain(DESCRIPTION);
  });

  it('flags HTTP 200 responses that yield no usable structured output', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [{ type: 'reasoning' }],
    }), { status: 200 }));
    await expect(runAzureOpenAIFormulaProvider({ ...CONFIG, description: DESCRIPTION, image: IMAGE, fetchImplementation: fetchMock }))
      .rejects.toMatchObject({ name: 'FormulaProviderResponseError' });
    const events = emittedLines(log);
    expect(events[1]).toEqual({
      stage: 'provider_parse_error',
      status: 200,
      responseStatus: 'incomplete',
      incompleteReason: 'max_output_tokens',
      structuredOutput: false,
      errorName: 'FormulaProviderResponseError',
      elapsedMs: expect.any(Number),
    });
  });

  it('logs transport errors as timeout or network_error without a URL or key', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetchMock = vi.fn(async () => { throw new DOMException('timed out', 'AbortError'); });
    await expect(runAzureOpenAIFormulaProvider({ ...CONFIG, description: DESCRIPTION, image: IMAGE, fetchImplementation: fetchMock }))
      .rejects.toMatchObject({ category: 'timeout' });
    const events = emittedLines(log);
    expect(events[1]).toEqual({
      stage: 'provider_error', status: null, category: 'timeout', errorName: 'FormulaProviderRequestError',
      elapsedMs: expect.any(Number),
    });
    const rendered = log.mock.calls.map((call) => call[0]).join('\n');
    expect(rendered).not.toContain(CONFIG.endpoint);
    expect(rendered).not.toContain(CONFIG.apiKey);
  });
});

class FormulaLike extends Error {
  constructor(name) {
    super(name);
    this.name = name;
  }
}

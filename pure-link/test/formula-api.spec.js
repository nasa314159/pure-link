import { deflateSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { AZURE_OPENAI_FORMULA_AI_PROVIDER, FORMULA_OUTPUT_SCHEMA, FORMULA_SYSTEM_PROMPT } from '../src/formula-provider.js';
import { hashManagementToken } from '../src/security.js';

const SESSION = 'formula-api-test-session';
const AZURE_ENV = {
  AZURE_OPENAI_ENDPOINT: 'https://formulaapi.test.openai.azure.com/openai/v1/',
  AZURE_OPENAI_API_KEY: 'unit-test-not-a-secret',
  AZURE_OPENAI_DEPLOYMENT: 'formula-test-deployment',
};
const DRAFT = { latex: '\\mathbf{F}=q(\\mathbf{E}+\\mathbf{v}\\times\\mathbf{B})', needs_context: false };

describe('formula generation API image and privacy path', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends the preserved prompt and contract to the Azure v1 Responses endpoint', async () => {
    const { env, db } = await setupAzure();
    const fetchMock = stubAzureResponse();

    for (const [locale, description] of [['en', 'Lorentz force'], ['zh-Hant', '洛倫茲力']]) {
      const response = await submitJson(env, { description }, locale);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        latex: DRAFT.latex,
        provider: AZURE_OPENAI_FORMULA_AI_PROVIDER,
        model: AZURE_ENV.AZURE_OPENAI_DEPLOYMENT,
        allowanceSource: 'free',
      });
    }

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://formulaapi.test.openai.azure.com/openai/v1/responses');
    expect(options.method).toBe('POST');
    expect(options.headers['api-key']).toBe(AZURE_ENV.AZURE_OPENAI_API_KEY);
    expect(options.headers['content-type']).toBe('application/json');
    const body = JSON.parse(options.body);
    expect(body.model).toBe(AZURE_ENV.AZURE_OPENAI_DEPLOYMENT);
    expect(body.max_output_tokens).toBe(256);
    expect(body.store).toBe(false);
    expect(body).not.toHaveProperty('temperature');
    expect(body.input[0]).toEqual({ type: 'message', role: 'system', content: FORMULA_SYSTEM_PROMPT });
    expect(body.input[1]).toEqual({ type: 'message', role: 'user', content: 'Lorentz force' });
    expect(body.text.format).toEqual({ type: 'json_schema', name: 'formula_draft', strict: true, schema: { ...FORMULA_OUTPUT_SCHEMA } });
    expect(db.requestCount).toBe(2);
    expect(db.boundValues.flat()).not.toContain('Lorentz force');
    expect(db.boundValues.flat()).not.toContain('洛倫茲力');
  });

  it('sends one normalized image to inference ephemerally and does not persist or log it', async () => {
    const { env, db } = await setupAzure();
    const fetchMock = stubAzureResponse();
    const png = makePng();
    const form = new FormData();
    form.append('description', 'continuity equation');
    form.append('image', new Blob([png], { type: 'image/png' }), 'flow.png');
    const errorLog = vi.spyOn(console, 'error');
    try {
      const response = await worker.fetch(new Request('https://pure.test/api/formulas/generate', {
        method: 'POST',
        headers: { origin: 'https://pure.test', cookie: `purelink_session=${SESSION}`, 'x-purelink-locale': 'en' },
        body: form,
      }), env);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ provider: AZURE_OPENAI_FORMULA_AI_PROVIDER, model: AZURE_ENV.AZURE_OPENAI_DEPLOYMENT });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.input[1].type).toBe('message');
      expect(body.input[1].role).toBe('user');
      const userContent = body.input[1].content;
      expect(userContent[0].type).toBe('input_text');
      expect(userContent[0].text).toContain('continuity equation');
      expect(userContent[0].text).toContain('do not infer steady state, damping, forcing, or hidden components');
      expect(userContent[1].type).toBe('input_image');
      expect(userContent[1].image_url).toBe(`data:image/png;base64,${toBase64(png)}`);
      expect(userContent[1].detail).toBe('high');
      expect(db.requestCount).toBe(1);
      expect(db.boundValues.flat().some((value) => typeof value === 'string' && /continuity equation|base64|data:image/.test(value))).toBe(false);
      expect(errorLog).not.toHaveBeenCalled();
    } finally {
      errorLog.mockRestore();
    }
  });

  it('routes text-only and image requests to their configured deployments', async () => {
    const { env, db } = await setupAzure();
    env.AZURE_OPENAI_IMAGE_DEPLOYMENT = 'formula-test-image-deployment';
    const fetchMock = stubAzureResponse();

    const textResponse = await submitJson(env, { description: 'mass energy equivalence' }, 'en');
    expect(textResponse.status).toBe(200);
    await expect(textResponse.json()).resolves.toMatchObject({ model: AZURE_ENV.AZURE_OPENAI_DEPLOYMENT });

    const png = makePng();
    const form = new FormData();
    form.append('description', 'governing equation for this system');
    form.append('image', new Blob([png], { type: 'image/png' }), 'chua.png');
    const imageResponse = await worker.fetch(new Request('https://pure.test/api/formulas/generate', {
      method: 'POST', headers: { origin: 'https://pure.test', cookie: `purelink_session=${SESSION}`, 'x-purelink-locale': 'en' }, body: form,
    }), env);
    expect(imageResponse.status).toBe(200);
    await expect(imageResponse.json()).resolves.toMatchObject({ model: env.AZURE_OPENAI_IMAGE_DEPLOYMENT });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const textBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(textBody.model).toBe(AZURE_ENV.AZURE_OPENAI_DEPLOYMENT);
    expect(textBody).not.toHaveProperty('reasoning');
    expect(textBody.max_output_tokens).toBe(256);
    expect(JSON.stringify(textBody.input)).not.toContain('input_image');
    const imageBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(imageBody.model).toBe(env.AZURE_OPENAI_IMAGE_DEPLOYMENT);
    expect(imageBody.reasoning).toEqual({ effort: 'medium' });
    expect(imageBody.max_output_tokens).toBe(512);
    expect(imageBody.input[1].content[1].type).toBe('input_image');
    expect(db.requestCount).toBe(2);
  });

  it('rejects unsupported MIME, malformed images, unknown JSON fields, and empty descriptions before quota use', async () => {
    const { env, db } = await setupAzure();
    stubAzureResponse();
    const badRequests = [];
    const unsupported = new FormData();
    unsupported.append('description', 'continuity equation');
    unsupported.append('image', new Blob(['not an image'], { type: 'image/gif' }), 'bad.gif');
    badRequests.push(new Request('https://pure.test/api/formulas/generate', {
      method: 'POST', headers: { origin: 'https://pure.test', cookie: `purelink_session=${SESSION}` }, body: unsupported,
    }));
    const malformed = new FormData();
    malformed.append('description', 'continuity equation');
    malformed.append('image', new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' }), 'bad.png');
    badRequests.push(new Request('https://pure.test/api/formulas/generate', {
      method: 'POST', headers: { origin: 'https://pure.test', cookie: `purelink_session=${SESSION}` }, body: malformed,
    }));
    badRequests.push(new Request('https://pure.test/api/formulas/generate', {
      method: 'POST', headers: { origin: 'https://pure.test', cookie: `purelink_session=${SESSION}`, 'content-type': 'application/json' },
      body: JSON.stringify({ description: 'x=1', extra: true }),
    }));
    badRequests.push(new Request('https://pure.test/api/formulas/generate', {
      method: 'POST', headers: { origin: 'https://pure.test', cookie: `purelink_session=${SESSION}`, 'content-type': 'application/json' },
      body: '{"description":',
    }));
    badRequests.push(new Request('https://pure.test/api/formulas/generate', {
      method: 'POST', headers: { origin: 'https://pure.test', cookie: `purelink_session=${SESSION}`, 'content-type': 'application/json' },
      body: JSON.stringify({ description: ' ' }),
    }));

    for (const request of badRequests) expect((await worker.fetch(request, env)).status).toBe(400);
    expect(db.requestCount).toBe(0);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('enforces the multipart request body limit before inference or quota use', async () => {
    const { env, db } = await setupAzure();
    stubAzureResponse();
    const form = new FormData();
    form.append('description', 'wave equation');
    form.append('image', new Blob([new Uint8Array(2 * 1024 * 1024 + 1)], { type: 'image/png' }), 'oversized.png');
    const response = await worker.fetch(new Request('https://pure.test/api/formulas/generate', {
      method: 'POST', headers: { origin: 'https://pure.test', cookie: `purelink_session=${SESSION}`, 'x-purelink-locale': 'en' }, body: form,
    }), env);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'Reference images must be 2 MB or smaller. Your allowance was not used.' });
    expect(db.requestCount).toBe(0);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('rolls back free quota on provider timeout and never logs provider payload details', async () => {
    const { env, db } = await setupAzure();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new DOMException('secret response detail', 'AbortError'); }));
    const errorLog = vi.spyOn(console, 'error');
    try {
      const response = await submitJson(env, { description: 'heat equation' }, 'en');
      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toMatchObject({ error: 'Formula generation did not complete. Your allowance was restored; please try again.' });
      expect(db.requestCount).toBe(0);
      expect(db.freeCount).toBe(0);
      expect(errorLog).not.toHaveBeenCalled();
    } finally {
      errorLog.mockRestore();
    }
  });

  it('reports a safe generic failure for 5xx provider errors and restores the allowance', async () => {
    const { env, db } = await setupAzure();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: 'internal provider detail' } }), { status: 500 })));
    const errorLog = vi.spyOn(console, 'error');
    try {
      const response = await submitJson(env, { description: 'heat equation' }, 'en');
      expect(response.status).toBe(502);
      const errorBody = await response.json();
      expect(errorBody.error).toBe('Formula generation did not complete. Your allowance was restored; please try again.');
      expect(errorBody.error).not.toContain('internal provider detail');
      expect(db.requestCount).toBe(0);
      expect(db.freeCount).toBe(0);
      expect(errorLog).not.toHaveBeenCalled();
    } finally {
      errorLog.mockRestore();
    }
  });

  it('restores the allowance when the safely returned draft asks for more context', async () => {
    const { env, db } = await setupAzure();
    stubAzureResponse({ latex: '', needs_context: true }, 'en');
    const response = await submitJson(env, { description: 'the unnamed system? evaporation setup' }, 'en');
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: 'Please add a little more context (such as the subject or setup) so PureLink can choose the right formula. Your allowance was restored.' });
    expect(db.requestCount).toBe(0);
    expect(db.freeCount).toBe(0);
  });

  it('fails closed with 503 and no quota use when Azure configuration is absent', async () => {
    const db = new FormulaD1({});
    db.sessions.set(await hashManagementToken(SESSION), 'user-1');
    stubAzureResponse();
    const env = { pure_link_db: db };
    const response = await submitJson(env, { description: 'heat equation' }, 'en');
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: 'Formula generation is unavailable right now. Please try again.' });
    expect(db.requestCount).toBe(0);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('keeps same-origin authentication and localized invalid-image errors', async () => {
    const { env, db } = await setupAzure();
    stubAzureResponse();
    const form = new FormData();
    form.append('description', 'continuity equation');
    form.append('image', new Blob(['bad'], { type: 'image/png' }), 'broken.png');
    const response = await worker.fetch(new Request('https://pure.test/api/formulas/generate', {
      method: 'POST', headers: { origin: 'https://pure.test', cookie: `purelink_session=${SESSION}`, 'x-purelink-locale': 'zh-Hant' }, body: form,
    }), env);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: '請使用有效的 PNG 或 JPEG 參考圖片；本次未使用額度。' });
    expect(db.requestCount).toBe(0);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('applies the existing HMAC-backed authenticated abuse limit before consuming a 21st attempt', async () => {
    const { env, db } = await setupAzure({ balance: 100, freeCount: 5 });
    const fetchMock = stubAzureResponse();
    env.RATE_LIMIT_SECRET = 'test-rate-limit-secret';
    let lastResponse;
    for (let attempt = 0; attempt < 21; attempt += 1) {
      lastResponse = await submitJson(env, { description: 'x equals one' }, 'en');
      if (attempt < 20) expect(lastResponse.status).toBe(200);
    }
    expect(lastResponse.status).toBe(429);
    expect(lastResponse.headers.get('retry-after')).toBeTruthy();
    expect(db.requestCount).toBe(20);
    expect(db.balance).toBe(80);
    expect(db.rateLimitCount).toBe(21);
    expect(fetchMock).toHaveBeenCalledTimes(20);
  });
});

function stubAzureResponse(draft = DRAFT) {
  const payload = {
    id: 'resp_test',
    object: 'response',
    status: 'completed',
    model: AZURE_ENV.AZURE_OPENAI_DEPLOYMENT,
    output: [{
      type: 'message', role: 'assistant', status: 'completed',
      content: [{ type: 'output_text', text: JSON.stringify(draft), annotations: [] }],
    }],
    usage: { input_tokens: 12, output_tokens: 9, total_tokens: 21 },
  };
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function setupAzure({ balance = 0, freeCount = 0 } = {}) {
  const db = new FormulaD1({ balance, freeCount });
  db.sessions.set(await hashManagementToken(SESSION), 'user-1');
  return { env: { pure_link_db: db, ...AZURE_ENV }, db };
}

function submitJson(env, body, locale) {
  return worker.fetch(new Request('https://pure.test/api/formulas/generate', {
    method: 'POST',
    headers: { origin: 'https://pure.test', cookie: `purelink_session=${SESSION}`, 'content-type': 'application/json', 'x-purelink-locale': locale },
    body: JSON.stringify(body),
  }), env);
}

class FormulaD1 {
  constructor({ balance, freeCount }) {
    this.balance = balance;
    this.freeCount = freeCount;
    this.requestCount = 0;
    this.boundValues = [];
    this.rateLimitCount = 0;
    this.sessions = new Map();
    this.users = new Map([['user-1', { id: 'user-1', email: 'person@example.com', display_name: 'Person', avatar_url: null, is_admin: 0 }]]);
  }

  prepare(sql) {
    const db = this;
    const statement = {
      values: [],
      bind(...values) { this.values = values; db.boundValues.push(values); return this; },
      async first() {
        const query = sql.replace(/\s+/g, ' ').trim();
        if (query.includes('FROM user_sessions')) {
          return db.users.get(db.sessions.get(this.values[0])) || null;
        }
        if (query.startsWith('INSERT INTO formula_ai_daily_usage')) {
          if (db.requestCount >= Number(this.values[1])) return null;
          db.requestCount += 1;
          return { request_count: db.requestCount, usage_date: '2026-09-28' };
        }
        if (query.startsWith('INSERT INTO rate_limits')) {
          db.rateLimitCount += 1;
          return { request_count: db.rateLimitCount };
        }
        if (query.startsWith('UPDATE formula_ai_daily_usage') && query.includes('free_count = free_count + 1')) {
          if (db.freeCount >= Number(this.values[2])) return null;
          db.freeCount += 1;
          return { free_count: db.freeCount };
        }
        if (query.startsWith('UPDATE formula_ai_credit_balances')) {
          if (db.balance <= 0) return null;
          db.balance -= 1;
          return { balance: db.balance };
        }
        throw new Error(`Unexpected first(): ${query}`);
      },
      async run() {
        const query = sql.replace(/\s+/g, ' ').trim();
        if (query.startsWith('DELETE FROM formula_ai_daily_usage')) return { success: true };
        if (query.startsWith('DELETE FROM rate_limits')) return { success: true };
        if (query.startsWith('UPDATE formula_ai_daily_usage')) {
          db.requestCount = Math.max(0, db.requestCount - 1);
          if (query.includes('free_count = MAX(0, free_count - 1)')) db.freeCount = Math.max(0, db.freeCount - 1);
          return { success: true };
        }
        if (query.startsWith('UPDATE formula_ai_credit_balances') && query.includes('balance = balance + 1')) {
          db.balance += 1;
          return { success: true };
        }
        throw new Error(`Unexpected run(): ${query}`);
      },
    };
    return statement;
  }

  async batch(statements) {
    const snapshot = { balance: this.balance, requestCount: this.requestCount, freeCount: this.freeCount };
    try {
      for (const statement of statements) await statement.run();
      return statements.map(() => ({ success: true }));
    } catch (error) {
      Object.assign(this, snapshot);
      throw error;
    }
  }
}

function makePng() {
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array([0, 0, 0, 1, 0, 0, 0, 1, 8, 0, 0, 0, 0]);
  const data = new Uint8Array(deflateSync(new Uint8Array([0, 127])));
  return concat([signature, pngChunk('IHDR', ihdr), pngChunk('IDAT', data), pngChunk('IEND', new Uint8Array())]);
}

function pngChunk(type, data) {
  const name = new TextEncoder().encode(type);
  const length = new Uint8Array([0, 0, 0, data.length]);
  const checksum = crc32(concat([name, data]));
  const crc = new Uint8Array([checksum >>> 24, checksum >>> 16, checksum >>> 8, checksum]);
  return concat([length, name, data, crc]);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concat(chunks) {
  const output = new Uint8Array(chunks.reduce((total, item) => total + item.length, 0));
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return output;
}

function toBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

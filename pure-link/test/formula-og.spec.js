import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import worker from '../src/index.js';
import { composeFormulaOgSvg, renderFormulaOgImage, renderFormulaSegments } from '../src/formula-og.js';
import { renderCardPage, renderFormulaPage, renderSocialPreviewPage, renderUrlPreview } from '../src/pages.js';

function pngWidth(bytes) {
  return (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
}

function pngHeight(bytes) {
  return (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
}

function expectSocialPng(bytes) {
  expect(bytes.length).toBeGreaterThan(1000);
  expect(Array.from(bytes.subarray(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  expect(pngWidth(bytes)).toBe(1200);
  expect(pngHeight(bytes)).toBe(630);
}

// Minimal D1 stub covering the repository lookups the OG route performs.
function memoryD1(links) {
  const bySlug = new Map(links.map((link) => [link.slug, link]));
  return {
    prepare() {
      return {
        bind(...args) {
          return { first: async () => bySlug.get(args[0]) ?? null };
        },
      };
    },
  };
}

function createEnv(extraLinks = []) {
  return {
    pure_link_db: memoryD1(extraLinks),
    APP_ENV: 'test',
  };
}

function resvgWasmBytes() {
  return readFileSync(new URL('../node_modules/@resvg/resvg-wasm/index_bg.wasm', import.meta.url));
}

function formulaLink(slug, content, overrides = {}) {
  return { slug, content_type: 'formula', content, status: 'active', expires_at: null, ...overrides };
}

const HEAT_FORMULA = '\\frac{\\partial T}{\\partial t} = \\alpha \\nabla^2 T';

describe('formula OG image renderer', () => {
  let resvgModule;
  beforeAll(() => {
    resvgModule = new WebAssembly.Module(resvgWasmBytes());
  });

  it('renders a known formula into a 1200x630 PNG', async () => {
    const { png } = await renderFormulaOgImage(resvgModule, HEAT_FORMULA);
    expectSocialPng(png);
  });

  it('is deterministic for the same stored formula', async () => {
    const content = '\\int_0^1 x^2 \\, dx = \\tfrac{1}{3}';
    const first = await renderFormulaOgImage(resvgModule, content);
    const second = await renderFormulaOgImage(resvgModule, content);
    expect(new Uint8Array(first.png)).toEqual(new Uint8Array(second.png));
  });

  it('differs between formulas so real content is represented', async () => {
    const heat = await renderFormulaOgImage(resvgModule, HEAT_FORMULA);
    const energy = await renderFormulaOgImage(resvgModule, 'E = mc^2');
    expect(new Uint8Array(heat.png)).not.toEqual(new Uint8Array(energy.png));
  });

  it('scales long formulas uniformly into the safe content box without cropping', async () => {
    const longFormula = Array.from({ length: 40 }, (_, i) => `tx_${i}^2`).join('+');
    const composed = composeFormulaOgSvg(await renderFormulaSegments(longFormula));

    // Wrapper declares the exact social canvas.
    expect(composed).toContain('width="1200" height="630"');

    // The only formula <svg> must fit the 1040x400 safe box and keep aspect.
    const nested = composed.match(/<svg x="([\d.-]+)" y="([\d.-]+)" width="([\d.]+)" height="([\d.]+)" viewBox="([^"]+)"/);
    expect(nested).toBeTruthy();
    const [, , , width, height, viewBox] = nested;
    expect(Number(width)).toBeLessThanOrEqual(1040);
    expect(Number(height)).toBeLessThanOrEqual(400);
    const [, , viewWidth, viewHeight] = viewBox.trim().split(/\s+/).map(Number);
    expect(Number(width) / Number(height)).toBeCloseTo(viewWidth / viewHeight, 1);
  });

  it('stacks delimited formulas with the same uniform scale', async () => {
    const segments = await renderFormulaSegments('$e^{i\\pi}+1=0$\n$$\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}$$');
    expect(segments.length).toBe(2);
    const composed = composeFormulaOgSvg(segments);
    expect((composed.match(/<svg x="/g) || []).length).toBe(2);
  });

  it('fails safely on empty, malformed, and missing rasterizer', async () => {
    await expect(renderFormulaOgImage(resvgModule, '')).rejects.toMatchObject({ name: 'FormulaRenderError' });
    await expect(renderFormulaOgImage(resvgModule, '   ')).rejects.toMatchObject({ name: 'FormulaRenderError' });
    await expect(renderFormulaOgImage(resvgModule, '\\notacommand')).rejects.toMatchObject({ name: 'FormulaRenderError' });
    await expect(renderFormulaOgImage(resvgModule, '\\begin{notanenv}')).rejects.toMatchObject({ name: 'FormulaRenderError' });
    await expect(renderFormulaOgImage(null, 'x')).rejects.toMatchObject({ name: 'FormulaRenderError' });
  });
});

describe('formula OG endpoint', () => {
  let env;
  beforeAll(() => {
    env = {
      pure_link_db: memoryD1([
        formulaLink('formulaog', HEAT_FORMULA),
        formulaLink('malformed-formula', '\\notacommand'),
        { slug: 'linkog', content_type: 'url', content: 'https://example.com/page?q=1', status: 'active', expires_at: null },
        { slug: 'cardog', content_type: 'card', content: 'a card', status: 'active', expires_at: null },
      ]),
      APP_ENV: 'test',
    };
  });

  it('serves a 200 PNG with the social dimensions for a valid formula slug', async () => {
    const response = await worker.fetch(new Request('https://pure.test/og/formula/formulaog.png'), env);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('cache-control')).toContain('max-age=3600');
    expectSocialPng(new Uint8Array(await response.arrayBuffer()));
  });

  it('is deterministic across requests', async () => {
    const first = await (await worker.fetch(new Request('https://pure.test/og/formula/formulaog.png'), env)).arrayBuffer();
    const second = await (await worker.fetch(new Request('https://pure.test/og/formula/formulaog.png'), env)).arrayBuffer();
    expect(new Uint8Array(first)).toEqual(new Uint8Array(second));
  });

  it('fails safely to the generic OG image for malformed stored formulas', async () => {
    const response = await worker.fetch(new Request('https://pure.test/og/formula/malformed-formula.png'), env);
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/og.png');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('returns 404 for unknown slugs', async () => {
    const missing = await worker.fetch(new Request('https://pure.test/og/formula/nope.png'), env);
    expect(missing.status).toBe(404);
  });

  it('returns 404 for non-formula slugs', async () => {
    const url = await worker.fetch(new Request('https://pure.test/og/formula/linkog.png'), env);
    expect(url.status).toBe(404);
    const card = await worker.fetch(new Request('https://pure.test/og/formula/cardog.png'), env);
    expect(card.status).toBe(404);
  });

  it('points only formula share pages at the formula OG image', async () => {
    const page = await worker.fetch(new Request('https://pure.test/formulaog'), env);
    expect(page.status).toBe(200);
    const html = await page.text();
    const expected = 'https://no-no.uk/og/formula/formulaog.png';
    expect(html).toContain(`<meta property="og:image" content="${expected}">`);
    expect(html).toContain(`<meta name="twitter:image" content="${expected}">`);
    expect(html).toContain('<meta property="og:image:width" content="1200">');
    expect(html).toContain('<meta property="og:image:height" content="630">');
    expect(html).not.toContain('og.png?v=1');
  });

  it('keeps URL share metadata unchanged', async () => {
    const preview = await worker.fetch(new Request('https://pure.test/linkog+'), env);
    const html = await preview.text();
    expect(html).toContain('<meta property="og:image" content="https://no-no.uk/og.png?v=1">');
    expect(html).toContain('<meta name="twitter:image" content="https://no-no.uk/og.png?v=1">');
  });

  it('keeps card share metadata unchanged', async () => {
    const html = renderCardPage({ slug: 'cardog', content: 'a card', theme: 'paper', signature: null }, 'en');
    expect(html).toContain('<meta property="og:image" content="https://no-no.uk/og.png?v=1">');
    expect(html).toContain('<meta name="twitter:image" content="https://no-no.uk/og.png?v=1">');
  });

  it('keeps the URL crawler preview on generic metadata', () => {
    const html = renderSocialPreviewPage('en');
    expect(html).toContain('https://no-no.uk/og.png?v=1');
  });

  it('formula og:image URL is locale independent', async () => {
    const english = renderFormulaPage(formulaLink('formulaog', 'x^2'), 'en');
    const chinese = renderFormulaPage(formulaLink('formulaog', 'x^2'), 'zh-Hant');
    const expected = '<meta property="og:image" content="https://no-no.uk/og/formula/formulaog.png">';
    expect(english).toContain(expected);
    expect(chinese).toContain(expected);
    expect(english).not.toContain('/en/og/formula');
  });
});

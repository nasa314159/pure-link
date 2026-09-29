import { beforeAll, describe, expect, it } from 'vitest';
import { inflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import worker from '../src/index.js';
import { composeFormulaOgSvg, renderFormulaOgImage, renderFormulaSegments } from '../src/formula-og.js';
import { renderCardPage, renderFormulaPage, renderSocialPreviewPage, renderUrlPreview } from '../src/pages.js';

function resvgWasmBytes() {
  return readFileSync(new URL('../node_modules/@resvg/resvg-wasm/index_bg.wasm', import.meta.url));
}

function brandFontBytes() {
  return new Uint8Array(readFileSync(new URL('../node_modules/katex/dist/fonts/KaTeX_SansSerif-Regular.ttf', import.meta.url)));
}

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

// Minimal PNG (RGBA8, non-interlaced) decoder, enough to read decoded pixels
// for the opacity/brand checks below.
function decodePngRgba(bytes) {
  if (bytes[24] !== 8 || bytes[25] !== 6 || bytes[28] !== 0) throw new Error('expected 8-bit RGBA PNG');
  const width = pngWidth(bytes);
  const height = pngHeight(bytes);
  const chunks = [];
  let offset = 8;
  while (offset < bytes.length) {
    const length = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    if (type === 'IDAT') chunks.push(bytes.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
    if (type === 'IEND') break;
  }
  const raw = inflateSync(Buffer.concat(chunks.map((c) => Buffer.from(c))));
  const stride = width * 4;
  const out = Buffer.alloc(height * stride);
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    const filter = raw[rowStart];
    const row = Buffer.from(raw.subarray(rowStart + 1, rowStart + 1 + stride));
    for (let x = 0; x < stride; x += 1) {
      const left = x >= 4 ? row[x - 4] : 0;
      const up = previous[x];
      const upLeft = x >= 4 ? previous[x - 4] : 0;
      if (filter === 1) row[x] = (row[x] + left) & 0xff;
      else if (filter === 2) row[x] = (row[x] + up) & 0xff;
      else if (filter === 3) row[x] = (row[x] + ((left + up) >> 1)) & 0xff;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        row[x] = (row[x] + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft)) & 0xff;
      }
    }
    row.copy(out, y * stride);
    previous = row;
  }
  return {
    width,
    height,
    pixel(x, y) {
      const idx = (y * width + x) * 4;
      return [out[idx], out[idx + 1], out[idx + 2], out[idx + 3]];
    },
  };
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
    const { png } = await renderFormulaOgImage(resvgModule, HEAT_FORMULA, brandFontBytes());
    expectSocialPng(png);
  });

  it('is deterministic for the same stored formula', async () => {
    const content = '\\int_0^1 x^2 \\, dx = \\tfrac{1}{3}';
    const first = await renderFormulaOgImage(resvgModule, content, brandFontBytes());
    const second = await renderFormulaOgImage(resvgModule, content, brandFontBytes());
    expect(new Uint8Array(first.png)).toEqual(new Uint8Array(second.png));
  });

  it('differs between formulas so real content is represented', async () => {
    const heat = await renderFormulaOgImage(resvgModule, HEAT_FORMULA, brandFontBytes());
    const energy = await renderFormulaOgImage(resvgModule, 'E = mc^2', brandFontBytes());
    expect(new Uint8Array(heat.png)).not.toEqual(new Uint8Array(energy.png));
  });

  it('keeps the full canvas opaque', async () => {
    const { png } = await renderFormulaOgImage(resvgModule, HEAT_FORMULA, brandFontBytes());
    const decoded = decodePngRgba(png);
    // Every alpha byte across sampled corners, edges, and center must be 255:
    // the OG canvas intentionally paints the paper background everywhere.
    for (const [x, y] of [[0, 0], [1199, 0], [0, 629], [1199, 629], [600, 315], [20, 300], [1180, 20]]) {
      expect(decoded.pixel(x, y)[3]).toBe(255);
    }
  });

  it('places the subtle brand line in the bottom-right corner', async () => {
    const { png } = await renderFormulaOgImage(resvgModule, HEAT_FORMULA, brandFontBytes());
    const decoded = decodePngRgba(png);
    const paper = [0xf7, 0xf8, 0xf5];
    const colored = (x, y) => {
      const [r, g, b] = decoded.pixel(x, y);
      return Math.abs(r - paper[0]) + Math.abs(g - paper[1]) + Math.abs(b - paper[2]) > 24;
    };

    // Brand block: link icon left of the wordmark; the whole line ends at the
    // 44px right margin, above the 48px bottom margin.
    let markPixels = 0;
    for (let x = 1028; x < 1062; x += 2) {
      for (let y = 554; y < 588; y += 2) {
        if (colored(x, y)) markPixels += 1;
      }
    }
    expect(markPixels).toBeGreaterThan(0);

    let textPixels = 0;
    for (let x = 1064; x < 1160; x += 2) {
      for (let y = 554; y < 588; y += 2) {
        if (colored(x, y)) textPixels += 1;
      }
    }
    // The wordmark is quiet but present: a modest number of inked pixels.
    expect(textPixels).toBeGreaterThan(20);
    expect(textPixels).toBeLessThan(60 * 40 / 4);

    // Nothing but paper in the bottom-left former brand corner.
    let bottomLeft = 0;
    for (let x = 44; x < 120; x += 2) {
      for (let y = 629 - 48; y < 629 - 10; y += 2) {
        if (colored(x, y)) bottomLeft += 1;
      }
    }
    expect(bottomLeft).toBe(0);
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
    const composed = composeFormulaOgSvg(segments, brandFontBytes());
    expect((composed.match(/<svg x="/g) || []).length).toBe(2);
  });

  it('adds the quiet [icon] PureLink brand line bottom-right', async () => {
    const composed = composeFormulaOgSvg(await renderFormulaSegments(HEAT_FORMULA), brandFontBytes());

    // Single, low-contrast brand group anchored to the bottom-right margins.
    const brand = composed.match(/<g opacity="0.6">([\s\S]*?)<\/g><\/svg>/);
    expect(brand).toBeTruthy();
    expect(brand[1]).toContain('<text ');
    expect(brand[1]).toContain('>PureLink</text>');
    expect(brand[1]).toContain('text-anchor="end"');
    expect(brand[1]).toContain('font-family="KaTeX_SansSerif"');
    expect(brand[1]).toContain('fill="#65716b"');

    // Icon sits left of the wordmark; the wordmark ends inside the 44px right
    // margin and both sit above the 48px bottom margin.
    expect(brand[1]).toContain(`<g transform="translate(${1200 - 44 - 123 - 9 - 30} ${630 - 48 - 30}) scale(0.625)">`);
    expect(brand[1]).toContain(`<text x="${1200 - 44}" y="${630 - 48 - 30 + 27}" `);

    // Nothing promotional: no extra text nodes besides the single wordmark.
    expect((composed.match(/<text /g) || []).length).toBe(1);
  });

  it('omits the wordmark when no brand font is supplied', async () => {
    const composed = composeFormulaOgSvg(await renderFormulaSegments(HEAT_FORMULA));
    expect(composed).not.toContain('<text ');
    expect(composed).toContain(`translate(${1200 - 44 - 30} ${630 - 48 - 30})`);
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

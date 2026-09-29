// Formula OG preview image for PureLink.
//
// Pipeline (all server-side, deterministic, no browser involved):
//   stored LaTeX -> MathJax (lite adaptor) -> self-contained SVG glyph paths
//   -> composed 1200x630 canvas SVG (formula scaled to fit + quiet brand mark)
//   -> @resvg/resvg-wasm rasterization -> PNG bytes.
//
// No persistent image storage: the PNG is rendered per request from the stored
// formula, so deleted PureLinks simply stop resolving (cache TTL set by the
// route). No headless browser, no external API for rendering.
//
// package, imported in src/index.js (wrangler default CompiledWasm rule).
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';
import { Resvg, initWasm } from '@resvg/resvg-wasm';
import { normalizeFormulaExpression, splitFormulaSegments } from './formula.js';

export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

// Safe content box for the rendered formula; the rest of the canvas stays as
// quiet background/brand space. Long formulas scale down uniformly inside it
// (known v1 limitation: extremely long formulas become small, never cropped).
const CONTENT_WIDTH = 1040;
const CONTENT_HEIGHT = 400;
const STACK_GAP = 64;
const MAX_SEGMENTS = 6;

// PureLink palette (see the page CSS: --ink / --paper / --muted and the
// favicon mark).
const INK = '#17231f';
const PAPER = '#f7f8f5';
const MUTED = '#65716b';

// Bottom-right brand line: [link icon] PureLink. Small, low-contrast, and far
// from the formula area so it stays visually quiet.
const BRAND_MARK_SIZE = 30;
const BRAND_OPACITY = 0.6;
const BRAND_RIGHT_MARGIN = 44;
const BRAND_BOTTOM_MARGIN = 48;
const BRAND_GAP = 9;
const BRAND_TEXT = 'PureLink';
const BRAND_FONT_FAMILY = 'KaTeX_SansSerif';
const BRAND_FONT_SIZE = 32;
const BRAND_TEXT_LENGTH = 123;

// Vector mirror of public/favicon.svg (background chip removed) so the OG
// image carries a quiet PureLink mark. The link icon itself, drawn as paths
// (no font needed). A small OpenType font (`KaTeX_SansSerif`) supplies the
// "PureLink" wordmark glyphs.
const BRAND_MARK_INNER = '<path d="M24.38,18.605c1.52.423,2.836,1.188,3.946,2.298.844.834,1.494,1.806,1.949,2.915.453,1.109.68,2.26.68,3.454,0,1.205-.227,2.361-.68,3.471-.455,1.109-1.105,2.086-1.949,2.932l-5.388,5.418c-.834.846-1.806,1.498-2.915,1.957s-2.261.689-3.454.689-2.343-.23-3.446-.689c-1.104-.459-2.083-1.111-2.939-1.957-.845-.846-1.5-1.828-1.965-2.947-.465-1.119-.697-2.287-.697-3.502,0-1.193.227-2.338.681-3.438.454-1.098,1.099-2.061,1.933-2.883l5.435-5.419c.982-.961,2.086-1.653,3.312-2.076l-.792,1.743c-.307.169-.594.354-.863.555-.27.2-.526.423-.769.665l-5.435,5.419c-1.489,1.469-2.234,3.279-2.234,5.434,0,1.057.195,2.066.586,3.027.391.961.956,1.807,1.695,2.535,1.531,1.51,3.364,2.266,5.498,2.266,2.145,0,3.972-.756,5.482-2.266l5.386-5.42c1.5-1.52,2.25-3.357,2.25-5.514s-.75-3.982-2.25-5.482c-1.076-1.077-2.387-1.779-3.929-2.107l.872-1.077ZM21.655,22.217h.317c1.404,0,2.599.502,3.581,1.506.973.993,1.457,2.197,1.457,3.613,0,.664-.129,1.307-.387,1.924-.26.619-.621,1.166-1.086,1.641l-5.419,5.436c-.454.453-1.012.818-1.671,1.092-.66.275-1.318.412-1.973.412-.592,0-1.209-.135-1.854-.404-.645-.268-1.184-.615-1.616-1.037-1.046-1.023-1.569-2.238-1.569-3.645,0-.666.127-1.309.38-1.934.253-.623.623-1.176,1.109-1.662l4.833-4.833.222,1.552-4.136,4.168c-.76.781-1.141,1.686-1.141,2.709,0,1.047.396,1.965,1.188,2.758.306.307.705.561,1.196.76.491.201.953.301,1.386.301.497,0,.996-.102,1.498-.309.501-.205.922-.479,1.26-.816l5.419-5.434c.729-.729,1.092-1.621,1.092-2.678s-.369-1.965-1.109-2.726c-.729-.75-1.616-1.125-2.661-1.125h-.317v-1.268ZM29.768,30.045c.326-.18.641-.381.943-.602.301-.223.582-.465.848-.729l5.387-5.419c.729-.739,1.289-1.585,1.68-2.535.391-.951.586-1.944.586-2.979,0-1.046-.195-2.039-.586-2.979-.391-.94-.951-1.774-1.68-2.503-1.5-1.5-3.328-2.25-5.482-2.25s-3.977.75-5.498,2.25l-5.435,5.419c-1.489,1.468-2.234,3.28-2.234,5.435,0,1.056.195,2.064.586,3.027.391.961.956,1.805,1.695,2.535,1.183,1.172,2.566,1.885,4.151,2.139l-1.015,1.061c-1.553-.412-2.894-1.182-4.024-2.312-.846-.846-1.507-1.825-1.997-2.952-.49-1.126-.735-2.299-.735-3.518s.245-2.389.735-3.516c.49-1.126,1.145-2.1,1.965-2.892l5.435-5.418c.834-.846,1.806-1.498,2.915-1.957s2.261-.689,3.454-.689M12,24h9"/><path d="M27.817,17.578h.317c2.628,0,5.053,1.035,6.595,2.556,1.531,1.51,2.266,3.364,2.266,5.498,0,2.145-.756,3.972-2.266,5.482l-5.386,5.42c-1.519,1.499-3.356,2.25-5.514,2.25-2.157,0-3.991-.751-5.479-2.238-1.51-1.531-2.266-3.364-2.266-5.498s.756-3.972,2.266-5.482l5.386-5.42c.729-.729,1.621-1.092,2.678-1.092M21.655,22.217c-1.404,0-2.599.502-3.581,1.506-.973.993-1.457,2.197-1.457,3.613s.484,2.62,1.457,3.613c.993,1.004,2.188,1.495,3.581,1.495s2.599-.492,3.611-1.495l5.419-5.436c.454-.453.818-1.012,1.092-1.671.274-.66.412-1.318.412-1.973,0-.592-.135-1.209-.404-1.854-.268-.645-.615-1.184-1.037-1.616-1.023-1.046-2.238-1.569-3.645-1.569s-2.62.526-3.595,1.499l-4.834,4.833,1.553.222,4.167-4.136c.781-.76,1.686-1.141,2.709-1.141s1.965.396,2.758,1.188l.978-.978M29.768,30.045c.326-.18.641-.381.943-.602.301-.223.582-.465.848-.729l5.387-5.419c.729-.739,1.289-1.585,1.68-2.535.391-.951.586-1.944.586-2.979,0-1.046-.195-2.039-.586-2.979-.391-.94-.951-1.774-1.68-2.503-1.5-1.5-3.328-2.25-5.482-2.25s-3.977.75-5.498,2.25l-5.435,5.419c-1.489,1.468-2.234,3.28-2.234,5.434s.756,3.982,2.266,5.498c.969.973,2.153,1.692,3.554,2.15l1.015-1.061c-1.597-.458-2.933-1.171-4.015-2.255-1.052-1.073-1.578-2.351-1.578-3.833s.526-2.767,1.578-3.839l5.435-5.419c1.067-1.052,2.336-1.578,3.807-1.578s2.735.526,3.787,1.578c1.063,1.083,1.594,2.366,1.594,3.848s-.526,2.762-1.578,3.834l-5.435,5.419c-.734.734-1.553,1.139-2.457,1.215l-.479.485Z" fill="#235c48"/>';

export class FormulaRenderError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FormulaRenderError';
  }
}

let mathJaxTypeset = null;
let resvgReady = null;

// AllPackages registers every bundled TeX package statically. Exclusions:
// - 'autoload' / 'require' could trigger dynamic or remote package loading;
// - 'noundefined' would render unknown macros as visible error text; excluding
//   it makes unknown macros propagate to `formatError`, so broken stored
//   formulas fail safely to the generic fallback below.
const EXCLUDED_PACKAGES = new Set(['autoload', 'require', 'noundefined']);

function getTypeset() {
  if (mathJaxTypeset) return mathJaxTypeset;
  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  const tex = new TeX({
    packages: AllPackages.filter((name) => !EXCLUDED_PACKAGES.has(name)),
    formatError: (jax, error) => { throw new FormulaRenderError(error.message); },
  });
  const svg = new SVG({ fontCache: 'none' });
  const document = mathjax.document('', { InputJax: tex, OutputJax: svg });
  mathJaxTypeset = (expression, displayMode) => adaptor.innerHTML(document.convert(expression, { display: displayMode }));
  return mathJaxTypeset;
}

// Single WASM initialization per isolate. `resvgWasmModule` is the compiled
// module imported in src/index.js (wrangler bundles it with its default
// CompiledWasm rule for *.wasm imports).
function ensureResvg(resvgWasmModule) {
  if (!resvgWasmModule) throw new FormulaRenderError('Resvg WASM module missing');
  if (!resvgReady) resvgReady = initWasm(resvgWasmModule);
  return resvgReady;
}

function parseViewBox(svgMarkup) {
  const match = svgMarkup.match(/viewBox="([^"]+)"/);
  if (!match) throw new FormulaRenderError('rendered formula has no viewBox');
  const [x, y, width, height] = match[1].trim().split(/\s+/).map(Number);
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw new FormulaRenderError('rendered formula has an invalid viewBox');
  }
  return { x, y, width, height };
}

function renderSegment(expression, displayMode) {
  const markup = getTypeset()(normalizeFormulaExpression(expression), displayMode);
  if (/data-mjx-error/.test(markup)) throw new FormulaRenderError('typeset error');
  return { markup: markup.replaceAll('currentColor', INK), viewBox: parseViewBox(markup) };
}

/**
 * Build the composed 1200x630 SVG. Exposed for tests so the deterministic
 * scale-to-fit layout (uniform scale, centered, inside the safe content box)
 * can be verified without rasterizing.
 */
export function composeFormulaOgSvg(segments, brandFont = null) {
  if (!Array.isArray(segments) || segments.length === 0) {
    throw new FormulaRenderError('no formula to render');
  }
  const maxPartWidth = Math.max(...segments.map((part) => part.viewBox.width));
  const totalPartHeight = segments.reduce((total, part) => total + part.viewBox.height, 0);
  // Uniform scale for the whole assembly; segments keep relative sizes.
  const scale = Math.min(
    CONTENT_WIDTH / maxPartWidth,
    (CONTENT_HEIGHT - STACK_GAP * (segments.length - 1)) / totalPartHeight,
  );
  const partHeights = segments.map((part) => part.viewBox.height * scale);
  const assemblyHeight = partHeights.reduce((total, height) => total + height, 0) + STACK_GAP * (segments.length - 1);

  let y = (OG_IMAGE_HEIGHT - assemblyHeight) / 2;
  const placed = segments.map((part) => {
    const width = part.viewBox.width * scale;
    const height = part.viewBox.height * scale;
    const x = (OG_IMAGE_WIDTH - width) / 2;
    const inner = part.markup.slice(part.markup.indexOf('>') + 1, Math.max(0, part.markup.lastIndexOf('</svg>')));
    const placed = `<svg x="${round(x)}" y="${round(y)}" width="${round(width)}" height="${round(height)}" viewBox="${part.viewBox.x} ${part.viewBox.y} ${part.viewBox.width} ${part.viewBox.height}">${inner}</svg>`;
    y += height + STACK_GAP;
    return placed;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_IMAGE_WIDTH}" height="${OG_IMAGE_HEIGHT}" viewBox="0 0 ${OG_IMAGE_WIDTH} ${OG_IMAGE_HEIGHT}">`
    + `<rect width="${OG_IMAGE_WIDTH}" height="${OG_IMAGE_HEIGHT}" fill="${PAPER}"/>`
    + placed.join('')
    + brandLine(brandFont)
    + `</svg>`;
}

// Bottom-right, right-aligned to the margin: [link icon] PureLink. When no
// brand font is supplied (tests/fallback), the wordmark is omitted and only
// the quiet vector icon remains.
function brandLine(brandFont) {
  const iconX = OG_IMAGE_WIDTH - BRAND_RIGHT_MARGIN - BRAND_MARK_SIZE;
  const iconY = OG_IMAGE_HEIGHT - BRAND_BOTTOM_MARGIN - BRAND_MARK_SIZE;
  const parts = [
    `<g transform="translate(${iconX} ${iconY}) scale(${BRAND_MARK_SIZE / 48})">${BRAND_MARK_INNER}</g>`,
  ];
  if (brandFont) {
    // The wordmark ends at the right margin, so with the icon the block reads
    // "[icon] PureLink" and is right-aligned without measuring the text.
    const textEndX = OG_IMAGE_WIDTH - BRAND_RIGHT_MARGIN;
    const textStartX = textEndX - BRAND_TEXT_LENGTH;
    const baselineY = iconY + BRAND_MARK_SIZE - 3;
    parts.push(
      `<text x="${textEndX}" y="${baselineY}" text-anchor="end" font-family="${BRAND_FONT_FAMILY}" font-size="${BRAND_FONT_SIZE}" textLength="${BRAND_TEXT_LENGTH}" lengthAdjust="spacingAndGlyphs" fill="${MUTED}">${BRAND_TEXT}</text>`,
    );
    // Icon slot sits just left of the wordmark start instead of the canvas edge.
    parts[0] = `<g transform="translate(${textStartX - BRAND_GAP - BRAND_MARK_SIZE} ${iconY}) scale(${BRAND_MARK_SIZE / 48})">${BRAND_MARK_INNER}</g>`;
  }
  return `<g opacity="${BRAND_OPACITY}">${parts.join('')}</g>`;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

/** Test hook: clear the per-isolate typeset cache. */
export function resetFormulaOgRuntimeForTests() {
  mathJaxTypeset = null;
}

/**
 * Render the stored formula content into PNG bytes. Throws FormulaRenderError
 * for anything that cannot be rendered safely; callers decide the response.
 */
// `resvgWasmModule` is the compiled @resvg/resvg-wasm module bundled by
// wrangler (default CompiledWasm rule for *.wasm imports). `brandFont` is the
// bundled OpenType wordmark font (wrangler Data rule for *.ttf imports).
export async function renderFormulaOgImage(resvgWasmModule, formulaContent, brandFont = null) {
  await ensureResvg(resvgWasmModule);
  const svg = composeFormulaOgSvg(await renderFormulaSegments(formulaContent), brandFont);
  const fontOptions = brandFont
    ? { font: { fontBuffers: [toUint8Array(brandFont)] } }
    : { font: { loadSystemFonts: false } };
  const resvg = new Resvg(svg, { fitTo: { mode: 'original' }, ...fontOptions });
  const png = resvg.render().asPng();
  if (!png || png.length < 100) throw new FormulaRenderError('empty PNG');
  return { png, width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT };
}

function toUint8Array(fontBytes) {
  if (fontBytes instanceof Uint8Array) return fontBytes;
  return new Uint8Array(fontBytes);
}

/**
 * Typeset the stored content into placed MathJax segments without rasterizing.
 * Exposed so tests can drive the real renderer for scaling/stacking checks.
 */
export async function renderFormulaSegments(formulaContent) {
  const content = String(formulaContent || '');
  if (!content.trim()) throw new FormulaRenderError('empty formula');
  return splitFormulaSegments(content).slice(0, MAX_SEGMENTS)
    .map((segment) => renderSegment(segment.expression, segment.displayMode));
}

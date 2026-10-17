import { toPng } from 'html-to-image';

// Every element here is part of the shared Formula/Card page markup that this
// bundle is loaded with; handlers attach through optional chaining as a guard.
const rawContent = /** @type {HTMLTextAreaElement} */ (document.getElementById('raw-content'));
const captureTarget = /** @type {HTMLElement} */ (document.getElementById('share-export'));
const brandToggle = /** @type {HTMLInputElement} */ (document.querySelector('[data-export-brand-toggle]'));
const exportBrand = /** @type {HTMLElement} */ (document.querySelector('[data-export-brand]'));
const messages = readMessages();

brandToggle?.addEventListener('change', () => {
  exportBrand.hidden = !brandToggle.checked;
});

// Shared Formula pages fit the rendered KaTeX to the available panel width.
// The KaTeX render is kept untouched at its natural 100% size and is shrunk
// with the layout-participating CSS zoom property on the rendered box, so the
// outer wrapper needs no manual size compensation. offsetWidth/clientWidth
// report the box in its own coordinate space and exclude the zoom effect, so
// the natural width stays measurable while zoomed. WebKit renders KaTeX
// incorrectly once zoom re-lays the formula out, so those browsers take the
// fallback below instead: no scaling at all, natural 100% render, and the
// outer wrapper's overflow-x scrolling for anything too wide.
const formulaFit = /** @type {HTMLElement | null} */ (document.querySelector('[data-formula-scale]'));
const formulaBox = /** @type {HTMLElement | null} */ (formulaFit?.querySelector('.formula-box') ?? null);
const FORMULA_MIN_SCALE = 0.7;
let formulaLastWidth = formulaFit?.clientWidth ?? 0;

// KaTeX renders correctly at 100% in every engine, but re-laying the render
// out at a smaller size misaligns radical/fraction internals in WebKit
// (inherited font-size, transform: scale, and CSS zoom all break it, while
// Chromium scales correctly). No capability check can distinguish a
// rendering bug, so this narrow UA/engine gate decides where scaling is
// allowed:
// - Desktop and Android Chromium-family engines (Chrome, Chromium, Arc,
//   Edge, Opera, Android Chrome) always keep the scaling path.
// - Desktop Safari is the remaining desktop WebKit identity.
// - Apple mobile platforms no longer imply WebKit: Apple grants entitled
//   alternative engines in the EU (iOS 17.4+) and Japan (iOS 26.2+), but
//   third-party iOS UAs (CriOS, FxiOS, EdgiOS, …) mimic Safari tokens while
//   omitting the Version token that the real Safari identity carries, so
//   they cannot prove their engine. See the ambiguity note below.
function isProblematicWebKitFormulaRendering() {
  const ua = navigator.userAgent;
  const appleMobile = ua.includes('iPhone') || ua.includes('iPad') || ua.includes('iPod') ||
    (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  const chromiumFamily = ua.includes('Chrome/') || ua.includes('Chromium') || ua.includes('Edg/') || ua.includes('OPR/');

  if (chromiumFamily && !appleMobile) return false;
  if (!appleMobile) return ua.includes('Safari/');
  if (ua.includes('Version/')) return true;

  // iOS/iPadOS ambiguity: an alternative-engine entitlement build could be
  // running Blink or Gecko, but its UA cannot prove it — and every shipped
  // iOS identity still renders with WebKit (as of 2026 no non-WebKit engine
  // has shipped). The failure modes are asymmetric: scaling a WebKit render
  // corrupts the formula geometry, while a needless fallback only forgoes
  // the scaling UX (the natural 100% render plus horizontal scrolling stays
  // correct), so ambiguous Apple-mobile identities conservatively take the
  // fallback until alternative-engine builds ship with distinguishable UAs.
  return true;
}

const formulaScalingBlocked = isProblematicWebKitFormulaRendering();

// macOS desktop Safari 26 lays KaTeX's own HTML render out incorrectly for
// tall operators (integrals, sums, limits) even at natural 100% size with
// every KaTeX font loaded and no wrapper CSS, zoom, or font-size effect —
// proven against a clean iframe holding only the production KaTeX CSS and the
// rendered KaTeX DOM. The same engine renders the <math> element (the
// visually hidden MathML branch of KATEX's htmlAndMathml output) correctly,
// so exactly this engine gets the formula-native-mathml root class, and the
// page CSS swaps the visual branch. Narrow identity gate:
// - requires the true desktop Safari identity (Macintosh + Safari/ +
//   Version/; Firefox and Chromium-family never carry that pair);
// - maxTouchPoints <= 1 keeps iPadOS "request desktop site" masquerades and
//   other Apple-mobile identities out;
// - Chromium-family tokens exclude Chrome/Edge/Opera/electron hybrids.
// iOS Safari renders KaTeX HTML correctly and must stay on it.
const formulaNativeMathmlClass = 'formula-native-mathml';

function isMacDesktopSafariFormulaFallback() {
  const ua = navigator.userAgent;
  const chromiumFamily = ua.includes('Chrome/') || ua.includes('Chromium') || ua.includes('Edg/') || ua.includes('OPR/');
  const appleMobile = ua.includes('iPhone') || ua.includes('iPad') || ua.includes('iPod') ||
    (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);

  return !appleMobile && !chromiumFamily &&
    ua.includes('Macintosh') && ua.includes('Safari/') && ua.includes('Version/');
}

const formulaNativeMathmlFallback = isMacDesktopSafariFormulaFallback();
if (formulaNativeMathmlFallback) {
  document.documentElement.classList.add(formulaNativeMathmlClass);
}

function fitFormulaToWidth() {
  if (!formulaFit || !formulaBox) return;
  if (formulaScalingBlocked) {
    // WebKit fallback: never scale (no zoom, no transform, no font-size
    // change) and keep the natural 100% KaTeX render; the wrapper's
    // overflow-x scrolling stays available for anything too wide. A zoom
    // left over from an earlier session state is removed defensively.
    formulaBox.style.removeProperty('zoom');
    return;
  }
  const naturalWidth = formulaBox.offsetWidth;
  const availableWidth = formulaFit.clientWidth;
  if (naturalWidth <= availableWidth) {
    // Fits: keep the formula at its original size and layout.
    formulaBox.style.removeProperty('zoom');
    return;
  }
  const scale = Math.max(FORMULA_MIN_SCALE, Math.min(1, availableWidth / naturalWidth));
  // Floor to three decimals so rounding can never leave a 1px overflow
  // scrollbar when the formula fits.
  formulaBox.style.zoom = String(Math.floor(scale * 1000) / 1000);
}

if (formulaFit && formulaBox) {
  fitFormulaToWidth();
  formulaLastWidth = formulaFit.clientWidth;
  // Web fonts change KaTeX metrics after layout, so re-fit once they settle.
  document.fonts?.ready?.then(fitFormulaToWidth);
  // On the WebKit fallback there is nothing to re-fit (the fit call is a
  // no-op), so the observer is only needed on the scaling path.
  if (typeof ResizeObserver === 'function' && !formulaScalingBlocked) {
    const formulaResizeObserver = new ResizeObserver(() => {
      // Zooming changes the box's layout contribution, never the observed
      // width; only genuine container-width changes (viewport, scrollbar)
      // re-fit.
      if (formulaFit.clientWidth === formulaLastWidth) return;
      formulaLastWidth = formulaFit.clientWidth;
      fitFormulaToWidth();
    });
    formulaResizeObserver.observe(formulaFit);
  }
}

document.querySelector('[data-copy-content]')?.addEventListener('click', async (event) => {
  const button = /** @type {HTMLButtonElement} */ (event.currentTarget);
  try {
    await navigator.clipboard.writeText(rawContent.value);
    setTemporaryLabel(button, messages.copied);
  } catch {
    setTemporaryLabel(button, messages.cannotCopy);
  }
});

document.querySelector('[data-copy-link]')?.addEventListener('click', async (event) => {
  const button = /** @type {HTMLButtonElement} */ (event.currentTarget);
  try {
    await copyText(location.href);
    setTemporaryLabel(button, messages.copiedLink);
  } catch {
    setTemporaryLabel(button, messages.cannotCopy);
  }
});

document.querySelector('[data-share-link]')?.addEventListener('click', async (event) => {
  const button = /** @type {HTMLButtonElement} */ (event.currentTarget);
  if (!navigator.share) {
    try {
      await copyText(location.href);
      setTemporaryLabel(button, messages.copiedLink);
    } catch {
      setTemporaryLabel(button, messages.cannotShare);
    }
    return;
  }

  try {
    await navigator.share({
      title: document.title,
      text: /** @type {HTMLMetaElement | null} */ (document.querySelector('meta[name="description"]'))?.content || 'PureLink',
      url: location.href,
    });
  } catch (error) {
    if (error?.name !== 'AbortError') setTemporaryLabel(button, messages.cannotShare);
  }
});

document.querySelector('[data-download-png]')?.addEventListener('click', async (event) => {
  const button = /** @type {HTMLButtonElement} */ (event.currentTarget);
  const originalLabel = button.textContent;
  button.dataset.exportState = 'working';
  button.disabled = true;
  button.textContent = messages.working;
  // A collapsed Card shared page clamps its content to six lines; the PNG
  // export must always capture the full card, so lift the clamp for the
  // capture and restore it afterwards.
  const clampedCardCopies = [...document.querySelectorAll('.card-copy')];
  clampedCardCopies.forEach((cardCopy) => cardCopy.classList.add('card-export-reveal'));
  // Formula pages shrink wide formulas responsively for display only; the PNG
  // export must keep its known-good output exactly. html-to-image sizes the
  // capture from the live element's client box and copies each node's
  // computed style, so the zoom is removed for the capture (restoring the
  // original natural rendering) and re-fit afterwards. On the WebKit
  // fallback no zoom was applied, so this is a no-op there.
  const scaledFormulas = /** @type {HTMLElement[]} */ ([...document.querySelectorAll('[data-formula-scale]')]);
  scaledFormulas.forEach(resetFormulaDisplay);
  // The native MathML fallback is display-only too: the PNG export is
  // produced from the KaTeX HTML branch, so the visual MathML switch is
  // suppressed for the whole capture lifecycle — html-to-image copies each
  // node's computed style, so the branch must be hidden at capture time —
  // and restored afterwards. On non-fallback engines removing the class is a
  // no-op (it was never added).
  document.documentElement.classList.remove(formulaNativeMathmlClass);

  // Restores every capture-only geometry override; seeded as a no-op before
  // the try so the finally below is safe even when awaiting the fonts (or
  // anything earlier) throws before the expansion ever ran.
  let restoreCaptureGeometry = () => {};
  try {
    await document.fonts.ready;
    // html-to-image measures the capture box from the live element's
    // clientWidth (it never reads scrollWidth) and copies each node's
    // computed style into the clone, so a wide formula keeps its
    // panel-constrained .formula-fit wrapper with its overflow-x scrolling
    // inside the captured box: content beyond the panel width is clipped at
    // the canvas edge, and the cloned scroll container paints a scrollbar
    // into the PNG (desktop Blink) or clips silently behind overlay
    // scrollbars (mobile Chromium). Expand overflowing wrappers to their
    // natural content width for the measurement only; the finally below
    // restores every override on both success and failure.
    restoreCaptureGeometry = expandFormulaCapture(scaledFormulas);
    const backgroundColor = getComputedStyle(captureTarget).backgroundColor;
    const dataUrl = await toPng(captureTarget, {
      pixelRatio: Math.min(window.devicePixelRatio || 1, 3),
      backgroundColor,
      cacheBust: false,
    });
    const anchor = document.createElement('a');
    anchor.download = button.dataset.filename || 'purelink.png';
    anchor.href = dataUrl;
    anchor.click();
    button.dataset.exportState = 'success';
    button.textContent = messages.saved;
  } catch {
    button.dataset.exportState = 'error';
    button.textContent = messages.failed;
  } finally {
    clampedCardCopies.forEach((cardCopy) => cardCopy.classList.remove('card-export-reveal'));
    scaledFormulas.forEach(resetFormulaDisplay);
    // Undo every capture-only geometry override exactly, before the re-fit
    // below recomputes the display fitting on the restored layout.
    restoreCaptureGeometry();
    if (formulaNativeMathmlFallback) {
      // Restore the MathML switch only on the engine that took it.
      document.documentElement.classList.add(formulaNativeMathmlClass);
    }
    fitFormulaToWidth();
    setTimeout(() => {
      button.textContent = originalLabel;
      button.disabled = false;
    }, 1800);
  }
});

function setTemporaryLabel(button, label) {
  const originalLabel = button.textContent;
  button.textContent = label;
  setTimeout(() => { button.textContent = originalLabel; }, 1600);
}

function resetFormulaDisplay(fit) {
  fit.querySelectorAll('.formula-box').forEach((element) => {
    /** @type {HTMLElement} */ (element).style.removeProperty('zoom');
  });
}

// Capture-only geometry for the PNG export: html-to-image measures the
// capture box from the live element's clientWidth (it never reads
// scrollWidth) and clones every node's computed style, so a wide formula
// keeps its panel-constrained .formula-fit wrapper — the overflow-x scroll
// container — at the visible width, clipping everything beyond it at the
// captured box and painting the cloned scroll container's scrollbar into
// the image. For the capture only, each wrapper that actually overflows its
// panel drops the scroll container (both overflow axes, because inline
// `visible` on one axis next to the stylesheet's hidden `overflow-y` would
// compute back to a scroll container) and expands to its natural content
// width, and #share-export — the measured and cloned capture root — expands
// with it, so the measured box covers the complete natural formula plus the
// export padding. Wrappers that fit their panel are skipped before any
// style is touched, so narrower formulas keep the existing capture exactly,
// and the zoom/fit logic above is never involved. The returned closure
// restores every saved inline style exactly; it must run from the export
// handler's finally block so it covers both success and failure.
function expandFormulaCapture(fits) {
  /** @type {Array<{ fit: HTMLElement, cssText: string }>} */
  const expandedFits = [];
  /** @type {Array<{ target: HTMLElement, cssText: string }>} */
  const expandedTargets = [];
  fits.forEach((fit) => {
    // Only a real overflow needs widening: scrollWidth and clientWidth are
    // integers, and a formula that fits (or a card page with no formula)
    // must not change today's capture geometry at all.
    if (!fit || fit.scrollWidth <= fit.clientWidth) return;
    expandedFits.push({ fit, cssText: fit.style.cssText });
    fit.style.overflow = 'visible';
    fit.style.width = 'max-content';
    const target = /** @type {HTMLElement} */ (fit.closest('#share-export') ?? captureTarget);
    if (expandedTargets.some(({ target: saved }) => saved === target)) return;
    expandedTargets.push({ target, cssText: target.style.cssText });
    target.style.width = 'max-content';
  });
  if (expandedFits.length === 0) return () => {};
  return function restoreFormulaCapture() {
    expandedTargets.forEach(({ target, cssText }) => {
      target.style.cssText = cssText;
    });
    expandedFits.forEach(({ fit, cssText }) => {
      fit.style.cssText = cssText;
    });
  };
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const helper = document.createElement('textarea');
  helper.value = value;
  helper.setAttribute('readonly', '');
  helper.style.position = 'fixed';
  helper.style.opacity = '0';
  document.body.append(helper);
  helper.select();
  const copied = document.execCommand('copy');
  helper.remove();
  if (!copied) throw new Error('Copy was rejected.');
}

function readMessages() {
  const fallback = { copied: 'Copied', cannotCopy: 'Could not copy', copiedLink: 'Copied link', cannotShare: 'Could not share', working: 'Preparing…', saved: 'Saved', failed: 'Could not create PNG' };
  try {
    return { ...fallback, ...(JSON.parse(document.getElementById('purelink-client-messages')?.textContent || '{}').content || {}) };
  } catch {
    return fallback;
  }
}

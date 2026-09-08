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

// Shared Formula pages fit their rendered KaTeX to the available panel width.
// KaTeX layout is em-based, so multiplying the wrapper font-size (via a plain
// percentage custom property) scales the whole formula proportionally without
// touching the KaTeX source. Wide formulas shrink down to the readability
// floor; anything still wider falls back to the wrapper's overflow-x
// scrolling instead of shrinking further.
const formulaScale = /** @type {HTMLElement | null} */ (document.querySelector('[data-formula-scale]'));
const FORMULA_MIN_SCALE = 0.7;
let formulaScaleLastWidth = formulaScale?.clientWidth ?? 0;

function fitFormulaToWidth() {
  if (!formulaScale) return;
  // Measure the natural (unscaled) width, then scale down proportionally.
  formulaScale.style.setProperty('--formula-scale', '100%');
  const naturalWidth = formulaScale.scrollWidth;
  const availableWidth = formulaScale.clientWidth;
  if (naturalWidth <= availableWidth) return;
  const scale = Math.max(FORMULA_MIN_SCALE, Math.min(1, availableWidth / naturalWidth));
  formulaScale.style.setProperty('--formula-scale', `${Math.floor(scale * 1000) / 10}%`);
}

if (formulaScale) {
  fitFormulaToWidth();
  formulaScaleLastWidth = formulaScale.clientWidth;
  // Web fonts change KaTeX metrics after layout, so re-fit once they settle.
  document.fonts?.ready?.then(fitFormulaToWidth);
  if (typeof ResizeObserver === 'function') {
    const formulaResizeObserver = new ResizeObserver(() => {
      // Scaling changes the formula height, never the observed box width;
      // only genuine container-width changes (viewport, scrollbar) re-fit.
      if (formulaScale.clientWidth === formulaScaleLastWidth) return;
      formulaScaleLastWidth = formulaScale.clientWidth;
      fitFormulaToWidth();
    });
    formulaResizeObserver.observe(formulaScale);
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
  // Formula pages shrink wide formulas responsively; the PNG export must keep
  // its original output exactly. html-to-image sizes the capture from the
  // live element's client box and copies each node's computed style, so the
  // live rendering is fully restored to the unscaled, non-scrolling layout
  // (the pre-scaling rendering) for the capture and re-fit afterwards.
  const scaledFormulas = /** @type {HTMLElement[]} */ ([...document.querySelectorAll('[data-formula-scale]')]);
  scaledFormulas.forEach((formula) => {
    formula.style.setProperty('--formula-scale', '100%');
    formula.style.setProperty('overflow', 'visible');
  });

  try {
    await document.fonts.ready;
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
    scaledFormulas.forEach((formula) => {
      formula.style.removeProperty('--formula-scale');
      formula.style.removeProperty('overflow');
    });
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

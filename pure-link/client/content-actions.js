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
// The KaTeX render is kept untouched at its natural 100% size and is scaled
// as one visual box with a CSS transform, because changing the wrapper
// font-size misaligns KaTeX's em-based internals in Safari. The outer
// wrapper owns available width and scrolling, the middle wrapper is sized to
// the scaled visual box so no blank gap or overlap remains, and the inner
// wrapper holds the untouched render. Formulas still wider at the readability
// floor fall back to horizontal scrolling instead of shrinking further.
const formulaFit = /** @type {HTMLElement | null} */ (document.querySelector('[data-formula-scale]'));
const formulaStretch = /** @type {HTMLElement | null} */ (formulaFit?.querySelector('.formula-stretch') ?? null);
const formulaBox = /** @type {HTMLElement | null} */ (formulaFit?.querySelector('.formula-box') ?? null);
const FORMULA_MIN_SCALE = 0.7;
let formulaLastWidth = formulaFit?.clientWidth ?? 0;

function fitFormulaToWidth() {
  if (!formulaFit || !formulaStretch || !formulaBox) return;
  // Transforms never affect layout boxes, so the untouched render can be
  // measured at its natural size whatever the current scale is.
  const naturalWidth = formulaBox.offsetWidth;
  const naturalHeight = formulaBox.offsetHeight;
  const availableWidth = formulaFit.clientWidth;
  if (naturalWidth <= availableWidth) {
    // Fits: keep the formula at its original size and layout.
    formulaBox.style.removeProperty('transform');
    formulaStretch.style.width = `${naturalWidth}px`;
    formulaStretch.style.height = `${naturalHeight}px`;
    return;
  }
  const scale = Math.max(FORMULA_MIN_SCALE, Math.min(1, availableWidth / naturalWidth));
  formulaBox.style.transform = `scale(${scale})`;
  // Compensate the middle wrapper for the transformed box so the outer
  // wrapper's layout height matches the visual height and its scrollable
  // width matches the scaled visual width.
  formulaStretch.style.width = `${Math.ceil(scale * naturalWidth)}px`;
  formulaStretch.style.height = `${Math.ceil(scale * naturalHeight)}px`;
}

if (formulaFit && formulaStretch && formulaBox) {
  fitFormulaToWidth();
  formulaLastWidth = formulaFit.clientWidth;
  // Web fonts change KaTeX metrics after layout, so re-fit once they settle.
  document.fonts?.ready?.then(fitFormulaToWidth);
  if (typeof ResizeObserver === 'function') {
    const formulaResizeObserver = new ResizeObserver(() => {
      // Scaling changes the compensated height, never the observed width;
      // only genuine container-width changes (viewport, scrollbar) re-fit.
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
  // computed style, so all transform/layout compensation is removed for the
  // capture (restoring the original natural rendering) and re-fit afterwards.
  const scaledFormulas = /** @type {HTMLElement[]} */ ([...document.querySelectorAll('[data-formula-scale]')]);
  scaledFormulas.forEach(resetFormulaDisplay);

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
    scaledFormulas.forEach(resetFormulaDisplay);
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
  fit.querySelectorAll('.formula-stretch, .formula-box').forEach((element) => {
    const node = /** @type {HTMLElement} */ (element);
    node.style.removeProperty('transform');
    node.style.removeProperty('width');
    node.style.removeProperty('height');
  });
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

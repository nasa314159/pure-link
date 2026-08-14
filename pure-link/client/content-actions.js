import { toPng } from 'html-to-image';

const rawContent = document.getElementById('raw-content');
const captureTarget = document.getElementById('share-export');
const brandToggle = document.querySelector('[data-export-brand-toggle]');
const exportBrand = document.querySelector('[data-export-brand]');
const messages = readMessages();

brandToggle?.addEventListener('change', () => {
  exportBrand.hidden = !brandToggle.checked;
});

document.querySelector('[data-copy-content]')?.addEventListener('click', async (event) => {
  const button = event.currentTarget;
  try {
    await navigator.clipboard.writeText(rawContent.value);
    setTemporaryLabel(button, messages.copied);
  } catch {
    setTemporaryLabel(button, messages.cannotCopy);
  }
});

document.querySelector('[data-copy-link]')?.addEventListener('click', async (event) => {
  const button = event.currentTarget;
  try {
    await copyText(location.href);
    setTemporaryLabel(button, messages.copiedLink);
  } catch {
    setTemporaryLabel(button, messages.cannotCopy);
  }
});

document.querySelector('[data-share-link]')?.addEventListener('click', async (event) => {
  const button = event.currentTarget;
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
      text: document.querySelector('meta[name="description"]')?.content || 'PureLink',
      url: location.href,
    });
  } catch (error) {
    if (error?.name !== 'AbortError') setTemporaryLabel(button, messages.cannotShare);
  }
});

document.querySelector('[data-download-png]')?.addEventListener('click', async (event) => {
  const button = event.currentTarget;
  const originalLabel = button.textContent;
  button.dataset.exportState = 'working';
  button.disabled = true;
  button.textContent = messages.working;

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

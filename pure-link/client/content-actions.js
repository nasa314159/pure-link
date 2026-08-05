import { toPng } from 'html-to-image';

const rawContent = document.getElementById('raw-content');
const captureTarget = document.getElementById('share-export');

document.querySelector('[data-copy-content]')?.addEventListener('click', async (event) => {
  const button = event.currentTarget;
  try {
    await navigator.clipboard.writeText(rawContent.value);
    setTemporaryLabel(button, '已複製');
  } catch {
    setTemporaryLabel(button, '無法複製');
  }
});

document.querySelector('[data-download-png]')?.addEventListener('click', async (event) => {
  const button = event.currentTarget;
  const originalLabel = button.textContent;
  button.dataset.exportState = 'working';
  button.disabled = true;
  button.textContent = '正在製作…';

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
    button.textContent = '已儲存';
  } catch {
    button.dataset.exportState = 'error';
    button.textContent = '製作失敗';
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

import { describe, expect, it, vi } from 'vitest';
import { createFormulaAiRequest, setupFormulaAiImage } from '../client/formula-ai-image.js';

describe('formula AI reference image UI transport', () => {
  it('previews one image, supports removal before submit, and sends text-only JSON afterwards', () => {
    const ui = imageUi();
    const file = { type: 'image/png', size: 128, name: 'context.png' };
    ui.input.files = [file];
    ui.input.dispatch('change');
    expect(ui.controls.selected()).toBe(file);
    expect(ui.preview.hidden).toBe(false);
    expect(ui.previewImage.src).toBe('blob:preview-1');

    ui.removeButton.dispatch('click');
    expect(ui.controls.selected()).toBeNull();
    expect(ui.input.value).toBe('');
    expect(ui.preview.hidden).toBe(true);
    expect(ui.previewImage.src).toBe('');
    expect(ui.revokePreviewUrl).toHaveBeenCalledWith('blob:preview-1');

    const request = createFormulaAiRequest('wave equation', ui.controls.selected(), 'en');
    expect(request.method).toBe('POST');
    expect(request.headers).toEqual({ 'x-purelink-locale': 'en', 'content-type': 'application/json' });
    expect(request.body).toBe(JSON.stringify({ description: 'wave equation' }));
  });

  it('uses multipart only when an optional image is selected', () => {
    const file = { type: 'image/jpeg', size: 32, name: 'figure.jpg' };
    class FormDataStub {
      entries = [];
      append(...values) { this.entries.push(values); }
    }
    const request = createFormulaAiRequest('continuity equation', file, 'zh-Hant', FormDataStub);
    expect(request.headers).toEqual({ 'x-purelink-locale': 'zh-Hant' });
    expect(request.body.entries).toEqual([['description', 'continuity equation'], ['image', file]]);
  });

  it('rejects unsupported MIME types and oversized files in the UI', () => {
    const ui = imageUi();
    ui.input.files = [{ type: 'image/svg+xml', size: 10 }];
    ui.input.dispatch('change');
    expect(ui.controls.selected()).toBeNull();
    expect(ui.setStatus).toHaveBeenCalledWith('Choose a PNG or JPEG image.', true);

    ui.input.files = [{ type: 'image/png', size: 2 * 1024 * 1024 + 1 }];
    ui.input.dispatch('change');
    expect(ui.controls.selected()).toBeNull();
    expect(ui.setStatus).toHaveBeenCalledWith('Images must be 2 MB or smaller.', true);
  });
});

function imageUi() {
  const input = element();
  const preview = { hidden: true };
  const previewImage = { src: '', removeAttribute(name) { if (name === 'src') this.src = ''; } };
  const removeButton = element();
  const setStatus = vi.fn();
  const revokePreviewUrl = vi.fn();
  let previewCount = 0;
  const controls = setupFormulaAiImage({
    input, preview, previewImage, removeButton,
    messages: { imageTooLarge: 'Images must be 2 MB or smaller.', imageUnsupported: 'Choose a PNG or JPEG image.' },
    setStatus,
    createPreviewUrl: () => `blob:preview-${++previewCount}`,
    revokePreviewUrl,
  });
  return { input, preview, previewImage, removeButton, controls, setStatus, revokePreviewUrl };
}

function element() {
  const listeners = new Map();
  const target = {
    files: [],
    addEventListener(type, handler) { listeners.set(type, handler); },
    dispatch(type) { listeners.get(type)?.({ type }); },
  };
  let value = '';
  Object.defineProperty(target, 'value', {
    get() { return value; },
    set(next) { value = next; if (next === '') target.files = []; },
  });
  return target;
}

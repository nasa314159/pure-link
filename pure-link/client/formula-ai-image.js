export const CLIENT_MAX_FORMULA_IMAGE_BYTES = 2 * 1024 * 1024;

export function setupFormulaAiImage({ input, preview, previewImage, removeButton, messages, setStatus, createPreviewUrl = URL.createObjectURL, revokePreviewUrl = URL.revokeObjectURL }) {
  let previewUrl = '';

  function clearPreviewUrl() {
    if (!previewUrl) return;
    revokePreviewUrl(previewUrl);
    previewUrl = '';
  }

  function clear() {
    input.value = '';
    preview.hidden = true;
    previewImage.removeAttribute('src');
    clearPreviewUrl();
  }

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return clear();
    if (file.size > CLIENT_MAX_FORMULA_IMAGE_BYTES) {
      clear();
      return setStatus(messages.imageTooLarge, true);
    }
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      clear();
      return setStatus(messages.imageUnsupported, true);
    }
    clearPreviewUrl();
    previewUrl = createPreviewUrl(file);
    previewImage.src = previewUrl;
    preview.hidden = false;
  });
  removeButton.addEventListener('click', clear);

  return { selected: () => input.files?.[0] || null, clear, clearPreviewUrl };
}

export function createFormulaAiRequest(description, image, locale, FormDataConstructor = FormData) {
  const headers = { 'x-purelink-locale': locale };
  let body;
  if (image) {
    body = new FormDataConstructor();
    body.append('description', description);
    body.append('image', image);
  } else {
    headers['content-type'] = 'application/json';
    body = JSON.stringify({ description });
  }
  return { method: 'POST', headers, body };
}

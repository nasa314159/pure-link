import { ValidationError } from './content.js';

export const MAX_FORMULA_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_FORMULA_IMAGE_PIXELS = 16_000_000;

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const JPEG_SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

/** Validate, inspect, and strip metadata from one small PNG or JPEG in memory. */
export async function normalizeFormulaImage(file, errorMessages = null) {
  if (!file || typeof file.arrayBuffer !== 'function') throw imageInvalid(errorMessages);
  if (file.size > MAX_FORMULA_IMAGE_BYTES) throw imageTooLarge(errorMessages);
  if (file.size < 12) throw imageInvalid(errorMessages);

  let bytes;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    throw imageInvalid(errorMessages);
  }
  if (bytes.byteLength !== file.size || bytes.byteLength > MAX_FORMULA_IMAGE_BYTES) throw imageInvalid(errorMessages);

  let normalized;
  try {
    normalized = isPng(bytes)
      ? { mimeType: 'image/png', bytes: stripPngMetadata(bytes) }
      : isJpeg(bytes)
        ? { mimeType: 'image/jpeg', bytes: stripJpegMetadata(bytes) }
        : null;
  } catch {
    throw imageInvalid(errorMessages);
  }
  if (!normalized || normalized.mimeType !== String(file.type || '').toLowerCase()) throw imageInvalid(errorMessages);
  return normalized;
}

function isPng(bytes) {
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

function isJpeg(bytes) {
  return bytes[0] === 0xff && bytes[1] === 0xd8;
}

function stripPngMetadata(bytes) {
  const chunks = [bytes.subarray(0, 8)];
  let offset = 8;
  let width = 0;
  let height = 0;
  let sawHeader = false;
  let sawData = false;
  let sawEnd = false;

  while (offset + 12 <= bytes.length) {
    const start = offset;
    const length = readUint32(bytes, offset);
    const dataStart = offset + 8;
    const end = dataStart + length + 4;
    if (end > bytes.length || !Number.isSafeInteger(end)) throw imageInvalid();
    const type = ascii(bytes, offset + 4, 4);
    if (!/^[A-Za-z]{4}$/.test(type)) throw imageInvalid();
    if (readUint32(bytes, dataStart + length) !== crc32(bytes.subarray(offset + 4, dataStart + length))) throw imageInvalid();

    if (!sawHeader) {
      if (type !== 'IHDR' || length !== 13) throw imageInvalid();
      width = readUint32(bytes, dataStart);
      height = readUint32(bytes, dataStart + 4);
      validateImageDimensions(width, height);
      if (![1, 2, 4, 8, 16].includes(bytes[dataStart + 8])
        || ![0, 2, 3, 4, 6].includes(bytes[dataStart + 9])
        || bytes[dataStart + 10] !== 0 || bytes[dataStart + 11] !== 0 || bytes[dataStart + 12] > 1) throw imageInvalid();
      sawHeader = true;
    } else if (type === 'IHDR') {
      throw imageInvalid();
    }

    if (type === 'IDAT') sawData = true;
    if (type === 'IEND') {
      if (length !== 0 || !sawData || end !== bytes.length) throw imageInvalid();
      sawEnd = true;
    }

    // PNG ancillary chunks include text, EXIF, and other user metadata.
    if ((type.charCodeAt(0) & 0x20) === 0) chunks.push(bytes.subarray(start, end));
    offset = end;
    if (sawEnd) break;
  }

  if (!sawHeader || !sawData || !sawEnd || offset !== bytes.length) throw imageInvalid();
  return concat(chunks, chunks.reduce((total, chunk) => total + chunk.length, 0));
}

function stripJpegMetadata(bytes) {
  if (bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) throw imageInvalid();
  const kept = [bytes.subarray(0, 2)];
  let offset = 2;
  let sawFrame = false;
  let sawScan = false;
  let sawEnd = false;

  while (offset < bytes.length) {
    const markerStart = offset;
    if (bytes[offset] !== 0xff) throw imageInvalid();
    while (bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) throw imageInvalid();
    const marker = bytes[offset++];
    if (marker === 0x00 || marker === 0xd8) throw imageInvalid();

    if (marker === 0xd9) {
      kept.push(bytes.subarray(markerStart, offset));
      sawEnd = true;
      break;
    }
    if (marker >= 0xd0 && marker <= 0xd7 || marker === 0x01) {
      kept.push(bytes.subarray(markerStart, offset));
      continue;
    }
    if (offset + 2 > bytes.length) throw imageInvalid();
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) throw imageInvalid();
    const segmentEnd = offset + length;

    if (JPEG_SOF_MARKERS.has(marker)) {
      if (length < 8) throw imageInvalid();
      const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      validateImageDimensions(width, height);
      sawFrame = true;
    }
    if (marker === 0xda) sawScan = true;

    // Preserve JFIF and Adobe transform markers; drop APP metadata (including
    // EXIF/XMP/GPS/ICC) and COM without decoding or rewriting image pixels.
    if (!(marker >= 0xe1 && marker <= 0xed) && marker !== 0xef && marker !== 0xfe) {
      kept.push(bytes.subarray(markerStart, segmentEnd));
    }
    offset = segmentEnd;

    if (marker === 0xda) {
      while (offset < bytes.length) {
        if (bytes[offset] !== 0xff) { offset += 1; continue; }
        let next = offset + 1;
        while (bytes[next] === 0xff) next += 1;
        if (next >= bytes.length) throw imageInvalid();
        const code = bytes[next];
        if (code === 0x00 || code >= 0xd0 && code <= 0xd7) { offset = next + 1; continue; }
        break;
      }
    }
  }

  if (!sawFrame || !sawScan || !sawEnd || offset !== bytes.length) throw imageInvalid();
  return concat(kept, kept.reduce((total, chunk) => total + chunk.length, 0));
}

function validateImageDimensions(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
    || width > 8192 || height > 8192 || width * height > MAX_FORMULA_IMAGE_PIXELS) throw imageInvalid();
}

function readUint32(bytes, offset) {
  return (bytes[offset] * 0x1000000 + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;
}

function ascii(bytes, offset, length) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function concat(chunks, length) {
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function imageTooLarge(messages) {
  return new ValidationError(messages?.formulaImageTooLarge || 'Reference images must be 2 MB or smaller.', 'image');
}

function imageInvalid(messages) {
  return new ValidationError(messages?.formulaImageInvalid || 'Use a valid PNG or JPEG reference image.', 'image');
}

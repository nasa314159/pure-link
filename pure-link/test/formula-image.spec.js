import { deflateSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { MAX_FORMULA_IMAGE_BYTES, normalizeFormulaImage } from '../src/formula-image.js';

describe('formula reference image validation', () => {
  it('accepts PNG and strips ancillary metadata before returning ephemeral bytes', async () => {
    const source = makePng(2, 1, [['tEXt', new TextEncoder().encode('Comment\0private-note')]]);
    const result = await normalizeFormulaImage(file(source, 'image/png'));
    expect(result.mimeType).toBe('image/png');
    expect(result.bytes.byteLength).toBeLessThan(source.length);
    expect(new TextDecoder().decode(result.bytes)).not.toContain('private-note');
    expect(Array.from(result.bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });

  it('accepts JPEG and strips EXIF and comment application segments without decoding pixels', async () => {
    const source = makeJpegWithMetadata();
    const result = await normalizeFormulaImage(file(source, 'image/jpeg'));
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.bytes.length).toBeLessThan(source.length);
    expect(new TextDecoder().decode(result.bytes)).not.toContain('GPS-PRIVATE');
    expect(Array.from(result.bytes.slice(0, 2))).toEqual([0xff, 0xd8]);
  });

  it('rejects unsupported types, MIME spoofing, malformed chunks, and invalid dimensions', async () => {
    const png = makePng(1, 1);
    await expect(normalizeFormulaImage(file(png, 'image/gif'))).rejects.toMatchObject({ field: 'image' });
    await expect(normalizeFormulaImage(file(png, 'image/jpeg'))).rejects.toMatchObject({ field: 'image' });
    const badCrc = png.slice();
    badCrc[badCrc.length - 5] ^= 0xff;
    await expect(normalizeFormulaImage(file(badCrc, 'image/png'))).rejects.toMatchObject({ field: 'image' });
    await expect(normalizeFormulaImage(file(makePng(8193, 1), 'image/png'))).rejects.toMatchObject({ field: 'image' });
  });

  it('rejects oversized uploads before reading their bytes', async () => {
    const arrayBuffer = vi.fn();
    await expect(normalizeFormulaImage({ size: MAX_FORMULA_IMAGE_BYTES + 1, type: 'image/png', arrayBuffer }))
      .rejects.toMatchObject({ field: 'image' });
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it('rejects truncated or unrecognized uploads', async () => {
    await expect(normalizeFormulaImage(file(new Uint8Array([1, 2, 3, 4]), 'image/png')))
      .rejects.toMatchObject({ field: 'image' });
    await expect(normalizeFormulaImage(file(new Uint8Array(32), 'image/png')))
      .rejects.toMatchObject({ field: 'image' });
  });
});

function file(bytes, type) {
  return { size: bytes.byteLength, type, arrayBuffer: async () => bytes.slice().buffer };
}

function makePng(width, height, ancillary = []) {
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array(13);
  writeUint32(ihdr, 0, width);
  writeUint32(ihdr, 4, height);
  ihdr.set([8, 0, 0, 0, 0], 8);
  const scanline = new Uint8Array(height * (width + 1));
  for (let row = 0; row < height; row += 1) scanline[row * (width + 1)] = 0;
  const chunks = [chunk('IHDR', ihdr), ...ancillary.map(([type, data]) => chunk(type, data)), chunk('IDAT', new Uint8Array(deflateSync(scanline))), chunk('IEND', new Uint8Array())];
  return concat([signature, ...chunks]);
}

function makeJpegWithMetadata() {
  const metadata = segment(0xe1, new TextEncoder().encode('Exif\0\0GPS-PRIVATE'));
  const frame = segment(0xc0, new Uint8Array([8, 0, 1, 0, 1, 1, 1, 0x11, 0]));
  const scan = segment(0xda, new Uint8Array([1, 1, 0, 0, 63, 0]));
  return concat([new Uint8Array([0xff, 0xd8]), metadata, frame, scan, new Uint8Array([0x22, 0xff, 0x00, 0x33, 0xff, 0xd9])]);
}

function segment(marker, data) {
  const length = data.length + 2;
  return concat([new Uint8Array([0xff, marker, length >>> 8, length & 0xff]), data]);
}

function chunk(type, data) {
  const typeBytes = new TextEncoder().encode(type);
  const header = new Uint8Array(8);
  writeUint32(header, 0, data.length);
  header.set(typeBytes, 4);
  const crcInput = concat([typeBytes, data]);
  const crc = crc32(crcInput);
  const tail = new Uint8Array(4);
  writeUint32(tail, 0, crc);
  return concat([header, data, tail]);
}

function writeUint32(bytes, offset, value) {
  bytes[offset] = value >>> 24;
  bytes[offset + 1] = value >>> 16;
  bytes[offset + 2] = value >>> 8;
  bytes[offset + 3] = value;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concat(chunks) {
  const length = chunks.reduce((total, bytes) => total + bytes.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const bytes of chunks) { output.set(bytes, offset); offset += bytes.length; }
  return output;
}

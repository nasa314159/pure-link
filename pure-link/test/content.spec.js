import { describe, expect, it } from 'vitest';
import { normalizeCreateInput, normalizeUrl, suggestContentType, ValidationError } from '../src/content.js';

describe('content validation', () => {
  it('normalizes a bare hostname to HTTPS', () => {
    expect(normalizeUrl('example.com/path', false)).toBe('https://example.com/path');
  });

  it('only removes tracking parameters after explicit consent', () => {
    const original = normalizeUrl('https://example.com/?utm_source=test&keep=yes&fbclid=123', false);
    const cleaned = normalizeUrl('https://example.com/?utm_source=test&keep=yes&fbclid=123', true);
    expect(original).toContain('utm_source=test');
    expect(original).toContain('fbclid=123');
    expect(cleaned).toBe('https://example.com/?keep=yes');
  });

  it('rejects unsafe URL schemes and embedded credentials', () => {
    expect(() => normalizeUrl('javascript:alert(1)', false)).toThrow(ValidationError);
    expect(() => normalizeUrl('https://name:secret@example.com', false)).toThrow(/credentials/);
  });

  it('keeps manual content type choices authoritative', () => {
    const card = normalizeCreateInput({ contentType: 'card', content: 'example.com' });
    expect(card.contentType).toBe('card');
    expect(card.content).toBe('example.com');
  });

  it('suggests without changing the user selection', () => {
    expect(suggestContentType('example.com')).toBe('url');
    expect(suggestContentType('Energy is $E=mc^2$.')).toBe('formula');
    expect(suggestContentType('Thank you for being here.')).toBe('card');
  });

  it('validates card signatures and themes', () => {
    const card = normalizeCreateInput({
      contentType: 'card',
      content: 'Take care.',
      signature: 'PureLink',
      theme: 'mist',
    });
    expect(card.signature).toBe('PureLink');
    expect(card.theme).toBe('mist');
  });
});


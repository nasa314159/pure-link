import { describe, expect, it } from 'vitest';
import { normalizeFormulaExpression, renderFormulaContent } from '../src/formula.js';

describe('formula rendering', () => {
  it('renders a pure display formula on the server', () => {
    const html = renderFormulaContent('E=mc^2');
    expect(html).toContain('class="katex-display"');
    expect(html).toContain('mord mathnormal');
  });

  it('renders mixed text, inline math, and display math', () => {
    const html = renderFormulaContent('能量是 $E=mc^2$。\n$$\\int_0^1 x dx$$');
    expect(html).toContain('能量是');
    expect(html).toContain('<br>');
    expect(html).toContain('class="katex-display"');
  });

  it('escapes surrounding creator text', () => {
    const html = renderFormulaContent('<script>alert(1)</script> $x$');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('accepts common Unicode math input', () => {
    expect(normalizeFormulaExpression('∫₀¹ x² dx ≤ ∞')).toContain('\\int _{0}^{1} x^{2}');
    const html = renderFormulaContent('∑ₙ₌₁∞ 1÷n²');
    expect(html).toContain('class="katex-display"');
    expect(html).toContain('mop op-symbol large-op');
  });
});

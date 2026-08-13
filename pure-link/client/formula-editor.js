import katex from 'katex';
import { normalizeFormulaExpression } from '../src/formula.js';

const input = document.getElementById('content');
const preview = document.getElementById('formula-live-preview');
const emptyState = document.getElementById('formula-preview-empty');
const rendered = document.getElementById('formula-preview-rendered');

if (input && preview && rendered) {
  input.addEventListener('input', renderPreview);
  document.addEventListener('purelink:typechange', renderPreview);
  document.querySelectorAll('[data-formula-insert]').forEach((button) => {
    button.addEventListener('click', () => insertAtSelection(button.dataset.formulaInsert || '', Number(button.dataset.cursorBack || 0)));
  });
  renderPreview();
}

function insertAtSelection(value, cursorBack) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  input.setRangeText(value, start, end, 'end');
  const cursor = Math.max(start, start + value.length - cursorBack);
  input.setSelectionRange(cursor, cursor);
  input.focus();
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function renderPreview() {
  const isFormula = document.getElementById('content-type')?.value === 'formula';
  preview.hidden = !isFormula;
  if (!isFormula) return;

  const source = input.value.trim();
  rendered.replaceChildren();
  emptyState.hidden = Boolean(source);
  rendered.hidden = !source;
  if (!source) return;

  const tokens = splitDelimitedMath(source);
  if (!tokens.some((token) => token.type === 'math')) {
    appendMath(rendered, source, true);
    return;
  }

  for (const token of tokens) {
    if (token.type === 'math') {
      const span = document.createElement(token.display ? 'div' : 'span');
      appendMath(span, token.value, token.display);
      rendered.append(span);
    } else {
      appendText(rendered, token.value);
    }
  }
}

function splitDelimitedMath(source) {
  const matcher = /(\$\$[\s\S]+?\$\$|\$(?!\s)[^$\n]+?\$)/g;
  const tokens = [];
  let cursor = 0;
  for (const match of source.matchAll(matcher)) {
    if (match.index > cursor) tokens.push({ type: 'text', value: source.slice(cursor, match.index) });
    const display = match[0].startsWith('$$');
    tokens.push({ type: 'math', display, value: match[0].slice(display ? 2 : 1, display ? -2 : -1) });
    cursor = match.index + match[0].length;
  }
  if (cursor < source.length) tokens.push({ type: 'text', value: source.slice(cursor) });
  return tokens;
}

function appendMath(target, expression, displayMode) {
  katex.render(normalizeFormulaExpression(expression), target, {
    displayMode,
    output: 'html',
    throwOnError: false,
    trust: false,
    strict: 'warn',
  });
}

function appendText(target, value) {
  const lines = value.split('\n');
  lines.forEach((line, index) => {
    if (index) target.append(document.createElement('br'));
    target.append(document.createTextNode(line));
  });
}

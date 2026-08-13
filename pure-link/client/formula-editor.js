import katex from 'katex';
import { normalizeFormulaExpression } from '../src/formula.js';

const input = document.getElementById('content');
const preview = document.getElementById('formula-live-preview');
const emptyState = document.getElementById('formula-preview-empty');
const rendered = document.getElementById('formula-preview-rendered');
const customLabel = document.getElementById('custom-formula-label');
const customLatex = document.getElementById('custom-formula-latex');
const customList = document.getElementById('custom-formula-list');
const customStatus = document.getElementById('custom-formula-status');
const customAdd = document.getElementById('add-custom-formula');
const customStorageKey = 'purelink:formula-shortcuts:v1';
const customShortcutLimit = 24;

if (input && preview && rendered) {
  input.addEventListener('input', renderPreview);
  document.addEventListener('purelink:typechange', renderPreview);
  document.querySelectorAll('[data-formula-insert]').forEach((button) => {
    button.addEventListener('click', () => insertAtSelection(button.dataset.formulaInsert || '', Number(button.dataset.cursorBack || 0)));
  });
  const categoryTabs = [...document.querySelectorAll('[data-formula-category]')];
  categoryTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectCategory(tab.dataset.formulaCategory));
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? categoryTabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + categoryTabs.length) % categoryTabs.length;
      categoryTabs[nextIndex].focus();
      selectCategory(categoryTabs[nextIndex].dataset.formulaCategory);
    });
  });
  initializeCustomShortcuts();
  renderPreview();
}

function initializeCustomShortcuts() {
  if (!customLabel || !customLatex || !customList || !customAdd) return;
  let shortcuts = readCustomShortcuts();
  renderCustomShortcuts(shortcuts);

  customAdd.addEventListener('click', () => {
    const label = customLabel.value.trim();
    const latex = customLatex.value.trim();
    if (!label || !latex) return setCustomStatus('請同時填寫按鍵名稱與 LaTeX。');
    if (shortcuts.length >= customShortcutLimit) return setCustomStatus(`最多保存 ${customShortcutLimit} 個快捷鍵。`);
    shortcuts = [...shortcuts, { id: crypto.randomUUID(), label, latex }];
    if (!writeCustomShortcuts(shortcuts)) return;
    customLabel.value = '';
    customLatex.value = '';
    setCustomStatus('已只在這個瀏覽器保存。', false);
    renderCustomShortcuts(shortcuts);
  });

  customList.addEventListener('click', (event) => {
    const insertButton = event.target.closest('[data-custom-formula-insert]');
    if (insertButton) return insertAtSelection(insertButton.dataset.customFormulaInsert || '', 0);
    const removeButton = event.target.closest('[data-custom-formula-remove]');
    if (!removeButton) return;
    shortcuts = shortcuts.filter((shortcut) => shortcut.id !== removeButton.dataset.customFormulaRemove);
    if (!writeCustomShortcuts(shortcuts)) return;
    setCustomStatus('已從這個瀏覽器移除。', false);
    renderCustomShortcuts(shortcuts);
  });
}

function readCustomShortcuts() {
  try {
    const value = JSON.parse(localStorage.getItem(customStorageKey) || '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((item) => item && typeof item.id === 'string' && typeof item.label === 'string' && typeof item.latex === 'string')
      .slice(0, customShortcutLimit)
      .map((item) => ({ id: item.id, label: item.label.slice(0, 12), latex: item.latex.slice(0, 200) }));
  } catch {
    setCustomStatus('這個瀏覽器目前無法讀取自訂快捷鍵。');
    return [];
  }
}

function writeCustomShortcuts(shortcuts) {
  try {
    localStorage.setItem(customStorageKey, JSON.stringify(shortcuts));
    return true;
  } catch {
    setCustomStatus('這個瀏覽器目前不允許保存自訂快捷鍵。');
    return false;
  }
}

function renderCustomShortcuts(shortcuts) {
  customList.replaceChildren();
  for (const shortcut of shortcuts) {
    const item = document.createElement('span');
    item.className = 'custom-formula-item';
    const insert = document.createElement('button');
    insert.type = 'button';
    insert.textContent = shortcut.label;
    insert.title = shortcut.latex;
    insert.dataset.customFormulaInsert = shortcut.latex;
    insert.setAttribute('aria-label', `${shortcut.label}; insert ${shortcut.latex}`);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '×';
    remove.dataset.customFormulaRemove = shortcut.id;
    remove.setAttribute('aria-label', `移除 ${shortcut.label}`);
    item.append(insert, remove);
    customList.append(item);
  }
}

function setCustomStatus(message, isError = true) {
  if (!customStatus) return;
  customStatus.textContent = message;
  customStatus.hidden = false;
  customStatus.style.color = isError ? '' : 'var(--muted)';
}

function selectCategory(category) {
  document.querySelectorAll('[data-formula-category]').forEach((tab) => {
    const selected = tab.dataset.formulaCategory === category;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  document.querySelectorAll('[data-formula-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.formulaPanel !== category;
  });
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

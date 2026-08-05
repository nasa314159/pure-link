import katex from 'katex';
import { escapeHtml } from './http.js';

const DELIMITED_MATH = /(\$\$[\s\S]+?\$\$|\$(?!\s)[^$\n]+?\$)/g;

export function renderFormulaContent(source) {
  const content = String(source);
  const matches = [...content.matchAll(DELIMITED_MATH)];

  if (matches.length === 0) {
    return renderMath(content, true);
  }

  let cursor = 0;
  let output = '';
  for (const match of matches) {
    output += formatText(content.slice(cursor, match.index));
    const token = match[0];
    const displayMode = token.startsWith('$$');
    const expression = token.slice(displayMode ? 2 : 1, displayMode ? -2 : -1);
    output += renderMath(expression, displayMode);
    cursor = match.index + token.length;
  }
  output += formatText(content.slice(cursor));
  return output;
}

function renderMath(expression, displayMode) {
  return katex.renderToString(expression, {
    displayMode,
    output: 'html',
    throwOnError: false,
    trust: false,
    strict: 'warn',
  });
}

function formatText(value) {
  return escapeHtml(value).replaceAll('\n', '<br>');
}


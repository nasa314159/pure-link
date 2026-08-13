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
  return katex.renderToString(normalizeFormulaExpression(expression), {
    displayMode,
    output: 'html',
    throwOnError: false,
    trust: false,
    strict: 'warn',
  });
}

export function normalizeFormulaExpression(expression) {
  let normalized = String(expression);
  const symbols = new Map([
    ['−', '-'], ['×', '\\times '], ['÷', '\\div '], ['±', '\\pm '], ['∓', '\\mp '], ['√', '\\sqrt '],
    ['≤', '\\le '], ['≥', '\\ge '], ['≠', '\\ne '], ['≈', '\\approx '],
    ['≡', '\\equiv '], ['∞', '\\infty '], ['∂', '\\partial '], ['∇', '\\nabla '],
    ['∑', '\\sum '], ['∏', '\\prod '], ['∫', '\\int '], ['∈', '\\in '],
    ['∉', '\\notin '], ['⊂', '\\subset '], ['⊆', '\\subseteq '], ['∪', '\\cup '],
    ['∩', '\\cap '], ['→', '\\to '], ['←', '\\leftarrow '], ['↔', '\\leftrightarrow '],
    ['⇒', '\\Rightarrow '], ['⇔', '\\Leftrightarrow '], ['π', '\\pi '], ['θ', '\\theta '],
    ['λ', '\\lambda '], ['μ', '\\mu '], ['σ', '\\sigma '], ['φ', '\\phi '],
    ['ω', '\\omega '], ['Δ', '\\Delta '], ['Ω', '\\Omega '],
  ]);
  for (const [symbol, latex] of symbols) normalized = normalized.replaceAll(symbol, latex);

  normalized = normalized.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿ]+/g, (value) => `^{${mapScript(value, true)}}`);
  normalized = normalized.replace(/[₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ]+/g, (value) => `_{${mapScript(value, false)}}`);
  return normalized;
}

function mapScript(value, superscript) {
  const from = superscript ? '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿ' : '₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ';
  const to = superscript ? '0123456789+-=()n' : '0123456789+-=()aehijklmnoprstuvx';
  return [...value].map((character) => to[from.indexOf(character)] || character).join('');
}

function formatText(value) {
  return escapeHtml(value).replaceAll('\n', '<br>');
}

// Minimal in-test harness that runs the support page inline script against a
// tiny DOM mock. Only the methods the support script touches are implemented;
// everything else is a noop. The goal is to exercise the counter, draft, and
// submit-blocking behavior end-to-end without adding a DOM dependency.

import vm from 'node:vm';

class ClassList {
  constructor() { this._set = new Set(); }
  add(...names) { names.forEach((n) => this._set.add(n)); }
  remove(...names) { names.forEach((n) => this._set.delete(n)); }
  toggle(name, force) {
    const has = this._set.has(name);
    if (force === true) { this._set.add(name); return true; }
    if (force === false) { this._set.delete(name); return false; }
    if (has) { this._set.delete(name); return false; }
    this._set.add(name); return true;
  }
  contains(name) { return this._set.has(name); }
}

function camel(name) {
  return name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function parseSelector(selector) {
  const trimmed = String(selector).trim();
  const tokens = [];
  let i = 0;
  while (i < trimmed.length) {
    const ch = trimmed[i];
    if (ch === '*') { tokens.push({ kind: 'tag', value: '*' }); i += 1; continue; }
    if (ch === '.') {
      const m = /^[\w-]+/.exec(trimmed.slice(i + 1));
      if (m) { tokens.push({ kind: 'class', value: m[0] }); i += 1 + m[0].length; continue; }
    }
    if (ch === '#') {
      const m = /^[\w-]+/.exec(trimmed.slice(i + 1));
      if (m) { tokens.push({ kind: 'id', value: m[0] }); i += 1 + m[0].length; continue; }
    }
    if (ch === '[') {
      const m = /^\[([\w-]+)(?:=([^\]]+))?\]/.exec(trimmed.slice(i));
      if (m) {
        tokens.push({ kind: 'attr', name: m[1], value: m[2] ? m[2].replace(/^["']|["']$/g, '') : null });
        i += m[0].length;
        continue;
      }
    }
    if (/[\w-]/.test(ch)) {
      const m = /^[\w-]+/.exec(trimmed.slice(i));
      if (m) { tokens.push({ kind: 'tag', value: m[0].toLowerCase() }); i += m[0].length; continue; }
    }
    if (ch === ':') {
      const m = /^:([\w-]+)(?:\(([^)]*)\))?/.exec(trimmed.slice(i));
      if (m) {
        tokens.push({ kind: 'pseudo', value: m[1] });
        i += m[0].length;
        continue;
      }
    }
    i += 1;
  }
  return tokens;
}

function matchSelector(el, tokens) {
  if (!el || el.nodeType !== 1) return false;
  for (const t of tokens) {
    if (t.kind === 'tag') {
      if (t.value !== '*' && el.tagName.toLowerCase() !== t.value) return false;
    } else if (t.kind === 'class') {
      if (!el.classList.contains(t.value)) return false;
    } else if (t.kind === 'id') {
      if (el.attributes.id !== t.value) return false;
    } else if (t.kind === 'attr') {
      const value = el.attributes[t.name] ?? el.dataset[camel(t.name)];
      if (t.value === null) { if (value === undefined) return false; }
      else if (String(value) !== String(t.value)) return false;
    } else if (t.kind === 'pseudo') {
      if (t.value === 'checked' && !el.checked) return false;
    }
  }
  return true;
}

function walk(el, cb) {
  if (el.nodeType === 1) cb(el);
  for (const child of el.children) walk(child, cb);
}

function findAll(root, selector) {
  const tokens = parseSelector(selector);
  const results = [];
  walk(root, (el) => { if (matchSelector(el, tokens)) results.push(el); });
  return results;
}

function findFirst(root, selector) {
  const tokens = parseSelector(selector);
  let found = null;
  walk(root, (el) => { if (!found && matchSelector(el, tokens)) found = el; });
  return found;
}

function makeElement(tag, attrs = {}) {
  const el = {
    tagName: tag.toUpperCase(),
    nodeType: 1,
    children: [],
    attributes: {},
    dataset: {},
    style: {},
    listeners: {},
    hidden: false,
    disabled: false,
    checked: false,
    value: '',
    textContent: '',
    scrollHeight: 0,
    clientHeight: 0,
    parentElement: null,
    classList: new ClassList(),
    __focused: false,
  };
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') el.classList.add(...String(value).split(/\s+/).filter(Boolean));
    else if (key === 'hidden') el.hidden = Boolean(value);
    else if (key === 'disabled') el.disabled = Boolean(value);
    else if (key === 'checked') el.checked = Boolean(value);
    else el.attributes[key] = String(value);
  }
  Object.defineProperty(el, 'focused', { get() { return el.__focused; } });
  el.setAttribute = (name, value) => { el.attributes[name] = String(value); };
  el.getAttribute = (name) => (name in el.attributes ? el.attributes[name] : null);
  el.removeAttribute = (name) => { delete el.attributes[name]; };
  el.addEventListener = (event, handler) => { (el.listeners[event] ||= []).push(handler); };
  el.removeEventListener = (event, handler) => {
    el.listeners[event] = (el.listeners[event] || []).filter((h) => h !== handler);
  };
  el.dispatchEvent = (event) => {
    const path = [];
    let cur = el;
    while (cur) { path.push(cur); cur = cur.parentElement; }
    // Capture phase (no capture listeners in our mocks)
    const type = event.type;
    for (let i = path.length - 1; i >= 0; i -= 1) {
      const list = path[i].listeners[type] || [];
      for (const handler of list) handler.call(path[i], event);
    }
    return !event.defaultPrevented;
  };
  el.appendChild = (child) => { el.children.push(child); child.parentElement = el; return child; };
  el.append = el.appendChild;
  el.remove = () => {
    if (el.parentElement) el.parentElement.children = el.parentElement.children.filter((c) => c !== el);
  };
  el.focus = () => { el.__focused = true; };
  el.querySelector = (selector) => findFirst(el, selector);
  el.querySelectorAll = (selector) => findAll(el, selector);
  return el;
}

export function createSupportHarness({
  locale = 'en',
  initialMessage = '',
  sessionStorageState = {},
  turnstile = false,
  supportMessagesOverride = null,
} = {}) {
  const storage = { ...sessionStorageState };
  const sessionStorage = {
    getItem(k) { return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null; },
    setItem(k, v) { storage[k] = String(v); },
    removeItem(k) { delete storage[k]; },
    clear() { for (const k of Object.keys(storage)) delete storage[k]; },
  };

  const fetchCalls = [];
  const fetchMock = async (url, options = {}) => {
    fetchCalls.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({ checkoutUrl: 'https://example.com/redirect' }),
    };
  };

  const body = makeElement('body');
  const form = makeElement('form', { id: 'support-form' });
  body.appendChild(form);
  const button = makeElement('button', { id: 'support-button', type: 'submit' });
  form.appendChild(button);
  const status = makeElement('p', { id: 'support-status', role: 'status' });
  status.hidden = true;
  form.appendChild(status);
  const amount = makeElement('input', { id: 'support-amount', name: 'amount', type: 'number', value: '100' });
  form.appendChild(amount);
  const message = makeElement('textarea', { id: 'support-message', name: 'message', rows: '3' });
  message.value = initialMessage;
  form.appendChild(message);
  const counter = makeElement('p', { id: 'support-message-counter' });
  counter.attributes['data-limit'] = '2000';
  counter.attributes['aria-live'] = 'polite';
  counter.attributes['aria-atomic'] = 'true';
  form.appendChild(counter);
  const counterError = makeElement('p', { id: 'support-message-counter-error', role: 'alert' });
  counterError.attributes['aria-live'] = 'assertive';
  counterError.hidden = true;
  form.appendChild(counterError);
  const publicMessageCb = makeElement('input', { name: 'publicMessage', type: 'checkbox', value: 'true' });
  form.appendChild(publicMessageCb);
  const publicAmountCb = makeElement('input', { name: 'publicAmount', type: 'checkbox', value: 'true' });
  form.appendChild(publicAmountCb);
  const publicNameCb = makeElement('input', { name: 'publicName', type: 'checkbox', value: 'true' });
  form.appendChild(publicNameCb);

  const elementsById = new Map();
  for (const el of [
    ['support-form', form],
    ['support-button', button],
    ['support-status', status],
    ['support-amount', amount],
    ['support-message', message],
    ['support-message-counter', counter],
    ['support-message-counter-error', counterError],
    ['support-amount-controls', null],
    ['support-international-amount', null],
    ['support-ecpay-attribution', null],
    ['support-lemon-attribution', null],
  ]) elementsById.set(el[0], el[1]);

  const documentMock = {
    getElementById(id) { return elementsById.get(id) ?? null; },
    querySelector(selector) { return findFirst(body, selector); },
    querySelectorAll(selector) { return findAll(body, selector); },
    createElement(tag) { return makeElement(tag); },
    body,
  };

  const windowMock = {
    turnstile: turnstile ? { getResponse: () => 'turnstile-token', reset: () => {} } : undefined,
  };

  // Build a fake FormData class that gathers named inputs from the form. The
  // browser FormData accepts either no argument or an HTMLFormElement; the
  // harness provides a fake HTMLFormElement so passing `form` is supported.
  class FormDataMock {
    constructor(source) {
      this._data = source ? collectFormData(source) : collectFormData(form);
    }
    entries() { return Object.entries(this._data); }
    [Symbol.iterator]() { return Object.entries(this._data)[Symbol.iterator](); }
    get(name) { return this._data[name] ?? null; }
    has(name) { return Object.prototype.hasOwnProperty.call(this._data, name); }
  }
  function collectFormData(root) {
    const data = {};
    walk(root, (el) => {
      const name = el.attributes.name;
      if (!name) return;
      if (el.tagName === 'INPUT' && (el.attributes.type === 'checkbox' || el.attributes.type === 'radio')) {
        if (el.checked) data[name] = el.attributes.value ?? 'on';
      } else {
        data[name] = el.value;
      }
    });
    return data;
  }

  const locationMock = { assign: () => {} };

  const sandbox = {
    document: documentMock,
    sessionStorage,
    window: windowMock,
    fetch: fetchMock,
    FormData: FormDataMock,
    location: locationMock,
    Math,
    JSON,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Error,
    console,
  };

  return {
    run(scriptSource) {
      vm.runInNewContext(scriptSource, sandbox, { filename: 'support-inline-script.js' });
    },
    message,
    counter,
    counterError,
    button,
    status,
    publicMessageCb,
    publicAmountCb,
    publicNameCb,
    fetchCalls,
    storage,
    sessionStorage,
    setMessage(value) {
      message.value = value;
      message.dispatchEvent({ type: 'input' });
    },
    setPublicMessage(checked) {
      publicMessageCb.checked = checked;
      publicMessageCb.dispatchEvent({ type: 'change' });
    },
    submit() {
      const event = { type: 'submit', preventDefault: () => { event._prevented = true; } };
      form.dispatchEvent(event);
      return event._prevented;
    },
    getDraft() {
      const raw = sessionStorage.getItem('purelink.supportDraft.v1');
      return raw ? JSON.parse(raw) : null;
    },
    setSessionStorage(key, value) { sessionStorage.setItem(key, value); },
    body,
    form,
    sandbox,
  };
}

export function getSupportScript(html) {
  const match = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/);
  if (!match) throw new Error('Inline script was not found.');
  return match[1];
}

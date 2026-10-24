import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderAccountPage, renderCardPage, renderFormulaPage, renderHomePage, renderLegalPage, renderManagePage, renderReportPage, renderStartPage, renderSupportPage, renderUrlPreview } from '../src/pages.js';

describe('interactive pages', () => {
  it('emits a syntactically valid creation script with its CSP nonce', () => {
    const html = renderHomePage('test-nonce');
    const script = extractScript(html);
    expect(html).toContain('nonce="test-nonce"');
    expect(html).toContain('網址');
    expect(html).toContain('公式');
    expect(html).toContain('小卡');
    expect(html).toContain('貼上 \\\\frac');
    expect(html).toContain('公式即時預覽');
    expect(html).toContain('data-formula-category="calculus"');
    expect(html).toContain('data-formula-category="matrices"');
    expect(html).toContain('data-formula-category="trigonometry"');
    expect(html).toContain('data-formula-insert="\\int ');
    expect(html).toContain('data-formula-insert="^"');
    expect(html).toContain('data-formula-insert="\\begin{bmatrix}');
    expect(html).toContain('data-formula-insert="\\operatorname{arsinh} ');
    expect(html).toContain('data-formula-insert="\\Omega"');
    expect(html).toContain('aria-label="微積分"');
    expect(html).toContain('>∂ ∫</button>');
    expect(html).toContain('>□/□</button>');
    expect(html).toContain('data-formula-insert="\\frac{a}{b}"');
    expect(html).toContain('data-formula-insert="C_{}^{}"');
    expect(html).toContain('data-formula-insert="P_{}^{}"');
    expect(html).toContain('data-formula-insert="\\Box"');
    expect(html).toContain('data-formula-insert="\\hat{H}"');
    expect(html).toContain('id="custom-formula-list"');
    expect(html).toContain('只儲存在這個瀏覽器，不會上傳到 PureLink');
    expect(html).toContain('id="formula-ai"');
    expect(html).toContain('公式生成需要登入');
    expect(html).not.toContain('>微積分</button>');
    expect(html).not.toContain('>分數</button>');
    expect(html).toContain('/assets/formula-editor.js');
    expect(html).toContain('自訂本次清理規則');
    expect(html).toContain("new URLSearchParams(location.hash.slice(1)).get('url')");
    expect(html).toContain('navigator.share');
    expect(html).toContain("document.execCommand('copy')");
    expect(html).toContain('瀏覽器不允許自動複製');
    expect(html).toContain('id="quick-open-form"');
    expect(html).toContain('id="quick-open-preview"');
    expect(html).toContain("location.assign('/' + candidate + (preview ? '+' : ''))");
    expect(html).toContain('貼上 no-no.uk/abc，或只輸入 abc');
    expect(() => new Function(script)).not.toThrow();
  });

  it('persists a creation draft in sessionStorage under a versioned key', () => {
    const script = extractScript(renderHomePage('test-nonce'));
    expect(script).toContain("const CREATE_DRAFT_KEY = 'purelink.createDraft.v1'");
    expect(script).toContain('sessionStorage.getItem(CREATE_DRAFT_KEY)');
    expect(script).toContain('sessionStorage.setItem(CREATE_DRAFT_KEY, JSON.stringify(draft))');
    expect(script).toContain('sessionStorage.removeItem(CREATE_DRAFT_KEY)');
    expect(script).not.toContain('localStorage.setItem(CREATE_DRAFT_KEY');
    expect(script).toContain("const CREATE_DRAFT_TEXT_FIELDS = ['content', 'signature', 'slug', 'trackingRemove', 'trackingKeep']");
    expect(script).toContain("const CREATE_DRAFT_CHECKBOXES = ['cleanTracking', 'isAffiliate']");
    expect(script).toContain('draft.contentType');
    expect(script).toContain('input[name="theme"]:checked');
  });

  it('saves and restores only whitelisted draft fields, failing safely on corrupt storage', () => {
    const script = extractScript(renderHomePage('test-nonce'));
    const block = script.match(/const CREATE_DRAFT_KEY = 'purelink\.createDraft\.v1';[\s\S]*?function restoreCreateDraft\(draft\) \{[\s\S]*?\n      \}/);
    expect(block).toBeTruthy();
    const factory = new Function('sessionStorage', 'document', 'form', 'content', 'contentType', 'selectType', 'updateCount', 'updateSuggestion',
      `${block[0]}\nreturn { readCreateDraft, saveCreateDraft, clearCreateDraft, restoreCreateDraft };`);

    const storage = new Map();
    const elements = {
      content: { value: 'https://example.com/watch?v=x' },
      signature: { value: ' signatures' },
      slug: { value: 'my-slug_1' },
      trackingRemove: { value: 'utm_source' },
      trackingKeep: { value: 'q' },
    };
    const documentStub = { getElementById: (id) => elements[id] || null };
    const formStub = {
      querySelector: (selector) => {
        if (selector === 'input[name="theme"]:checked') return { value: 'mist' };
        if (selector === 'input[name="cleanTracking"]') return { checked: true };
        if (selector === 'input[name="isAffiliate"]') return { checked: false };
        if (selector === 'input[name="theme"][value="mist"]') return { checked: false, wasChecked: false };
        return null;
      },
    };
    const contentTypeStub = { value: 'formula' };
    const api = factory({ getItem: (k) => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) }, documentStub, formStub, elements.content, contentTypeStub, () => {}, () => {}, () => {});

    api.saveCreateDraft();
    const saved = JSON.parse(storage.get('purelink.createDraft.v1'));
    expect(Object.keys(saved).sort()).toEqual(['cleanTracking', 'content', 'contentType', 'isAffiliate', 'signature', 'slug', 'theme', 'trackingKeep', 'trackingRemove'].sort());
    expect(saved).toMatchObject({ contentType: 'formula', theme: 'mist', content: 'https://example.com/watch?v=x', cleanTracking: true, isAffiliate: false, slug: 'my-slug_1' });

    storage.set('purelink.createDraft.v1', '{not json');
    expect(api.readCreateDraft()).toBeNull();
    storage.set('purelink.createDraft.v1', '["not","an","object"]');
    expect(api.readCreateDraft()).toBeNull();
    storage.set('purelink.createDraft.v1', '42');
    expect(api.readCreateDraft()).toBeNull();

    storage.set('purelink.createDraft.v1', JSON.stringify({
      contentType: 'card', theme: 'night', content: 'card text', signature: 'sig', slug: 'k1',
      trackingRemove: 'fbclid', trackingKeep: 'id', cleanTracking: true, isAffiliate: true, formulaAiDescription: 'd',
      managementToken: 'secret-token', managementUrl: 'https://no-no.uk/manage/x', url: 'https://no-no.uk/k1', turnstileToken: 'tok', user: 'attacker',
    }));
    const restored = api.readCreateDraft();
    expect(restored).toEqual({ contentType: 'card', theme: 'night', content: 'card text', signature: 'sig', slug: 'k1', trackingRemove: 'fbclid', trackingKeep: 'id', cleanTracking: true, isAffiliate: true });
    expect(JSON.stringify(restored)).not.toContain('secret-token');

    const calls = [];
    const selectSpy = (type) => calls.push(type);
    const api2 = factory({ getItem: () => null, setItem: () => {}, removeItem: () => {} }, documentStub, formStub, elements.content, { value: 'url' }, selectSpy, () => {}, () => {});
    for (const type of ['url', 'formula', 'card']) {
      api2.restoreCreateDraft({ contentType: type, theme: null, content: 'draft body', signature: '', slug: '', trackingRemove: '', trackingKeep: '', cleanTracking: false, isAffiliate: false });
    }
    expect(calls).toEqual(['formula', 'card']);
    expect(elements.content.value).toBe('draft body');

    expect(api.clearCreateDraft()).toBeUndefined();
    expect(storage.has('purelink.createDraft.v1')).toBe(false);
  });

  it('restores the draft during initialization through the existing mode-switching code', () => {
    const script = extractScript(renderHomePage('test-nonce'));
    expect(script).toContain('const draft = readCreateDraft();');
    expect(script).toContain('if (draft) restoreCreateDraft(draft);');
    expect(script).toMatch(/selectType\('url'\);[\s\S]*?const draft = readCreateDraft\(\);/);
    expect(script).toMatch(/function restoreCreateDraft\(draft\) \{\n        if \(draft\.contentType && draft\.contentType !== 'url'\) selectType\(draft\.contentType\);/);
    expect(script).toMatch(/if \(shortcutInput\) \{[\s\S]*?content\.focus\(\);\n      \} else \{\n        const draft = readCreateDraft\(\);/);
  });

  it('clears the draft only after successful creation and never on failure', () => {
    const script = extractScript(renderHomePage('test-nonce'));
    const successIndex = script.indexOf('latestResult = result;');
    const clearIndex = script.indexOf('clearCreateDraft();');
    const catchIndex = script.indexOf('} catch (error) {');
    expect(successIndex).toBeGreaterThan(-1);
    expect(clearIndex).toBeGreaterThan(successIndex);
    expect(clearIndex).toBeLessThan(catchIndex);
    const catchBody = script.slice(catchIndex, script.indexOf('} finally {', catchIndex));
    expect(catchBody).not.toContain('clearCreateDraft');
    expect(script).toContain("localStorage.setItem('purelink:management:' + result.slug, result.managementToken)");
    expect(script.match(/const CREATE_DRAFT_KEY[\s\S]*?function restoreCreateDraft/)[0]).not.toContain('management');
  });

  it('offers an optional brand mark for formula and card PNG exports', () => {
    const formula = renderFormulaPage({ slug: 'math', content: 'x²' });
    const card = renderCardPage({ slug: 'kind', content: 'hello', theme: 'paper' });
    expect(formula).toContain('data-export-brand-toggle');
    expect(card).toContain('data-export-brand-toggle');
    expect(formula).toContain('data-copy-link');
    expect(formula).toContain('data-share-link');
    expect(card).toContain('data-copy-link');
    expect(card).toContain('data-share-link');
    expect(formula).toContain('<meta name="robots" content="noindex, nofollow, noarchive">');
    expect(card).toContain('<meta name="robots" content="noindex, nofollow, noarchive">');
  });

  it('renders Traditional Chinese action labels on the zh-Hant shared formula page', () => {
    const html = renderFormulaPage({ slug: 'math', content: 'x² + y² = z²' }, 'zh-Hant');
    expect(html).toContain('PNG 加入「PURELINK · FORMULA」');
    expect(html).toContain('可隨時取消；分享內容本身不受影響。');
    expect(html).toContain('data-copy-content>複製原始內容</button>');
    expect(html).toContain('>下載 PNG</button>');
    expect(html).toContain('data-copy-link>複製連結</button>');
    expect(html).toContain('data-share-link>分享</button>');
    expect(html).toContain('<summary>查看原始輸入（LaTeX／Unicode）</summary>');
    expect(html).toContain('>回報這個 PureLink</a>');
  });

  it('renders English action labels on the en shared formula page', () => {
    const html = renderFormulaPage({ slug: 'math', content: 'x² + y² = z²' }, 'en');
    expect(html).toContain('Add “PURELINK · FORMULA” to PNG');
    expect(html).toContain('You can turn this off at any time; the shared content is unchanged.');
    expect(html).toContain('data-copy-content>Copy source</button>');
    expect(html).toContain('>Download PNG</button>');
    expect(html).toContain('data-copy-link>Copy link</button>');
    expect(html).toContain('data-share-link>Share</button>');
    expect(html).toContain('<summary>Show original input (LaTeX / Unicode)</summary>');
    expect(html).toContain('>Report this PureLink</a>');
  });

  it('renders Traditional Chinese action labels on the zh-Hant shared card page', () => {
    const html = renderCardPage({ slug: 'kind', content: 'hello card', theme: 'paper' }, 'zh-Hant');
    expect(html).toContain('PNG 加入「PURELINK · CARD」');
    expect(html).toContain('data-copy-content>複製文字</button>');
    expect(html).toContain('>下載 PNG</button>');
    expect(html).toContain('data-copy-link>複製連結</button>');
    expect(html).toContain('data-share-link>分享</button>');
    expect(html).toContain('>回報這個 PureLink</a>');
  });

  it('renders English action labels on the en shared card page', () => {
    const html = renderCardPage({ slug: 'kind', content: 'hello card', theme: 'paper' }, 'en');
    expect(html).toContain('Add “PURELINK · CARD” to PNG');
    expect(html).toContain('data-copy-content>Copy text</button>');
    expect(html).toContain('>Download PNG</button>');
    expect(html).toContain('data-copy-link>Copy link</button>');
    expect(html).toContain('data-share-link>Share</button>');
    expect(html).toContain('>Report this PureLink</a>');
  });

  it('clamps long card content to six lines with a hidden-by-default localized Show more button', () => {
    const html = renderCardPage({ slug: 'kind', content: 'hello card', theme: 'paper' }, 'en', 'test-nonce');
    const button = html.match(/<button class="card-expand"[^>]*>/)[0];
    expect(button).toContain('hidden');
    expect(button).toContain('aria-expanded="false"');
    const controlsId = button.match(/aria-controls="([^"]+)"/)[1];
    expect(html).toContain(`class="shared-content card-copy" id="${controlsId}"`);
    const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
    const cardCopyRule = css.match(/\.card-copy \{([^}]*)\}/)[1];
    expect(cardCopyRule).toMatch(/line-clamp:\s*6/);
    expect(cardCopyRule).toMatch(/-webkit-line-clamp:\s*6/);
    expect(cardCopyRule).toContain('overflow: hidden');
    expect(cardCopyRule).toContain('white-space: pre-wrap');
    expect(cardCopyRule).toContain('word-break: break-word');
    const expandedRule = css.match(/\.card-copy-expanded, \.card-export-reveal \{([^}]*)\}/)[1];
    expect(expandedRule).toContain('line-clamp: unset');
    expect(expandedRule).toContain('-webkit-line-clamp: unset');
    expect(expandedRule).toContain('overflow: visible');
    // Supporter messages keep their own 4-line clamp.
    expect(css).toMatch(/\.supporter-message \{[^}]*-webkit-line-clamp:\s*4/);
  });

  it('localizes the card Show more / Show less button for both locales', () => {
    const zh = renderCardPage({ slug: 'kind', content: 'hello card', theme: 'paper' }, 'zh-Hant', 'test-nonce');
    const en = renderCardPage({ slug: 'kind', content: 'hello card', theme: 'paper' }, 'en', 'test-nonce');
    expect(zh).toContain('data-show-more="顯示更多" data-show-less="收合"');
    expect(zh).toMatch(/<button class="card-expand"[^>]*>顯示更多<\/button>/);
    expect(en).toContain('data-show-more="Show more" data-show-less="Show less"');
    expect(en).toMatch(/<button class="card-expand"[^>]*>Show more<\/button>/);
  });

  it('gives the card collapse ResizeObserver behavior mirroring the supporter implementation', () => {
    const html = renderCardPage({ slug: 'kind', content: 'hello card', theme: 'paper' }, 'en', 'test-nonce');
    const script = extractScript(html);
    expect(script).toContain('const evaluateCardOverflow = () => {');
    // Expanded content is never auto-collapsed by a resize.
    expect(script).toMatch(/if \(msg\.classList\.contains\('card-copy-expanded'\)\) return;/);
    // Re-evaluation is width-gated and reuses the same overflow evaluation.
    expect(script).toMatch(/let lastWidth = msg\.clientWidth;\n        const resizeObserver = new ResizeObserver\(\(\) => \{\n          if \(msg\.clientWidth === lastWidth\) return;\n          lastWidth = msg\.clientWidth;\n          evaluateCardOverflow\(\);\n        \}\);\n        resizeObserver\.observe\(msg\);/);
    // Collapsing after a resize re-checks whether the button is still needed.
    expect(script).toContain('if (isExpanded) evaluateCardOverflow();');
    expect(script).toContain("msg.classList.toggle('card-copy-expanded', !isExpanded)");
    expect(script).toContain("button.setAttribute('aria-expanded', String(!isExpanded))");
    expect(script).toContain('button.textContent = isExpanded ? button.dataset.showMore : button.dataset.showLess');
    expect(script).toContain('button.hidden = fullHeight <= collapsedHeight + 1;');
    // Graceful fallback without ResizeObserver keeps initial-load behavior.
    expect(script).toContain("if (typeof ResizeObserver !== 'function') return;");
    // No polling, mutation observers, or clone measurement.
    expect(script).not.toContain('setInterval');
    expect(script).not.toContain('MutationObserver');
    expect(script).not.toContain('cloneNode');
  });

  it('keeps card content and signature escape-equivalent with the collapse markup in place', () => {
    const content = '第一行\n<script>alert(1)</script> & "quotes" 完';
    const signature = '簽名作者';
    const escaped = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
    for (const locale of ['zh-Hant', 'en']) {
      const html = renderCardPage({ slug: 'kind', content, theme: 'paper', signature }, locale, 'test-nonce');
      expect(html).toContain(`class="shared-content card-copy" id="card-content-`);
      expect(html).toContain(`">${escaped(content)}</p>`);
      expect(html).toContain(`— ${escaped(signature)}</p>`);
      expect(html).toContain(`<textarea id="raw-content" hidden>${escaped(content)}</textarea>`);
    }
    // Formula shared pages stay untouched by the card collapse controls.
    const formula = renderFormulaPage({ slug: 'math', content: 'x²' }, 'en');
    expect(formula).not.toMatch(/<button class="card-expand"/);
    expect(formula).not.toMatch(/class="[^"]*card-copy/);
    expect(formula).not.toContain('data-show-more');
  });

  it('keeps user-supplied shared content identical across locales', () => {
    const content = 'x² + 今天的公式 = 好玩的數學 <script>alert(1)</script>';
    const signature = '簽名作者';
    const escaped = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
    for (const locale of ['zh-Hant', 'en']) {
      const html = renderCardPage({ slug: 'kind', content, theme: 'paper', signature }, locale, 'test-nonce');
      expect(html).toContain(`class="shared-content card-copy" id="card-content-`);
      expect(html).toContain(`">${escaped(content)}</p>`);
      expect(html).toContain(`— ${escaped(signature)}`);
      const formula = renderFormulaPage({ slug: 'math', content }, locale);
      expect(formula).toContain(`<textarea id="raw-content" hidden>${escaped(content)}</textarea>`);
      expect(formula).toContain(`<pre class="formula-source">${escaped(content)}</pre>`);
    }
  });

  it('wraps shared formula output in a zoom-scaling box without changing the source', () => {
    const content = 'x² + y² = z²';
    const html = renderFormulaPage({ slug: 'math', content }, 'en');
    expect(html).toMatch(/<div class="shared-content formula-rendered"><div class="formula-fit" data-formula-scale><div class="formula-box"><span class="katex-display">/);
    // Original source content stays untouched wherever it is shown.
    expect(html).toContain('<pre class="formula-source">x² + y² = z²</pre>');
    expect(html).toContain('<textarea id="raw-content" hidden>x² + y² = z²</textarea>');
    const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
    // The outer wrapper owns overflow (scrolling stays available on every
    // browser path); the inner wrapper holds the untouched render and is
    // scaled through the layout-participating zoom property.
    expect(css.match(/\.formula-fit \{([^}]*)\}/)[1]).toContain('overflow-x: auto');
    const boxRule = css.match(/\.formula-box \{([^}]*)\}/)[1];
    expect(boxRule).toContain('width: max-content');
    expect(boxRule).toContain('margin-inline: auto');
    // KaTeX keeps its natural internal size: no font-size scaling, no
    // transform scaling, no overrides of KaTeX's own rules.
    expect(css).not.toContain('--formula-scale');
    expect(css).not.toContain('transform');
    expect(css).not.toContain('formula-stretch');
    expect(css).not.toContain('.formula-box .katex');
    expect(css).not.toContain('.formula-fit .katex');
  });

  it('gates shared formula scaling to engines that render zoomed KaTeX correctly', () => {
    const contentActions = readFileSync(new URL('../client/content-actions.js', import.meta.url), 'utf8');
    const detectorSource = contentActions.match(/function isProblematicWebKitFormulaRendering\(\) \{[\s\S]*?\n\}/)?.[0];
    expect(detectorSource).toBeTruthy();
    const detector = new Function('navigator', `${detectorSource}\nreturn isProblematicWebKitFormulaRendering();`);
    const decide = (ua, maxTouchPoints = 0) => detector({ userAgent: ua, maxTouchPoints });
    const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)';
    const WEBKIT = 'AppleWebKit/605.1.15 (KHTML, like Gecko)';
    const CHROMIUM = 'AppleWebKit/537.36 (KHTML, like Gecko)';
    // Desktop Safari takes the no-scaling WebKit fallback.
    expect(decide(`${MAC} ${WEBKIT} Version/18.4 Safari/605.1.15`)).toBe(true);
    // Desktop Chromium-family browsers keep scaling.
    expect(decide(`${MAC} ${CHROMIUM} Chrome/140.0.0.0 Safari/537.36`)).toBe(false);
    expect(decide(`${MAC} ${CHROMIUM} Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0`)).toBe(false);
    // Android Chrome keeps scaling.
    expect(decide('Mozilla/5.0 (Linux; Android 14; Pixel 8) ' + CHROMIUM + ' Chrome/140.0.0.0 Mobile Safari/537.36')).toBe(false);
    // iOS/iPadOS: platform no longer implies WebKit (Apple allows entitled
    // alternative engines in the EU iOS 17.4+ / Japan iOS 26.2+). Only the
    // unambiguous WebKit Safari identity (Version token) falls back on
    // engine evidence; the detector never encodes "iPhone == WebKit".
    const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) ' + WEBKIT;
    expect(decide(`${IPHONE} Version/18.5 Mobile/15E148 Safari/604.1`)).toBe(true);
    // Third-party iOS UAs (CriOS/FxiOS…) cannot prove a non-WebKit engine;
    // they conservatively fall back (wrong scaling would corrupt the render,
    // a needless fallback only forgoes the scaling UX), not because their
    // platform is assumed to be WebKit.
    expect(decide(`${IPHONE} CriOS/140.0.7339.60 Mobile/15E148 Safari/604.1`)).toBe(true);
    expect(decide(`${IPHONE} FxiOS/141.0 Mobile/15E148 Safari/605.1.15`)).toBe(true);
    // iPadOS desktop-site UAs masquerade as Macs; touch points reveal them.
    expect(decide(`${MAC} ${CHROMIUM} Chrome/140.0.0.0 Safari/537.36`, 5)).toBe(true);
    // Desktop Firefox is not targeted by the WebKit gate.
    expect(decide(`${MAC} Gecko/20100101 Firefox/141.0`)).toBe(false);
  });

  it('switches visual rendering to native MathML exactly on macOS desktop Safari, and keeps every other engine on KaTeX HTML', () => {
    const contentActions = readFileSync(new URL('../client/content-actions.js', import.meta.url), 'utf8');
    const detectorSource = contentActions.match(/function isMacDesktopSafariFormulaFallback\(\) \{[\s\S]*?\n\}/)?.[0];
    expect(detectorSource).toBeTruthy();
    const detector = new Function('navigator', `${detectorSource}\nreturn isMacDesktopSafariFormulaFallback();`);
    const decide = (ua, maxTouchPoints = 1) => detector({ userAgent: ua, maxTouchPoints });
    const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)';
    const WEBKIT = 'AppleWebKit/605.1.15 (KHTML, like Gecko)';
    const CHROMIUM = 'AppleWebKit/537.36 (KHTML, like Gecko)';
    // The QA-proven broken engine takes the MathML fallback.
    expect(decide(`${MAC} ${WEBKIT} Version/26.6.1 Safari/605.1.15`)).toBe(true);
    // macOS Chrome on identical Chromium UA tokens stays on KaTeX HTML.
    expect(decide(`${MAC} ${CHROMIUM} Chrome/140.0.0.0 Safari/537.36`)).toBe(false);
    expect(decide(`${MAC} ${CHROMIUM} Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0`)).toBe(false);
    // macOS Firefox never carries the Safari/Version pair.
    expect(decide(`${MAC} Gecko/20100101 Firefox/141.0`)).toBe(false);
    // iOS Safari renders KaTeX HTML correctly and must stay on it.
    const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) ' + WEBKIT;
    expect(decide(`${IPHONE} Version/18.5 Mobile/15E148 Safari/604.1`)).toBe(false);
    expect(decide(`${IPHONE} CriOS/140.0.7339.60 Mobile/15E148 Safari/604.1`)).toBe(false);
    // iPadOS "request desktop site" masquerades as a Mac; touch points catch it.
    expect(decide(`${MAC} ${WEBKIT} Version/18.5 Mobile Safari/605.1.15`, 5)).toBe(false);
    expect(decide(`${MAC} ${CHROMIUM} Chrome/140.0.0.0 Safari/537.36`, 5)).toBe(false);
  });

  it('applies the MathML fallback root class only when the macOS Safari predicate matches, and suppresses it for PNG capture', () => {
    const contentActions = readFileSync(new URL('../client/content-actions.js', import.meta.url), 'utf8');
    expect(contentActions).toContain("const formulaNativeMathmlClass = 'formula-native-mathml'");
    // The class is applied to <html> exactly when the fallback predicate holds.
    const flat = contentActions
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/[^\n]*/g, ' ')
      .replace(/\s+/g, ' ');
    expect(flat).toContain('const formulaNativeMathmlFallback = isMacDesktopSafariFormulaFallback(); if (formulaNativeMathmlFallback) { document.documentElement.classList.add(formulaNativeMathmlClass); }');
    // The class is added to <html> exactly when the fallback predicate holds,
    // and is removed/restored only on the PNG lifecycle. Adds: init + capture
    // restore; removals: capture suppression only.
    expect(contentActions.match(/classList\.add\(formulaNativeMathmlClass\)/g)).toHaveLength(2);
    expect(contentActions.match(/classList\.remove\(formulaNativeMathmlClass\)/g)).toHaveLength(1);
    expect(flat).toContain('document.documentElement.classList.remove(formulaNativeMathmlClass)');
    // removal must happen before the capture (the same segment that already
    // resets the zoom), and the restore afterwards must be engine-guarded.
    const exportIndex = flat.indexOf("querySelector('[data-download-png]')");
    const captureIndex = flat.indexOf('toPng(captureTarget,');
    const removeIndex = flat.indexOf('classList.remove(formulaNativeMathmlClass)', exportIndex);
    expect(removeIndex).toBeGreaterThan(-1);
    expect(removeIndex).toBeLessThan(captureIndex);
    const restoreCapture = flat.match(/finally \{ [\s\S]*?\} \}/)?.[0];
    expect(restoreCapture).toContain('if (formulaNativeMathmlFallback) { document.documentElement.classList.add(formulaNativeMathmlClass); }');
    expect(flat.indexOf('classList.remove(formulaNativeMathmlClass)', removeIndex + 1)).toBe(-1);
  });

  it('scopes the native MathML fallback CSS to rendered formulas under the root fallback class', () => {
    const html = renderFormulaPage({ slug: 'math', content: 'x²' }, 'en');
    const css = html
      .match(/<style>([\s\S]*?)<\/style>/)[1]
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\s+/g, ' ');
    // Every rule that touches KaTeX internals lives inside the fallback scope.
    const kaTeXSelectors = [...css.matchAll(/([^{}]*\.katex[^{}]*)\{/g)].map((rule) => rule[1].trim());
    expect(kaTeXSelectors).toHaveLength(2);
    expect(kaTeXSelectors).toContain('.formula-native-mathml .formula-rendered .katex-html');
    expect(kaTeXSelectors).toContain('.formula-native-mathml .formula-rendered .katex-mathml');
    // The fallback swaps the visual branch: HTML branch hidden, MathML branch
    // un-hides by undoing KaTeX's sr-only hiding exactly.
    expect(css).toContain('.formula-native-mathml .formula-rendered .katex-html { display: none; }');
    const mathmlRule = css.match(/\.formula-native-mathml \.formula-rendered \.katex-mathml \{([^}]*)\}/)[1];
    for (const property of ['position: static', 'clip: auto', 'width: auto', 'height: auto', 'overflow: visible', 'padding: 0', 'border: 0']) {
      expect(mathmlRule).toContain(property);
    }
    // No engine-specific offsets, transforms, or scaling inside the fallback.
    expect(mathmlRule).not.toMatch(/left|top|translate|transform|zoom/);
  });

  it('ships both KaTeX branches on shared Formula pages', () => {
    const html = renderFormulaPage({ slug: 'math', content: '\\int_0^\\infty f(x)\\,dx' }, 'en');
    expect(html).toContain('class="katex-mathml"');
    expect(html).toContain('<math xmlns="http://www.w3.org/1998/Math/MathML"');
    // The visually rendered HTML branch (and its aria-hidden accessibility
    // separation) is untouched; the screen-reader MathML tree is extra.
    expect(html).toContain('<span class="katex-html" aria-hidden="true">');
    expect(html).toContain('mop op-symbol large-op');
    expect(html.indexOf('katex-mathml')).toBeLessThan(html.indexOf('katex-html'));
  });

  it('zooms the rendered formula to a readability floor on scaling engines with a WebKit fallback, without affecting cards', () => {
    const contentActions = readFileSync(new URL('../client/content-actions.js', import.meta.url), 'utf8');
    expect(contentActions).toContain('const FORMULA_MIN_SCALE = 0.7');
    expect(contentActions).toMatch(/Math\.max\(FORMULA_MIN_SCALE, Math\.min\(1, availableWidth \/ naturalWidth\)\)/);
    // offsetWidth/clientWidth report the box in its own coordinate space and
    // exclude the zoom effect, so the natural width stays measurable while
    // zoomed.
    expect(contentActions).toContain('formulaBox.offsetWidth');
    expect(contentActions).toContain('formulaFit.clientWidth');
    expect(contentActions).toMatch(/formulaBox\.style\.zoom = String\(Math\.floor\(scale \* 1000\) \/ 1000\)/);
    expect(contentActions).toContain("removeProperty('zoom')");
    expect(contentActions).toMatch(/const formulaResizeObserver = new ResizeObserver/);
    expect(contentActions).toContain('formulaResizeObserver.observe(formulaFit)');
    // The WebKit fallback runs before any measurement and never scales.
    expect(contentActions).toMatch(/if \(formulaScalingBlocked\) \{\n[\s\S]*?formulaBox\.style\.removeProperty\('zoom'\);\n[\s\S]*?return;/);
    expect(contentActions).toMatch(/typeof ResizeObserver === 'function' && !formulaScalingBlocked/);
    expect(contentActions).not.toContain('setInterval');
    expect(contentActions).not.toContain('MutationObserver');
    // No font-size or transform scaling is introduced on any path.
    expect(contentActions).not.toContain('--formula-scale');
    expect(contentActions).not.toContain('style.transform');
    expect(contentActions).not.toContain('style.fontSize');
    // PNG capture neutralizes the zoom before capture and re-fits after.
    const exportIndex = contentActions.indexOf("querySelector('[data-download-png]')");
    const captureIndex = contentActions.indexOf('toPng(captureTarget');
    const resetIndex = contentActions.indexOf('scaledFormulas.forEach(resetFormulaDisplay);', exportIndex);
    const reFitIndex = contentActions.indexOf('fitFormulaToWidth();', captureIndex);
    expect(resetIndex).toBeGreaterThan(-1);
    expect(resetIndex).toBeLessThan(captureIndex);
    expect(reFitIndex).toBeGreaterThan(captureIndex);
    expect(contentActions).toContain("removeProperty('zoom')");
    // Card shared pages carry no formula scaler markup; the shared-page
    // behavior lives in the bundle's [data-formula-scale] guard.
    const card = renderCardPage({ slug: 'kind', content: 'hello', theme: 'paper' }, 'en', 'test-nonce');
    expect(card).not.toContain('data-formula-scale');
    expect(card).not.toContain('class="formula-fit"');
  });

  it('expands overflowing formula wrappers and the export root to natural width for the PNG capture only', () => {
    const contentActions = readFileSync(new URL('../client/content-actions.js', import.meta.url), 'utf8');
    const flat = contentActions
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/[^\n]*/g, ' ')
      .replace(/\s+/g, ' ');
    const expandSource = contentActions.match(/function expandFormulaCapture\(fits\) \{[\s\S]*?\n\}/)?.[0];
    expect(expandSource).toBeTruthy();
    // The expansion is invoked only inside the export lifecycle, after the
    // zoom reset and the MathML suppression, once the fonts have settled,
    // and strictly before toPng measures the capture box.
    const exportIndex = flat.indexOf("querySelector('[data-download-png]')");
    const resetIndex = flat.indexOf('scaledFormulas.forEach(resetFormulaDisplay);', exportIndex);
    const suppressIndex = flat.indexOf('classList.remove(formulaNativeMathmlClass)', resetIndex);
    const fontsIndex = flat.indexOf('await document.fonts.ready', exportIndex);
    const expandIndex = flat.indexOf('restoreCaptureGeometry = expandFormulaCapture(scaledFormulas);', exportIndex);
    const captureIndex = flat.indexOf('toPng(captureTarget,', exportIndex);
    expect(exportIndex).toBeGreaterThan(-1);
    expect(resetIndex).toBeGreaterThan(exportIndex);
    expect(suppressIndex).toBeGreaterThan(resetIndex);
    expect(fontsIndex).toBeGreaterThan(suppressIndex);
    expect(expandIndex).toBeGreaterThan(fontsIndex);
    expect(captureIndex).toBeGreaterThan(expandIndex);
    // Conditional: only wrappers that genuinely overflow their panel
    // (scrollWidth beyond clientWidth, html-to-image's blind spot) widen;
    // narrow formulas and card pages are skipped before any inline style is
    // touched, so today's capture is kept exactly for them.
    expect(expandSource).toContain('if (!fit || fit.scrollWidth <= fit.clientWidth) return;');
    expect(expandSource).toContain('if (expandedFits.length === 0) return () => {};');
    // The scroll container is dropped outright for the capture: setting the
    // inline shorthand (both axes) is what makes `visible` stick — `visible`
    // alone next to the stylesheet's `overflow-y: hidden` would compute back
    // to a scroll container and paint a scrollbar into the PNG.
    expect(expandSource).toContain("fit.style.overflow = 'visible';");
    // The wrapper and the measured capture root both expand to natural
    // content width, so the captured client box covers the whole formula
    // plus the export padding instead of the visible panel cut.
    expect(expandSource).toContain("fit.style.width = 'max-content';");
    expect(expandSource).toContain("fit.closest('#share-export') ?? captureTarget");
    expect(expandSource).toContain("target.style.width = 'max-content';");
    // Purely inline-geometry: the expansion introduces no zoom, no
    // transform, no font-size effect, and no arbitrary pixel width.
    for (const forbidden of ['zoom', 'transform', 'fontSize', 'max-width', 'scrollWidth =']) {
      expect(expandSource).not.toContain(forbidden);
    }
  });

  it('restores the capture-only geometry exactly in finally, on success and failure alike', () => {
    const contentActions = readFileSync(new URL('../client/content-actions.js', import.meta.url), 'utf8');
    const flat = contentActions
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/[^\n]*/g, ' ')
      .replace(/\s+/g, ' ');
    // The restore closure is seeded as a no-op before the try, so the
    // finally below stays callable even when awaiting the fonts (or
    // anything before the expansion) throws.
    const seedIndex = flat.indexOf('let restoreCaptureGeometry = () => {};');
    const fontsIndex = flat.indexOf('await document.fonts.ready');
    expect(seedIndex).toBeGreaterThan(-1);
    expect(seedIndex).toBeLessThan(fontsIndex);
    // Exactly one restore invocation, and it lives inside the finally block
    // that runs on every path — success, the catch's error label, or
    // anything in between — so a failed capture restores the exact
    // pre-capture styles as well.
    const restoreCalls = flat.match(/restoreCaptureGeometry\(\);/g);
    expect(restoreCalls).toHaveLength(1);
    const restoreIndex = flat.indexOf('restoreCaptureGeometry();');
    const finallyIndex = flat.indexOf('} finally {', fontsIndex);
    const mathmlRestoreIndex = flat.indexOf('classList.add(formulaNativeMathmlClass)', restoreIndex);
    const reFitIndex = flat.indexOf('fitFormulaToWidth();', restoreIndex);
    expect(finallyIndex).toBeGreaterThan(-1);
    expect(restoreIndex).toBeGreaterThan(finallyIndex);
    expect(mathmlRestoreIndex).toBeGreaterThan(restoreIndex);
    expect(reFitIndex).toBeGreaterThan(mathmlRestoreIndex);
    // Restoration rewinds the whole saved inline style string of every
    // expanded element, so nothing leaks into the live page after capture.
    expect(contentActions).toContain('target.style.cssText = cssText;');
    expect(contentActions).toContain('fit.style.cssText = cssText;');
    // The MathML switch is still restored only on the engine that took it,
    // inside this same finally.
    expect(contentActions).toMatch(/if \(formulaNativeMathmlFallback\) \{/);
    const finallySegment = flat.slice(finallyIndex, reFitIndex);
    expect(finallySegment).toContain('if (formulaNativeMathmlFallback) { document.documentElement.classList.add(formulaNativeMathmlClass); }');
    expect(flat.indexOf('if (formulaNativeMathmlFallback) { document.documentElement.classList.add(formulaNativeMathmlClass); }', mathmlRestoreIndex + 1)).toBe(-1);
  });

  it('achieves the capture geometry through client inline styles only, without adding permanent page CSS', () => {
    const html = renderFormulaPage({ slug: 'math', content: 'x²' }, 'en');
    const css = html
      .match(/<style>([\s\S]*?)<\/style>/)[1]
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\s+/g, ' ');
    // The shipped geometry rules are byte-identical in intent: the fit
    // wrapper keeps its scroll container for the visible page, and the box
    // keeps its natural width — the expansion happens inline at capture
    // time and never lands in the stylesheet.
    expect(css.match(/\.formula-fit \{([^}]*)\}/)[1]).toContain('overflow-x: auto');
    expect(css.match(/\.formula-fit \{([^}]*)\}/)[1]).toContain('overflow-y: hidden');
    expect(css.match(/\.formula-box \{([^}]*)\}/)[1]).toContain('width: max-content');
    expect(css).not.toContain('formula-capture');
    expect(css).not.toContain('capture-expand');
    // The bundle never injects a stylesheet at runtime either.
    const contentActions = readFileSync(new URL('../client/content-actions.js', import.meta.url), 'utf8');
    for (const forbidden of ['insertRule', 'adoptedStyleSheets', '<style', 'append(<style']) {
      expect(contentActions).not.toContain(forbidden);
    }
    // The server markup pipeline stays out of the fix entirely.
    const pagesSource = readFileSync(new URL('../src/pages.js', import.meta.url), 'utf8');
    expect(pagesSource).not.toContain('expandFormulaCapture');
  });

  it('keeps shared-content routes unprefixed and switches locale via the /locale endpoint', () => {
    const pages = [
      ['formula', (locale) => renderFormulaPage({ slug: 'math', content: 'x²' }, locale), '/math'],
      ['card', (locale) => renderCardPage({ slug: 'kind', content: 'hello', theme: 'paper' }, locale), '/kind'],
    ];
    for (const locale of ['zh-Hant', 'en']) {
      for (const [name, render, returnTo] of pages) {
        const html = render(locale);
        expect(html).not.toMatch(new RegExp(`href="/(zh-Hant|en)/${returnTo.slice(1)}"`));
        expect(html).not.toMatch(/\/(zh-Hant|en)\/(math|kind)(?![\w-])/);
        const switcher = html.match(/<nav class="language-switcher"[\s\S]*?<\/nav>/)[0];
        expect(switcher, name).toContain('<form method="post" action="/locale">');
        expect(switcher, name).toContain(`name="locale" value="${locale}"`);
        expect(switcher, name).toContain(`name="returnTo" value="${returnTo}"`);
        expect(switcher, name).not.toContain('href="/');
      }
    }
  });

  // ---------------------------------------------------------------------------
  // iPadOS Safari PNG download delivery.
  //
  // Everything below is a static or shim-based assertion: none of it can prove
  // what a browser does with an anchor download. The real-device boundary is
  // the automatic delivery after the async capture: it is UNVERIFIED on
  // iPadOS Safari until device QA passes, and these tests must not be read as
  // claiming the file reaches the user's Files app. They only pin that the
  // shipped architecture is: one click, one validated PNG, one Blob Object
  // URL, one automatic download, one delayed revocation.
  // ---------------------------------------------------------------------------
  it('gates the Blob-object-URL download path to real iPadOS Safari identities only', () => {
    const contentActions = readFileSync(new URL('../client/content-actions.js', import.meta.url), 'utf8');
    const detectorSource = contentActions.match(/function isIpadOsSafariDownloadTarget\(\) \{[\s\S]*?\n\}/)?.[0];
    expect(detectorSource).toBeTruthy();
    const detector = new Function('navigator', `${detectorSource}\nreturn isIpadOsSafariDownloadTarget();`);
    const decide = (ua, maxTouchPoints = 0) => detector({ userAgent: ua, maxTouchPoints });
    const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)';
    const IPAD = 'Mozilla/5.0 (iPad; CPU OS 26_6 like Mac OS X)';
    const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)';
    const WEBKIT = 'AppleWebKit/605.1.15 (KHTML, like Gecko)';
    const CHROMIUM = 'AppleWebKit/537.36 (KHTML, like Gecko)';
    // Real iPadOS Safari (mobile UA and requested-desktop-site masquerade).
    expect(decide(`${IPAD} ${WEBKIT} Version/26.6 Mobile/15E148 Safari/604.1`)).toBe(true);
    expect(decide(`${MAC} ${WEBKIT} Version/26.6 Mobile/15E148 Safari/604.1`, 5)).toBe(true);
    expect(decide(`${MAC} ${WEBKIT} Version/26.6 Safari/605.1.15`, 5)).toBe(true);
    // macOS desktop Safari keeps its existing delivery (no multi-touch).
    expect(decide(`${MAC} ${WEBKIT} Version/18.4 Safari/605.1.15`, 0)).toBe(false);
    // iPad Chrome (CriOS keeps the Safari token but never the Version pair).
    expect(decide(`${IPAD} ${WEBKIT} CriOS/140.0.7339.60 Mobile/15E148 Safari/604.1`, 5)).toBe(false);
    // iPad Chrome / desktop-site masquerade (Chromium tokens).
    expect(decide(`${MAC} ${CHROMIUM} Chrome/140.0.0.0 Safari/537.36`, 5)).toBe(false);
    expect(decide(`${IPAD} ${CHROMIUM} Chrome/140.0.0.0 Mobile Safari/537.36`, 5)).toBe(false);
    // iPad Firefox, and the Firefox desktop-site masquerade.
    expect(decide(`${IPAD} ${WEBKIT} FxiOS/141.0 Mobile/15E148 Safari/605.1.15`, 5)).toBe(false);
    expect(decide(`${MAC} Gecko/20100101 Firefox/141.0`, 5)).toBe(false);
    // macOS Chrome, Android Chrome, desktop Chromium on a touchscreen device.
    expect(decide(`${MAC} ${CHROMIUM} Chrome/140.0.0.0 Safari/537.36`, 0)).toBe(false);
    expect(decide('Mozilla/5.0 (Linux; Android 14; Pixel 8) ' + CHROMIUM + ' Chrome/140.0.0.0 Mobile Safari/537.36')).toBe(false);
    expect(decide(`Mozilla/5.0 (Windows NT 10.0; Win64; x64) ${CHROMIUM} Chrome/140.0.0.0 Safari/537.36`, 5)).toBe(false);
    // iPhone Safari is not the tested target and keeps the existing delivery.
    expect(decide(`${IPHONE} ${WEBKIT} Version/18.5 Mobile/15E148 Safari/604.1`, 5)).toBe(false);
  });

  it('validates the PNG data URL conservatively before converting it to a Blob', () => {
    const contentActions = readFileSync(new URL('../client/content-actions.js', import.meta.url), 'utf8');
    const pngSource = [
      contentActions.match(/const PNG_DATA_URL_PREFIX = .*;/)?.[0],
      contentActions.match(/const PNG_SIGNATURE = .*;/)?.[0],
      contentActions.match(/function decodeValidPngDataUrl\(dataUrl\) \{[\s\S]*?\n\}/)?.[0],
      contentActions.match(/function pngBinaryToBlob\(binary\) \{[\s\S]*?\n\}/)?.[0],
    ].join('\n');
    const api = new Function(`${pngSource}\nreturn { decodeValidPngDataUrl, pngBinaryToBlob };`)();
    // A minimal well-formed PNG: 8-byte signature plus the mandatory 25-byte IHDR chunk.
    const bytes = [
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
      1, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
      0, 0, 0, 0,
    ];
    const binary = String.fromCharCode(...bytes);
    const dataUrl = `data:image/png;base64,${Buffer.from(binary, 'latin1').toString('base64')}`;
    expect(api.decodeValidPngDataUrl(dataUrl)).toBe(binary);
    const blob = api.pngBinaryToBlob(api.decodeValidPngDataUrl(dataUrl));
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBe(33);
    // Rejections: empty, the "data:," failed-capture fallback, short payloads,
    // wrong MIME, missing base64 stage, wrong signature, IHDR not first, and
    // undecodable base64. Passing is NOT claimed to prove full image validity.
    const invalidPayloads = [
      '',
      'data:',
      'data:,',
      'data:image/png;base64,',
      dataUrl.replace('image/png', 'image/jpeg'),
      dataUrl.replace('image/png', 'text/plain'),
      `data:image/png,${binary}`,
      `data:image/png;base64,${Buffer.from(binary.slice(0, 8), 'latin1').toString('base64')}`,
      `data:image/png;base64,${Buffer.from('data:image/png;base64,', 'utf8').toString('base64')}`,
      `data:image/png;base64,${Buffer.from(binary.replace('IHDR', 'IDAT'), 'latin1').toString('base64')}`,
      'data:image/png;base64,!!!',
    ];
    for (const invalidPayload of invalidPayloads) {
      expect(api.decodeValidPngDataUrl(invalidPayload)).toEqual(null);
    }
  });

  it('delivers one validated PNG per click through an attached anchor on a leased Object URL', () => {
    const contentActions = readFileSync(new URL('../client/content-actions.js', import.meta.url), 'utf8');
    const deliverySource = [
      contentActions.match(/const PNG_DATA_URL_PREFIX = .*;/)?.[0],
      contentActions.match(/const PNG_SIGNATURE = .*;/)?.[0],
      contentActions.match(/const PNG_OBJECT_URL_LEASE_MS = .*;/)?.[0],
      contentActions.match(/function decodeValidPngDataUrl\(dataUrl\) \{[\s\S]*?\n\}/)?.[0],
      contentActions.match(/function pngBinaryToBlob\(binary\) \{[\s\S]*?\n\}/)?.[0],
      contentActions.match(/function deliverPngObjectUrl\(objectUrl, filename\) \{[\s\S]*?\n\}/)?.[0],
      contentActions.match(/function deliverIpadOsSafariPng\(button, pngBinary, originalLabel\) \{[\s\S]*?\n\}/)?.[0],
    ].join('\n');
    const anchors = [];
    const timers = [];
    const revoked = [];
    const clicks = [];
    const URLStub = {
      createObjectURL: () => 'blob:test-1',
      revokeObjectURL: (url) => revoked.push(url),
    };
    const schedule = (fn, ms) => { timers.push({ fn, ms }); return 0; };
    const documentStub = {
      createElement: () => {
        const anchor = { download: '', href: '', appended: false, removed: false, clickedHref: null };
        anchor.click = () => { anchor.clickedHref = anchor.href; clicks.push(anchor.href); };
        anchor.remove = () => { anchor.removed = true; };
        anchors.push(anchor);
        return anchor;
      },
      body: { append: (element) => { element.appended = true; } },
    };
    const { deliverIpadOsSafariPng } = new Function('document', 'URL', 'setTimeout',
      `${deliverySource}\nreturn { deliverIpadOsSafariPng };`)(documentStub, URLStub, schedule);
    // A minimal well-formed PNG for the conversion leg.
    const bytes = [
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
      1, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
      0, 0, 0, 0,
    ];
    const pngBinary = String.fromCharCode(...bytes);
    const button = { dataset: {}, textContent: 'Download PNG', disabled: true };
    deliverIpadOsSafariPng(button, pngBinary, 'Download PNG');
    // Exactly one automatic download per click, through the same Blob Object
    // URL the device experiment validated, from an anchor attached to the
    // document and detached after the click.
    expect(anchors).toHaveLength(1);
    expect(anchors[0].download).toBe('purelink.png');
    expect(anchors[0].href).toBe('blob:test-1');
    expect(anchors[0].clickedHref).toBe('blob:test-1');
    expect(clicks).toEqual(['blob:test-1']);
    expect(anchors[0].appended).toBe(true);
    expect(anchors[0].removed).toBe(true);
    // Nothing is revoked while the click resolves, and no pending/armed state
    // is left on the button: the click restored the normal affordance.
    expect(revoked).toEqual([]);
    expect(button.dataset.pendingDownloadUrl).toBeUndefined();
    expect(button.dataset.pendingDownloadName).toBeUndefined();
    expect(button.dataset.exportState).toBe('success');
    expect(button.textContent).toBe('Download PNG');
    expect(button.disabled).toBe(false);
    // Exactly one delayed revocation survives, after the lease — never
    // synchronously with the click.
    expect(timers).toHaveLength(1);
    expect(timers[0].ms).toBe(60_000);
    timers[0].fn();
    expect(revoked).toEqual(['blob:test-1']);
  });

  it('fails the delivery closed so the error branch, not a broken download, is the failure path', () => {
    const contentActions = readFileSync(new URL('../client/content-actions.js', import.meta.url), 'utf8');
    const deliverySource = [
      contentActions.match(/const PNG_DATA_URL_PREFIX = .*;/)?.[0],
      contentActions.match(/const PNG_SIGNATURE = .*;/)?.[0],
      contentActions.match(/const PNG_OBJECT_URL_LEASE_MS = .*;/)?.[0],
      contentActions.match(/function decodeValidPngDataUrl\(dataUrl\) \{[\s\S]*?\n\}/)?.[0],
      contentActions.match(/function pngBinaryToBlob\(binary\) \{[\s\S]*?\n\}/)?.[0],
      contentActions.match(/function deliverPngObjectUrl\(objectUrl, filename\) \{[\s\S]*?\n\}/)?.[0],
      contentActions.match(/function deliverIpadOsSafariPng\(button, pngBinary, originalLabel\) \{[\s\S]*?\n\}/)?.[0],
    ].join('\n');
    const revoked = [];
    const URLStub = {
      createObjectURL: () => 'blob:failing',
      revokeObjectURL: (url) => revoked.push(url),
    };
    const timers = [];
    const schedule = (fn, ms) => { timers.push({ fn, ms }); return 0; };
    const failingAppend = () => {
      throw new Error('append failed');
    };
    const failingDocumentStub = {
      createElement: () => ({ download: '', href: '', click() {}, remove() {} }),
      body: { append: failingAppend },
    };
    const { deliverIpadOsSafariPng } = new Function('document', 'URL', 'setTimeout',
      `${deliverySource}\nreturn { deliverIpadOsSafariPng };`)(failingDocumentStub, URLStub, schedule);
    // A minimal well-formed PNG for the conversion leg.
    const bytes = [
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
      1, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
      0, 0, 0, 0,
    ];
    const pngBinary = String.fromCharCode(...bytes);
    const button = { dataset: {}, textContent: 'Download PNG', disabled: true };
    // A delivery that throws mid-anchoring revokes its Object URL
    // synchronously, arms no timers, and leaves the button for the handler's
    // catch (the proven error flash) instead of a half-delivered download.
    expect(() => deliverIpadOsSafariPng(button, pngBinary, 'Download PNG')).toThrow('append failed');
    expect(revoked).toEqual(['blob:failing']);
    expect(timers).toEqual([]);
    expect(button.dataset.pendingDownloadUrl).toBeUndefined();
    expect(button.dataset.exportState).toBeUndefined();
    expect(button.textContent).toBe('Download PNG');
    expect(button.disabled).toBe(true);
    const flat = contentActions.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ').replace(/\s+/g, ' ');
    expect(flat).toContain("catch { button.dataset.exportState = 'error'; button.textContent = messages.failed; } finally {");
    expect(flat).toContain("if (!pngBinary) throw new Error('The PNG export produced invalid data.'); deliverIpadOsSafariPng(button, pngBinary, originalLabel); } else {");
  });

  it('keeps every other browser on the unchanged data-URL anchor delivery behind the iPad gate', () => {
    const contentActions = readFileSync(new URL('../client/content-actions.js', import.meta.url), 'utf8');
    const flat = contentActions.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ').replace(/\s+/g, ' ');
    const exportIndex = flat.indexOf("querySelector('[data-download-png]')");
    const captureIndex = flat.indexOf('toPng(captureTarget,', exportIndex);
    const gateIndex = flat.indexOf('if (isIpadOsSafariDownloadTarget()) {', captureIndex);
    const decodeIndex = flat.indexOf('const pngBinary = decodeValidPngDataUrl(dataUrl);', captureIndex);
    const anchorIndex = flat.indexOf("const anchor = document.createElement('a');", captureIndex);
    expect(gateIndex).toBeGreaterThan(captureIndex);
    expect(decodeIndex).toBeGreaterThan(gateIndex);
    // The untouched delivery lives in the else branch of the gate, straight
    // after the only validation that applies to it.
    expect(anchorIndex).toBeGreaterThan(decodeIndex);
    expect(flat).toContain("else { const anchor = document.createElement('a'); anchor.download = button.dataset.filename || 'purelink.png'; anchor.href = dataUrl; anchor.click(); button.dataset.exportState = 'success'; button.textContent = messages.saved; } } catch {");
    // The capture pipeline is shared and untouched by the gate: same
    // html-to-image settings, same geometry expansion, same re-fit.
    expect(contentActions).toContain('pixelRatio: Math.min(window.devicePixelRatio || 1, 3),');
    expect(contentActions).toContain('backgroundColor,');
    expect(contentActions).toContain('cacheBust: false,');
    expect(contentActions.match(/restoreCaptureGeometry\(\);/g)).toHaveLength(1);
    expect(contentActions.match(/classList\.add\(formulaNativeMathmlClass\)/g)).toHaveLength(2);
    expect(contentActions.match(/classList\.remove\(formulaNativeMathmlClass\)/g)).toHaveLength(1);
  });

  it('contains no second-click state machinery and one-click delivery only', () => {
    const contentActions = readFileSync(new URL('../client/content-actions.js', import.meta.url), 'utf8');
    const flat = contentActions.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ').replace(/\s+/g, ' ');
    for (const forbidden of ['pendingDownloadUrl', 'pendingDownloadName', "'armed'", 'armPending', 'deliverPending']) {
      expect(contentActions).not.toContain(forbidden);
    }
    // "Saved" is claimed only on the untouched non-iPad data-URL branch; the
    // unobservable automatic delivery makes no persistence claim.
    expect(contentActions.match(/messages\.saved/g)).toHaveLength(1);
    expect(flat).not.toMatch(/\bfetch\(/);
    // (The server CSP itself is untouched by this change; see src/http.js.)
    // One import, one delivery helper for the iPad path.
    expect(contentActions.match(/^import /gm)).toHaveLength(1);
    expect(contentActions).toContain("import { toPng } from 'html-to-image';");
    expect(contentActions.match(/URL\.createObjectURL/g)).toHaveLength(1);
    expect(contentActions.match(/URL\.revokeObjectURL/g)).toHaveLength(2);
  });

  it('gives client content-actions localized copy for both locales', () => {
    const clientMessages = (html) => JSON.parse(html.match(/<script id="purelink-client-messages" type="application\/json">([\s\S]*?)<\/script>/)[1]).content;
    const zh = clientMessages(renderFormulaPage({ slug: 'math', content: 'x²' }, 'zh-Hant'));
    const en = clientMessages(renderFormulaPage({ slug: 'math', content: 'x²' }, 'en'));
    expect(zh).toEqual({ copied: '已複製', cannotCopy: '無法複製', copiedLink: '已複製連結', cannotShare: '無法分享', working: '正在製作…', saved: '已儲存', failed: '製作失敗' });
    expect(en).toEqual({ copied: 'Copied', cannotCopy: 'Could not copy', copiedLink: 'Copied link', cannotShare: 'Could not share', working: 'Preparing…', saved: 'Saved', failed: 'Could not create PNG' });
  });

  it('publishes descriptive homepage SEO and social preview metadata', () => {
    const html = renderHomePage('test-nonce', '', false, '', null, 'en');
    expect(html).toContain('Privacy-friendly URL shortener and formula sharing');
    expect(html).toContain('privacy-friendly URL shortener for clean short links');
    expect(html).toContain('<meta name="robots" content="index, follow">');
    expect(html).toContain('<link rel="canonical" href="https://no-no.uk/en/">');
    expect(html).toContain('hreflang="zh-Hant"');
    expect(html).toContain('hreflang="x-default"');
    expect(html).toContain('<meta property="og:image" content="https://no-no.uk/og.png?v=1">');
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg">');
    expect(html).not.toContain('name="keywords"');
  });

  it('shows a clear retry path when an OAuth attempt expires', () => {
    const html = renderHomePage('test-nonce', '', true, 'expired');
    expect(html).toContain('登入等待時間已結束');
    expect(html).toContain('href="/zh-Hant/account">重新登入');
  });

  it('keeps a sign-in entry in the top-right corner', () => {
    const signedOut = renderHomePage('test-nonce', '', true);
    const signedIn = renderHomePage('test-nonce', '', true, '', { email: 'person@example.com' });
    expect(signedOut).toContain('class="account-entry"');
    expect(signedOut).toContain('href="/auth/google?returnTo=%2Fzh-Hant%2F"');
    expect(signedOut).toContain('>登入</a>');
    expect(signedIn).toContain('href="/zh-Hant/account"');
    expect(signedIn).toContain('>我的 PureLink</a>');
    expect(signedIn).not.toContain('href="/auth/google?returnTo=%2F"');
  });

  it('shows the signed-in formula AI editor with a privacy disclosure', () => {
    const html = renderHomePage('test-nonce', '', true, '', { id: 'user-1', email: 'person@example.com' });
    expect(html).toContain('id="formula-ai-description"');
    expect(html).toContain('id="generate-formula-ai"');
    expect(html).toContain('id="use-formula-ai"');
    expect(html).toContain('id="formula-ai-image"');
    expect(html).toContain('accept="image/png,image/jpeg"');
    expect(html).toContain('id="remove-formula-ai-image"');
    expect(html).toContain('AI 供應商');
    expect(html).toContain('不會將描述、圖片或草稿保存為 AI 歷程');
    expect(html).toContain('若你選擇建立，提交的公式會依一般分享功能保存為分享內容');
    expect(html).not.toContain('Cloudflare Workers AI');
    const english = renderHomePage('test-nonce', '', true, '', { id: 'user-1', email: 'person@example.com' }, 'en');
    expect(english).toContain('＋ Add reference image (optional)');
    expect(english).toContain('if you choose Create, the selected formula is saved as shared content');
    expect(english).not.toContain('Cloudflare Workers AI');
  });

  it('shows the administrator formula allowance without changing regular accounts', () => {
    const html = renderHomePage('test-nonce', '', true, '', { id: 'admin-1', email: 'owner@example.com', is_admin: 1 });
    expect(html).toContain('每日 100 次 （管理員）');
  });

  it('uses localized catalog copy for account, management, and report interfaces', () => {
    const link = { slug: 'locale-proof', content_type: 'url', owner_user_id: 'user-1' };
    const account = renderAccountPage({ id: 'user-1', email: 'person@example.com' }, [], 0, false, '', '', 'en');
    const manage = renderManagePage(link, 'test-nonce', { id: 'user-1', email: 'person@example.com' }, true, 'en');
    const englishReport = renderReportPage('locale-proof', 'test-nonce', '', 'en');
    const chineseReport = renderReportPage('locale-proof', 'test-nonce', '', 'zh-Hant');

    expect(account).toContain('Hello, person@example.com.');
    expect(manage).toContain('Signed in with Google:');
    expect(englishReport).toContain('button.textContent = "Sending…"');
    expect(chineseReport).toContain('button.textContent = "正在送出…"');
  });

  it('sends the rendered page locale with locale-sensitive API requests', () => {
    const chineseHome = renderHomePage('test-nonce', '', false, '', null, 'zh-Hant');
    const englishHome = renderHomePage('test-nonce', '', false, '', null, 'en');
    const englishReport = renderReportPage('locale-proof', 'test-nonce', '', 'en');

    expect(chineseHome).toContain("'x-purelink-locale': \"zh-Hant\"");
    expect(englishHome).toContain("'x-purelink-locale': \"en\"");
    expect(englishReport).toContain("'x-purelink-locale': \"en\"");
  });

  it('uses localized GET links for language switching', () => {
    const chineseHome = renderHomePage('test-nonce', '', false, '', null, 'zh-Hant');
    const englishHome = renderHomePage('test-nonce', '', false, '', null, 'en');
    const chinesePrivacy = renderLegalPage('privacy', 'zh-Hant');
    const englishPrivacy = renderLegalPage('privacy', 'en');
    const englishCredits = renderLegalPage('ai-credits', 'en');

    expect(chineseHome).toContain('href="/en/"');
    expect(englishHome).toContain('href="/zh-Hant/"');
    expect(chinesePrivacy).toContain('href="/en/privacy"');
    expect(chinesePrivacy).toContain('若使用者選擇建立');
    expect(englishPrivacy).toContain('If the customer chooses Create');
    expect(englishPrivacy).toContain('provider’s retention terms apply');
    expect(englishCredits).toContain('href="/zh-Hant/ai-credits"');
    expect(chineseHome).not.toContain('<form method="post" action="/locale">');
  });

  it('localizes homepage placeholders and signed-in result recovery copy', () => {
    const english = renderHomePage('test-nonce', '', true, '', { id: 'user-1', email: 'person@example.com' }, 'en');
    const chinese = renderHomePage('test-nonce', '', true, '', null, 'zh-Hant');
    const anonymous = renderHomePage('test-nonce', '', false, '', null, 'en');
    const signedInChinese = renderHomePage('test-nonce', '', true, '', { id: 'user-1', email: 'person@example.com' }, 'zh-Hant');

    expect(english).not.toContain('例如：');
    expect(english).not.toContain('一直惦記你的我');
    expect(english).toContain('placeholder="For example: Thinking of you"');
    expect(english).toContain('placeholder="For example: campaign_id, ref_*"');
    expect(english).toContain('placeholder="For example: utm_source, ref_code"');
    expect(english).toContain('placeholder="For example: Ĥ"');
    expect(english).toContain('placeholder="For example: \\hat{H}"');
    expect(english).toContain('Saved to your PureLink account');
    expect(english).toContain('optional backup');
    expect(english).toContain('<strong id="recovery-title">Saved to your PureLink account</strong>');
    expect(english).not.toContain('<strong id="recovery-title">Save your anonymous management credential</strong>');
    expect(english).toContain('Copy backup management address');
    expect(english).toContain('Download backup recovery file');
    expect(english).toContain('Use this only as an additional recovery method. Your signed-in account remains the primary way to manage this PureLink.');
    expect(anonymous).toContain('<strong id="recovery-title">Save your anonymous management credential</strong>');
    expect(anonymous).toContain('Copy management address');
    expect(anonymous).toContain('Download recovery file');
    expect(chinese).toContain('placeholder="例如：一直惦記你的我"');
    expect(chinese).toContain('placeholder="例如：campaign_id, ref_*"');
    expect(chinese).toContain('placeholder="例如：utm_source, ref_code"');
    expect(chinese).toContain('placeholder="例如：Ĥ"');
    expect(chinese).toContain('placeholder="例如：\\hat{H}"');
    expect(signedInChinese).toContain('<strong id="recovery-title">已儲存到你的 PureLink 帳號</strong>');
    expect(signedInChinese).toContain('選用的備用管理憑證');
    expect(signedInChinese).toContain('僅作為額外復原方式。你的登入帳號仍是管理這個 PureLink 的主要方式。');
    expect(signedInChinese).toContain('複製備用管理地址');
    expect(signedInChinese).toContain('下載備用復原檔案');
    expect(signedInChinese).not.toContain('<strong id="recovery-title">請保存匿名管理憑證</strong>');
    expect(chinese).toContain('複製管理地址');
    expect(chinese).toContain('下載恢復檔案');
  });

  it('publishes review-ready AI credit information in both locales', () => {
    const credits = renderLegalPage('ai-credits', 'en');
    const chineseCredits = renderLegalPage('ai-credits', 'zh-Hant');
    const refunds = renderLegalPage('refund-policy', 'en');
    expect(credits).toContain('<html lang="en">');
    expect(credits).toContain('Last updated: September 1, 2026');
    expect(credits).toContain('PureLink AI Formula Credits');
    expect(credits).toContain('Paid AI credit purchases are currently unavailable during the public beta');
    expect(credits).toContain('Five free AI formula generations remain available daily');
    expect(credits).not.toContain('Small: 150 AI formula drafts');
    expect(credits).not.toContain('Standard: 400 AI formula drafts');
    expect(credits).not.toContain('Large: 1,000 AI formula drafts');
    expect(credits).not.toContain('legal-purchase');
    expect(credits).not.toContain('Sign in to purchase AI formula credits');
    expect(credits).toContain('No payment rail is enabled in this deployment');
    expect(credits).not.toMatch(/US\$5|US\$10|US\$20|300 AI formula generations|800 generations|2,000 generations|Creem/);
    expect(chineseCredits).toContain('<html lang="zh-Hant">');
    expect(chineseCredits).toContain('MVP 說明版本：2026-09-01');
    expect(chineseCredits).toContain('PureLink AI 公式額度');
    expect(chineseCredits).toContain('公開測試期間暫不開放付費 AI 公式額度購買；每日仍有 5 次免費 AI 公式生成');
    expect(chineseCredits).not.toContain('小型方案：150 次 AI 公式草稿');
    expect(chineseCredits).not.toContain('標準方案：400 次 AI 公式草稿');
    expect(chineseCredits).not.toContain('大型方案：1,000 次 AI 公式草稿');
    expect(chineseCredits).toContain('此部署尚未啟用任何付款方式；啟用前不會收款');
    expect(chineseCredits).toContain('href="/zh-Hant/refund-policy"');
    expect(chineseCredits).toContain('mailto:nasa3.14159@gmail.com');
    expect(chineseCredits).not.toMatch(/US\$5|US\$10|US\$20|300 次 AI 公式生成|800 次|2,000 次|Creem/);
    expect(credits).toContain('nasa3.14159@gmail.com');
    expect(refunds).toContain('<html lang="en">');
    expect(refunds).toContain('Last updated: August 14, 2026');
    expect(refunds).toContain('within 14 calendar days');
    expect(refunds).toContain('Consumed credits are generally not refundable');
  });

  it('exposes configured Taiwan payment methods without exposing their provider', () => {
    const englishDisabled = renderLegalPage('ai-credits', 'en');
    const englishEcpay = renderLegalPage('ai-credits', 'en', { ecpay: true });
    const chineseEcpay = renderLegalPage('ai-credits', 'zh-Hant', { ecpay: true });
    expect(englishDisabled).not.toContain('ECPay');
    expect(englishDisabled).not.toContain('legal-purchase');
    expect(englishEcpay).not.toContain('ECPay');
    expect(englishEcpay).not.toContain('Sign in to purchase AI formula credits');
    expect(chineseEcpay).toContain('信用卡 / Apple Pay / TWQR 等');
    expect(chineseEcpay).not.toContain('ECPay');
    expect(chineseEcpay).not.toContain('ECPay');
    expect(englishEcpay).not.toContain('信用卡 / Apple Pay / TWQR 等');
    expect(chineseEcpay).not.toContain('Credit card / Apple Pay / TWQR and more');
  });

  it('shows canonical packs and only enabled payment rails on the account page', () => {
    const disabled = renderAccountPage({ email: 'person@example.com' }, [], 12, false);
    const enabled = renderAccountPage({ email: 'person@example.com' }, [], 12, { ecpay: true, lemon: true }, 'success', 'billing-nonce', 'en');
    expect(disabled).toContain('可用購買額度：12 次');
    expect(disabled).not.toContain('data-billing-checkout');
    expect(enabled).not.toContain('data-provider="ecpay"');
    expect(enabled).not.toContain('data-pack-id');
    expect(enabled).not.toContain('data-billing-checkout');
    expect(enabled).not.toContain('NT$150');
    expect(enabled).toContain('Paid AI credit purchases are currently unavailable during the public beta');
    expect(enabled).toContain('Five free AI formula generations remain available daily');
    expect(enabled).toContain('The payment flow has returned to PureLink');
  });

  it('replaces the buying area with the neutral public-beta message in both locales', () => {
    const english = renderAccountPage({ email: 'person@example.com' }, [], 0, { ecpay: true }, '', 'billing-nonce', 'en');
    const chinese = renderAccountPage({ email: 'person@example.com' }, [], 0, { ecpay: true }, '', 'billing-nonce', 'zh-Hant');
    expect(english).toContain('Paid AI credit purchases are currently unavailable during the public beta');
    expect(chinese).toContain('公開測試期間暫不開放付費 AI 公式額度購買；每日仍有 5 次免費 AI 公式生成');
  });

  it('keeps account billing copy localized when ECPay is enabled', () => {
    const english = renderAccountPage({ email: 'person@example.com' }, [], 0, { ecpay: true }, '', 'billing-nonce', 'en');
    const chinese = renderAccountPage({ email: 'person@example.com' }, [], 0, { ecpay: true }, '', 'billing-nonce', 'zh-Hant');
    expect(english).not.toContain('台灣一次性付款');
    expect(chinese).not.toContain('Credit card / Apple Pay / TWQR and more');
  });

  it('explains that a returned checkout is pending verified server confirmation', () => {
    const english = renderAccountPage({ email: 'person@example.com' }, [], 0, { lemon: true }, 'pending', 'billing-nonce', 'en');
    const chinese = renderAccountPage({ email: 'person@example.com' }, [], 0, { ecpay: true }, 'pending', 'billing-nonce', 'zh-Hant');
    expect(english).toContain('Waiting for verified payment confirmation.');
    expect(english).toContain('Returning in this browser does not grant credits.');
    expect(english).toContain('refreshing or revisiting this page cannot duplicate credits');
    expect(chinese).toContain('正在等待已驗證的付款確認。');
    expect(chinese).toContain('重新整理或再次造訪這個頁面不會重複加入額度');
  });

  it('uses a Turnstile challenge for an enabled anonymous support checkout', () => {
    const html = renderSupportPage({ netTwd: 0, netUsdMinor: 0, contributionCount: 0, publicSupporters: [] }, { ecpay: true }, '', 'support-nonce', 'en', 'site-key');
    expect(html).toContain('data-action="support-checkout"');
    expect(html).toContain('data-sitekey="site-key"');
    expect(html).toContain('data-support-amount="100"');
    expect(html).toContain('data-support-amount="300"');
    expect(html).toContain('data-support-amount="500"');
    expect(html).toContain('data-support-amount="1000"');
    expect(html).toContain('class="selected"');
    expect(html).toContain('min="50" max="10000"');
    expect(html).toContain('name="publicName"');
    expect(html).toContain('name="publicMessage"');
    expect(html).toContain('name="publicAmount"');
    expect(html).toContain('src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer');
    expect(html).toContain('data.turnstileToken = window.turnstile?.getResponse() || \'\';');
    expect(html).toContain('Choose a support amount. Payment is completed securely through ECPay.');
    expect(html).toContain('id="support-ecpay-description"');
    expect(() => new Function(extractScript(html))).not.toThrow();
  });

  it('renders Chinese support page with correct ECPay copy', () => {
    const html = renderSupportPage({ netTwd: 0, netUsdMinor: 0, contributionCount: 0, publicSupporters: [] }, { ecpay: true }, '', 'support-nonce', 'zh-Hant', 'site-key');
    expect(html).toContain('選擇支持金額，付款將透過綠界安全結帳。');
    expect(html).toContain('data-support-amount="100"');
    expect(html).toContain('class="selected"');
  });

  it('ECPay-only mode uses hidden provider input and script handles it with fallback selector', () => {
    const html = renderSupportPage({ netTwd: 0, netUsdMinor: 0, contributionCount: 0, publicSupporters: [] }, { ecpay: true }, '', 'support-nonce', 'en', 'site-key');
    const script = extractScript(html);
    expect(html).toContain('type="hidden" name="provider" value="ecpay"');
    expect(script).toContain('querySelector(\'input[name="provider"]:checked\')');
    expect(html).toContain('aria-pressed="true"');
    expect(script).toContain('setAttribute(\'aria-pressed\',');
    expect(script).toContain('supportAmountControls.hidden = !ecpay');
  });

  it('renders only escaped opt-in support attribution and a server-provided staircase history', () => {
    const html = renderSupportPage({
      netTwd: 300, contributionCount: 1,
      publicSupporters: [{ name: '<name>', message: 'thank you @\u200Beveryone', amount: 300 }],
      history: [{ day: '2026-09-01', total: 500 }, { day: '2026-09-02', total: 300 }],
    }, {}, 'pending', 'support-nonce', 'en');
    expect(html).toContain('Returning in this browser does not record support.');
    expect(html).toContain('&lt;name&gt;');
    expect(html).not.toContain('<name>');
    expect(html).toContain('<polyline points="0,8 300,8 300,43"');
    expect(html).toContain('NT$300');
  });

  it('support textarea does not hard-limit paste but exposes a 2000-code-point counter', () => {
    const html = renderSupportPage({ netTwd: 0, netUsdMinor: 0, contributionCount: 0, publicSupporters: [] }, { ecpay: true }, '', 'support-nonce', 'en', 'site-key');
    expect(html).not.toContain('id="support-message" maxlength="2000"');
    expect(html).not.toMatch(/<textarea[^>]*id="support-message"[^>]*maxlength=/);
    expect(html).toContain('id="support-message-counter"');
    expect(html).toContain('data-limit="2000"');
    expect(html).toContain('id="support-message-counter-error"');
    expect(html).toContain('"messageCounter":"{count} / {limit}"');
    expect(html).toContain('"messageOverLimit":"Public messages must be 2000 Unicode code points or fewer."');
  });

  it('preserves newlines in multiline supporter messages with HTML escaping', () => {
    const html = renderSupportPage({
      netTwd: 100, contributionCount: 1,
      publicSupporters: [{ name: 'Tester', message: 'line one\nline two\nline three', amount: 100 }],
    }, { ecpay: true }, '', 'support-nonce', 'en');
    expect(html).toContain('line one');
    expect(html).toContain('line two');
    expect(html).toContain('line three');
    expect(html).toContain('white-space: pre-wrap');
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('onerror=');
  });

  it('renders supporter message collapse button with aria-expanded and localized labels', () => {
    const html = renderSupportPage({
      netTwd: 100, contributionCount: 1,
      publicSupporters: [{ name: 'Tester', message: 'A very long message that should be collapsible since it has many characters and multiple lines of text to make the overflow detection work properly', amount: 100 }],
    }, { ecpay: true }, '', 'support-nonce', 'en');
    expect(html).toContain('supporter-expand');
    expect(html).toContain('aria-expanded');
    expect(html).toContain('Show more');
    expect(html).toContain('data-show-more="Show more"');
    expect(html).toContain('data-show-less="Show less"');
  });

  it('renders Chinese supporter message collapse with localized labels', () => {
    const html = renderSupportPage({
      netTwd: 100, contributionCount: 1,
      publicSupporters: [{ name: '測試者', message: '這是一條很長的留言應該可以被折疊因為它有很多字元', amount: 100 }],
    }, { ecpay: true }, '', 'support-nonce', 'zh-Hant');
    expect(html).toContain('顯示更多');
    expect(html).toContain('data-show-more="顯示更多"');
    expect(html).toContain('data-show-less="收合"');
  });

  it('uses singular "contribution" for count of 1 in English', () => {
    const html = renderSupportPage({
      netTwd: 100, contributionCount: 1, publicSupporters: [],
    }, { ecpay: true }, '', 'support-nonce', 'en');
    expect(html).toContain('1 contribution</small>');
    expect(html).not.toContain('1 contributions</small>');
  });

  it('uses plural "contributions" for count greater than 1 in English', () => {
    const html = renderSupportPage({
      netTwd: 300, contributionCount: 2, publicSupporters: [],
    }, { ecpay: true }, '', 'support-nonce', 'en');
    expect(html).toContain('2 contributions</small>');
  });

  it('zh-Hant contribution copy uses NT$ consistently', () => {
    const html = renderSupportPage({
      netTwd: 500, contributionCount: 1, publicSupporters: [],
    }, { ecpay: true }, '', 'support-nonce', 'zh-Hant');
    expect(html).toContain('NT$500');
  });

  it('support script includes sessionStorage draft save/restore for allowed fields', () => {
    const html = renderSupportPage({ netTwd: 0, netUsdMinor: 0, contributionCount: 0, publicSupporters: [] }, { ecpay: true }, '', 'support-nonce', 'en', 'site-key');
    const script = extractScript(html);
    expect(script).toContain('purelink.supportDraft.v1');
    expect(script).toContain('loadDraft');
    expect(script).toContain('saveDraft');
    expect(script).toContain('sessionStorage.setItem');
    expect(script).toContain('sessionStorage.getItem');
    expect(script).toContain('draft.amount');
    expect(script).toContain('draft.displayName');
    expect(script).toContain('draft.message');
    expect(script).toContain('draft.publicName');
    expect(script).toContain('draft.publicMessage');
    expect(script).toContain('draft.publicAmount');
  });

  it('support script does not persist Turnstile token or payment data in sessionStorage draft', () => {
    const html = renderSupportPage({ netTwd: 0, netUsdMinor: 0, contributionCount: 0, publicSupporters: [] }, { ecpay: true }, '', 'support-nonce', 'en', 'site-key');
    const script = extractScript(html);
    const draftSaveSection = script.match(/const saveDraft[\s\S]*?setItem\(/)?.[0] || '';
    expect(draftSaveSection).not.toContain('draft.turnstile');
    expect(draftSaveSection).not.toContain('draft.provider');
    expect(draftSaveSection).not.toContain('draft.checkoutUrl');
    expect(script).toContain('DRAFT_FIELDS');
  });

  it('ECPay-only hidden provider mode still works with new draft and collapse features', () => {
    const html = renderSupportPage({ netTwd: 0, netUsdMinor: 0, contributionCount: 0, publicSupporters: [] }, { ecpay: true }, '', 'support-nonce', 'en', 'site-key');
    expect(html).toContain('type="hidden" name="provider" value="ecpay"');
    expect(html).not.toMatch(/<textarea[^>]*id="support-message"[^>]*maxlength=/);
    expect(html).toContain('data-limit="2000"');
    expect(html).toContain('Show more');
  });

  it('submit handler does NOT remove draft from sessionStorage', () => {
    const html = renderSupportPage({ netTwd: 0, netUsdMinor: 0, contributionCount: 0, publicSupporters: [] }, { ecpay: true }, '', 'support-nonce', 'en', 'site-key');
    const script = extractScript(html);
    const submitHandler = script.match(/supportForm\.addEventListener\('submit'[\s\S]*?\}\);/)?.[0] || '';
    expect(submitHandler).not.toContain('removeItem');
    expect(submitHandler).toContain('event.preventDefault');
  });

  it('expand button aria-controls targets an existing message element ID', () => {
    const html = renderSupportPage({
      netTwd: 100, contributionCount: 1,
      publicSupporters: [{ name: 'Tester', message: 'This is a very long message that should be collapsible since it has many characters and multiple lines of text', amount: 100 }],
    }, { ecpay: true }, '', 'support-nonce', 'en');
    const expandMatch = html.match(/aria-controls="(supporter-msg-[^"]+)"/);
    expect(expandMatch).toBeTruthy();
    const targetId = expandMatch[1];
    expect(html).toContain(`id="${targetId}"`);
  });

  it('expand button is hidden by default in server-rendered HTML', () => {
    const html = renderSupportPage({
      netTwd: 100, contributionCount: 1,
      publicSupporters: [{ name: 'Tester', message: 'This is a very long message that should be collapsible since it has many characters and multiple lines of text', amount: 100 }],
    }, { ecpay: true }, '', 'support-nonce', 'en');
    const buttonMatch = html.match(/<button[^>]*class="supporter-expand"[^>]*>/);
    expect(buttonMatch).toBeTruthy();
    expect(buttonMatch[0]).toContain('hidden');
    expect(buttonMatch[0]).toContain('aria-expanded="false"');
  });

  it('expand button has correct aria-labels and data attributes for zh-Hant', () => {
    const html = renderSupportPage({
      netTwd: 100, contributionCount: 1,
      publicSupporters: [{ name: '測試者', message: '這是一條很長的留言應該可以被折疊因為它有很多字元', amount: 100 }],
    }, { ecpay: true }, '', 'support-nonce', 'zh-Hant');
    expect(html).toContain('data-show-more="顯示更多"');
    expect(html).toContain('data-show-less="收合"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('hidden');
  });

  it('emits the supporter-message script and guards form wiring when checkout is unavailable', () => {
    const html = renderSupportPage({
      netTwd: 100, contributionCount: 1,
      publicSupporters: [{ name: 'Tester', message: 'A long supporter message that must stay collapsible even when checkout is unavailable.', amount: 100 }],
    }, {}, '', 'support-nonce', 'en');
    expect(html).toContain('Support checkout is not available yet.');
    expect(html).not.toContain('id="support-form"');
    expect(html).toContain('data-show-more="Show more"');
    const script = extractScript(html);
    expect(script).toContain("document.querySelectorAll('.supporter-message').forEach");
    expect(script).toContain('if (!supportForm) return;');
    expect(script).toContain('if (supportForm) supportForm.querySelectorAll');
    expect(script).toContain('if (supportForm) {');
  });

  it('click handler toggles supporter-message-expanded and sets aria-expanded to the new state', () => {
    const html = renderSupportPage({
      netTwd: 100, contributionCount: 1,
      publicSupporters: [{ name: 'Tester', message: 'This is a very long message that should be collapsible since it has many characters and multiple lines of text', amount: 100 }],
    }, { ecpay: true }, '', 'support-nonce', 'en');
    const script = extractScript(html);
    const clickHandler = script.match(/const button = msg\.parentElement\?\.querySelector\('\.supporter-expand'\);[\s\S]*?button\.addEventListener\('click'[\s\S]*?\}\);/)?.[0] || '';
    expect(clickHandler).toContain('classList.toggle(\'supporter-message-expanded\', !isExpanded)');
    expect(clickHandler).toContain('setAttribute(\'aria-expanded\', String(!isExpanded))');
    expect(clickHandler).toContain('isExpanded ? button.dataset.showMore : button.dataset.showLess');
  });

  it('collapses long public messages to approximately four rendered lines via line-clamp', () => {
    const html = renderSupportPage({
      netTwd: 100, contributionCount: 1,
      publicSupporters: [{ name: 'Tester', message: 'A long supporter message that should overflow four rendered lines so the collapse threshold must shrink from the previous five-line value to four lines.', amount: 100 }],
    }, { ecpay: true }, '', 'support-nonce', 'en');
    const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
    expect(styleMatch).toBeTruthy();
    const css = styleMatch[1];
    const messageRule = css.match(/\.supporter-message\s*\{([^}]*)\}/);
    expect(messageRule).toBeTruthy();
    expect(messageRule[1]).toContain('line-height: 1.55');
    // -webkit-line-clamp is the Safari-supported way to cap rendered lines.
    expect(messageRule[1]).toMatch(/-webkit-line-clamp:\s*4/);
    expect(messageRule[1]).toMatch(/line-clamp:\s*4/);
    expect(messageRule[1]).toContain('overflow: hidden');
    // The expanded variant must explicitly remove the clamp and reveal overflow
    // so the user can read the full message after clicking Show more.
    const expandedRule = css.match(/\.supporter-message-expanded\s*\{([^}]*)\}/);
    expect(expandedRule).toBeTruthy();
    expect(expandedRule[1]).toMatch(/-webkit-line-clamp:\s*unset/);
    expect(expandedRule[1]).toMatch(/line-clamp:\s*unset/);
    expect(expandedRule[1]).toContain('overflow: visible');
    expect(messageRule[1]).not.toMatch(/max-height/);
  });

  it('supporter-message uses display: -webkit-box and preserves wrapping behavior', () => {
    const html = renderSupportPage({
      netTwd: 100, contributionCount: 1,
      publicSupporters: [{ name: 'Tester', message: 'Any long supporter message that needs the collapse logic to engage.', amount: 100 }],
    }, { ecpay: true }, '', 'support-nonce', 'en');
    const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
    expect(styleMatch).toBeTruthy();
    const css = styleMatch[1];
    const messageRule = css.match(/\.supporter-message\s*\{([^}]*)\}/);
    expect(messageRule).toBeTruthy();
    // -webkit-box + -webkit-box-orient: vertical is the canonical Safari-
    // supported layout for -webkit-line-clamp. An inline (non-replaced) span
    // never produced a height-constrained box and could not be clipped.
    expect(messageRule[1]).toContain('display: -webkit-box');
    expect(messageRule[1]).toContain('-webkit-box-orient: vertical');
    // Pre-wrap + word-break must remain so newlines and long words still wrap.
    expect(messageRule[1]).toContain('white-space: pre-wrap');
    expect(messageRule[1]).toContain('word-break: break-word');
  });

  it('overflow detection lifts the clamp on the real element, then restores it', () => {
    const html = renderSupportPage({
      netTwd: 100, contributionCount: 1,
      publicSupporters: [{ name: 'Tester', message: 'A long supporter message that the clamp must engage on.', amount: 100 }],
    }, { ecpay: true }, '', 'support-nonce', 'en');
    const script = extractScript(html);
    // Safari reports a clamped scrollHeight while -webkit-line-clamp is
    // active, so the script must lift the clamp inline before measuring.
    expect(script).toContain("msg.style.webkitLineClamp = 'unset'");
    expect(script).toContain('const fullHeight = msg.scrollHeight');
    expect(script).toContain("msg.style.removeProperty('-webkit-line-clamp')");
    expect(script).toContain('const collapsedHeight = msg.clientHeight');
    expect(script).toContain('fullHeight <= collapsedHeight + 1');
  });

  it('overflow detection uses no clone or offscreen measurement helper', () => {
    const html = renderSupportPage({
      netTwd: 100, contributionCount: 1,
      publicSupporters: [{ name: 'Tester', message: 'A long supporter message that the clamp must engage on.', amount: 100 }],
    }, { ecpay: true }, '', 'support-nonce', 'en');
    const script = extractScript(html);
    expect(script).not.toContain('measureSupportMessageHeight');
    expect(script).not.toMatch(/\bclone\b/i);
    expect(script).not.toMatch(/createElement\('span'\)/);
    expect(script).not.toMatch(/visibility\s*=\s*'hidden'/);
  });

  it('registers a ResizeObserver on supporter messages and re-evaluates collapsed overflow on width change', () => {
    const html = renderSupportPage({
      netTwd: 100, contributionCount: 1,
      publicSupporters: [{ name: 'Tester', message: 'A long supporter message that the clamp must engage on.', amount: 100 }],
    }, { ecpay: true }, '', 'support-nonce', 'en');
    const script = extractScript(html);
    expect(script).toContain("if (typeof ResizeObserver !== 'function') return;");
    expect(script).toMatch(/let lastWidth = msg\.clientWidth;\n        const resizeObserver = new ResizeObserver\(\(\) => \{\n          if \(msg\.clientWidth === lastWidth\) return;\n          lastWidth = msg\.clientWidth;\n          evaluateSupporterOverflow\(\);\n        \}\);\n        resizeObserver\.observe\(msg\);/);
    // The observer callback reuses the same overflow evaluation; no polling.
    const loop = script.match(/document\.querySelectorAll\('\.supporter-message'\)\.forEach[\s\S]*?resizeObserver\.observe\(msg\);\n      \}\);/)[0];
    expect(loop).not.toContain('setInterval');
    expect(loop).not.toContain('MutationObserver');
    expect(loop).not.toContain('cloneNode');
  });

  it('expanded supporter messages stay expanded on resize and collapsing re-evaluates the button', () => {
    const html = renderSupportPage({
      netTwd: 100, contributionCount: 1,
      publicSupporters: [{ name: 'Tester', message: 'A long supporter message that the clamp must engage on.', amount: 100 }],
    }, { ecpay: true }, '', 'support-nonce', 'en');
    const script = extractScript(html);
    // While expanded, the evaluation is a no-op: Show less stays visible and the
    // message is never auto-collapsed by a resize.
    expect(script).toMatch(/const evaluateSupporterOverflow = \(\) => \{\n          \/\/ Expanded messages keep Show less visible; a resize never auto-collapses them\.\n          if \(msg\.classList\.contains\('supporter-message-expanded'\)\) return;/);
    // After the user collapses again, the button is re-checked against the
    // current width and hidden when the message now fits.
    expect(script).toContain('if (isExpanded) evaluateSupporterOverflow();');
    expect(script).toContain('button.hidden = fullHeight <= collapsedHeight + 1;');
    expect(script).toMatch(/if \(button\.hidden\) \{\n            button\.setAttribute\('aria-expanded', 'false'\);\n            button\.textContent = button\.dataset\.showMore;\n          \}/);
  });

  it('exposes a Unicode code-point counter and an over-limit error node near the message field', () => {
    const html = renderSupportPage({ netTwd: 0, netUsdMinor: 0, contributionCount: 0, publicSupporters: [] }, { ecpay: true }, '', 'support-nonce', 'en', 'site-key');
    expect(html).toContain('id="support-message-counter"');
    expect(html).toContain('data-limit="2000"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('id="support-message-counter-error"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-live="assertive"');
    expect(html).toMatch(/aria-describedby="support-message-help support-message-counter support-message-counter-error"/);
    expect(html).not.toMatch(/<textarea[^>]*id="support-message"[^>]*maxlength=/);
  });

  it('renders the counter element styling in both normal and over-limit states', () => {
    const html = renderSupportPage({ netTwd: 0, netUsdMinor: 0, contributionCount: 0, publicSupporters: [] }, { ecpay: true }, '', 'support-nonce', 'en', 'site-key');
    const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
    expect(styleMatch).toBeTruthy();
    const css = styleMatch[1];
    expect(css).toMatch(/\.field-counter\s*\{/);
    expect(css).toMatch(/\.field-counter\.is-over\s*\{/);
    expect(css).toMatch(/\.field-counter-error\s*\{/);
  });

  it('support script counts Unicode code points via Array.from and updates aria-invalid', () => {
    const html = renderSupportPage({ netTwd: 0, netUsdMinor: 0, contributionCount: 0, publicSupporters: [] }, { ecpay: true }, '', 'support-nonce', 'en', 'site-key');
    const script = extractScript(html);
    expect(script).toContain('Array.from(String(value))');
    expect(script).toContain('supportMessage.setAttribute(\'aria-invalid\'');
    expect(script).toContain('isOverLimit(supportMessage.value, limit)');
    expect(script).toContain('formatCounter(supportMessages, supportMessage.value, limit)');
    expect(script).toContain('formatOverLimitMessage(supportMessages, supportMessage.value, limit)');
    expect(script).toContain('classList.toggle(\'is-over\', over)');
    expect(script).toContain('supportMessageCounter.dataset.state = over ? \'over\' : \'ok\'');
  });

  it('submit handler blocks client-side when publicMessage is opted in and message exceeds limit', () => {
    const html = renderSupportPage({ netTwd: 0, netUsdMinor: 0, contributionCount: 0, publicSupporters: [] }, { ecpay: true }, '', 'support-nonce', 'en', 'site-key');
    const script = extractScript(html);
    const submitHandler = script.match(/supportForm\.addEventListener\('submit'[\s\S]*?\}\);/)?.[0] || '';
    expect(submitHandler).toContain('publicMessageChecked = !!supportForm.querySelector(\'input[name="publicMessage"]:checked\')');
    expect(submitHandler).toContain('messageLength = countCodePoints(supportMessage?.value || \'\')');
    expect(submitHandler).toContain('publicMessageChecked && messageLength > MESSAGE_LIMIT');
    expect(submitHandler).toContain('supportMessages.messageOverLimit');
    expect(submitHandler).toContain('return;');
  });

  it('submit handler does not block client-side when publicMessage is not opted in (over-limit allowed)', () => {
    const html = renderSupportPage({ netTwd: 0, netUsdMinor: 0, contributionCount: 0, publicSupporters: [] }, { ecpay: true }, '', 'support-nonce', 'en', 'site-key');
    const script = extractScript(html);
    const submitHandler = script.match(/supportForm\.addEventListener\('submit'[\s\S]*?\}\);/)?.[0] || '';
    // The gate is `publicMessageChecked && messageLength > MESSAGE_LIMIT` — when
    // publicMessage is unchecked, publicMessageChecked is false and the gate
    // short-circuits, leaving the existing submit flow untouched.
    const gateLine = submitHandler.match(/if\s*\(\s*publicMessageChecked\s*&&\s*messageLength\s*>\s*MESSAGE_LIMIT\s*\)/);
    expect(gateLine).toBeTruthy();
    // No unconditional over-limit check that would always block submission.
    expect(submitHandler).not.toMatch(/if\s*\(\s*messageLength\s*>\s*MESSAGE_LIMIT\s*\)/);
    expect(submitHandler).not.toMatch(/if\s*\(\s*countCodePoints[^)]*>\s*MESSAGE_LIMIT\s*\)/);
  });

  it('draft restore path recalculates the counter after restoring the textarea value', () => {
    const html = renderSupportPage({ netTwd: 0, netUsdMinor: 0, contributionCount: 0, publicSupporters: [] }, { ecpay: true }, '', 'support-nonce', 'en', 'site-key');
    const script = extractScript(html);
    // updateMessageCounter must be invoked after loadDraft so that a restored
    // over-limit draft shows the correct counter and error state.
    const loadIdx = script.indexOf('loadDraft();');
    const updateIdx = script.indexOf('updateMessageCounter();');
    expect(loadIdx).toBeGreaterThanOrEqual(0);
    expect(updateIdx).toBeGreaterThanOrEqual(0);
    expect(updateIdx).toBeGreaterThan(loadIdx);
    expect(script).toContain('supportMessage.addEventListener(\'input\', updateMessageCounter)');
  });

  it('draft save path stores the full message including over-limit text and never stores Turnstile or payment data', () => {
    const html = renderSupportPage({ netTwd: 0, netUsdMinor: 0, contributionCount: 0, publicSupporters: [] }, { ecpay: true }, '', 'support-nonce', 'en', 'site-key');
    const script = extractScript(html);
    const startIdx = script.indexOf('const saveDraft = ');
    expect(startIdx).toBeGreaterThanOrEqual(0);
    const sliceEnd = script.indexOf('};', startIdx + 100);
    expect(sliceEnd).toBeGreaterThan(startIdx);
    const saveDraft = script.slice(startIdx, sliceEnd + 2);
    expect(saveDraft).toContain('draft.message = messageInput.value');
    expect(saveDraft).not.toContain('substring(');
    expect(saveDraft).not.toContain('.slice(0, 2000)');
    expect(saveDraft).not.toContain('.slice(0,2000)');
    expect(saveDraft).not.toContain('draft.turnstile');
    expect(saveDraft).not.toContain('draft.checkoutUrl');
    expect(saveDraft).not.toContain('draft.provider');
    expect(saveDraft).not.toContain('draft.action');
    expect(saveDraft).not.toContain('draft.fields');
  });

  it('counter, over-limit error, and submit-block strings are localized for en and zh-Hant', () => {
    const en = renderSupportPage({ netTwd: 0, netUsdMinor: 0, contributionCount: 0, publicSupporters: [] }, { ecpay: true }, '', 'support-nonce', 'en', 'site-key');
    const zh = renderSupportPage({ netTwd: 0, netUsdMinor: 0, contributionCount: 0, publicSupporters: [] }, { ecpay: true }, '', 'support-nonce', 'zh-Hant', 'site-key');
    expect(en).toContain('"messageCounter":"{count} / {limit}"');
    expect(en).toContain('"messageCounterOver":"Exceeds the 2000 character limit by {count}."');
    expect(en).toContain('"messageOverLimit":"Public messages must be 2000 Unicode code points or fewer."');
    expect(zh).toContain('"messageCounter":"{count} / {limit}"');
    expect(zh).toContain('"messageCounterOver":"已超過 2000 個字元上限 {count} 個字元。"');
    expect(zh).toContain('"messageOverLimit":"公開留言不得超過 2000 個 Unicode 碼點。"');
  });

  it('loads Turnstile as a regular deferred script', () => {
    const html = renderHomePage('test-nonce', 'site-key');
    expect(html).toContain('src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer');
    expect(html).toContain('window.turnstile?.reset();');
    expect(html).not.toContain('type="module" src="https://challenges.cloudflare.com');
  });

  describe('destination preview management section', () => {
    const baseLink = { slug: 'preview-slug', content_type: 'url', content: 'https://example.com/watch?v=abc', is_affiliate: 0, created_at: '2026-09-01 00:00:00' };

    it('shows the quiet management section with its delete script only for confirmed managers', () => {
      const stranger = renderUrlPreview(baseLink, 'en');
      expect(stranger).toContain('example.com/watch?v=abc');
      expect(stranger).toContain('Continue to destination');
      expect(stranger).not.toContain('You manage this PureLink');
      expect(stranger).not.toContain('Delete this PureLink');
      expect(stranger).not.toContain('preview-delete');
      expect(stranger).not.toMatch(/<script nonce=/);

      const manager = renderUrlPreview(baseLink, 'en', { nonce: 'preview-nonce' });
      expect(manager).toContain('You manage this PureLink');
      expect(manager).toContain('Delete this PureLink');
      expect(manager).toContain('nonce="preview-nonce"');
      expect(() => new Function(extractScript(manager))).not.toThrow();
      expect(extractScript(manager)).toContain("encodeURIComponent(slug)");
      expect(extractScript(manager)).not.toContain('authorization');
    });

    it('renders the management section in the shared locale style', () => {
      const chinese = renderUrlPreview(baseLink, 'zh-Hant', { nonce: 'preview-nonce' });
      expect(chinese).toContain('你管理這個 PureLink。');
      expect(chinese).toContain('刪除這個 PureLink');
      expect(chinese).toContain('destination-url');
      expect(chinese).toContain('class="preview-manage"');
    });
  });

  describe('formula and card owner management section', () => {
    const formulaLink = { slug: 'quiet-math', content: 'x² + y² = z²', content_type: 'formula', created_at: '2026-09-01 00:00:00' };
    const cardLink = { slug: 'quiet-card', content: 'a quiet note', signature: '', theme: 'paper', content_type: 'card', created_at: '2026-09-01 00:00:00' };

    it('keeps the formula content page management-free for anonymous and stranger viewers', () => {
      const stranger = renderFormulaPage(formulaLink, 'en');
      expect(stranger).toContain('x² + y² = z²');
      expect(stranger).not.toContain('You manage this PureLink');
      expect(stranger).not.toContain('Delete this PureLink');
      expect(stranger).not.toContain('owner-delete');
      expect(stranger).not.toMatch(/<script nonce=/);

      // The shared content rendering is identical: the owner page is the
      // stranger page plus exactly the manage section and its script
      // (whitespace-normalized, since the section carries template indenting).
      const owner = renderFormulaPage(formulaLink, 'en', { nonce: 'owner-nonce' });
      const squeeze = (value) => value.replace(/\s+/g, ' ');
      expect(squeeze(
        owner
          .replace(/<section class="content-manage">[\s\S]*?<\/section>/, '')
          .replace(/<script nonce="owner-nonce">[\s\S]*?<\/script>/, ''),
      )).toBe(squeeze(stranger));
    });

    it('adds the quiet formula owner section with its delete affordance for the verified owner', () => {
      const owner = renderFormulaPage(formulaLink, 'en', { nonce: 'owner-nonce' });
      expect(owner).toContain('You manage this PureLink.');
      expect(owner).toContain('Delete this PureLink');
      expect(owner).toContain('class="content-manage"');
      expect(owner).toContain('nonce="owner-nonce"');
      const script = extractScript(owner);
      expect(() => new Function(script)).not.toThrow();
      expect(script).toContain("encodeURIComponent(slug)");
      expect(script).toContain("method: 'DELETE'");
      expect(script).not.toContain('authorization');
      expect(script).not.toContain('isOwner');
      // The section sits after the shared content actions, near the footer area.
      expect(owner.indexOf('report-link')).toBeLessThan(owner.indexOf('<section class="content-manage"'));
    });

    it('renders the content owner section in the shared locale style', () => {
      const chinese = renderFormulaPage(formulaLink, 'zh-Hant', { nonce: 'owner-nonce' });
      expect(chinese).toContain('你管理這個 PureLink。');
      expect(chinese).toContain('刪除這個 PureLink');
      expect(chinese).toContain('formula-source');
    });

    it('keeps card content and export behavior unchanged with and without the owner section', () => {
      const stranger = renderCardPage(cardLink, 'en', 'card-nonce');
      expect(stranger).toContain('a quiet note');
      expect(stranger).toContain('nonce="card-nonce"');
      expect(stranger).not.toContain('You manage this PureLink');
      expect(stranger).not.toContain('Delete this PureLink');
      expect(stranger).not.toContain('owner-delete');

      const owner = renderCardPage(cardLink, 'en', 'card-nonce', { nonce: 'card-nonce' });
      expect(owner).toContain('You manage this PureLink.');
      expect(owner).toContain('Delete this PureLink');
      expect(owner).toContain('class="content-manage"');
      // The card script keeps its collapse behavior and gains only the delete flow.
      const script = extractScript(owner);
      expect(() => new Function(script)).not.toThrow();
      expect(script).toContain('card-copy-expanded');
      expect(script).toContain("method: 'DELETE'");
      // Escaped card content is untouched.
      expect(owner).toContain('a quiet note');
    });
  });

  describe('account owner navigation targets', () => {
    const user = { id: 'user-1', email: 'person@example.com' };
    const links = [
      { slug: 'nav-url', content_type: 'url' },
      { slug: 'nav-formula', content_type: 'formula' },
      { slug: 'nav-card', content_type: 'card' },
    ];

    it('routes URL management to the destination preview and formula/card to their content pages', () => {
      const html = renderAccountPage(user, links, 0, {}, '', 'account-nonce', 'en');
      expect(html).toContain('<a href="/nav-url+">Manage</a>');
      expect(html).toContain('<a href="/nav-formula">Manage</a>');
      expect(html).toContain('<a href="/nav-card">Manage</a>');
      // The standalone manage address is no longer the account-owner entry.
      expect(html).not.toContain('/en/manage/');
      expect(html).not.toContain('manage/nav-');
    });

    it('keeps the same routing in Chinese', () => {
      const html = renderAccountPage(user, links, 0, {}, '', 'account-nonce', 'zh-Hant');
      expect(html).toContain('<a href="/nav-url+">管理</a>');
      expect(html).toContain('<a href="/nav-formula">管理</a>');
      expect(html).toContain('<a href="/nav-card">管理</a>');
      expect(html).not.toContain('/zh-Hant/manage/');
    });
  });

  describe('managed destination display', () => {
    it('shows the stored destination URL as escaped text for URL links', () => {
      const html = renderManagePage({ slug: 'dest-link', content: 'https://example.com/a?q="x<y"&b=1', content_type: 'url', owner_user_id: null }, 'manage-nonce');
      expect(html).toContain('class="managed-destination"');
      expect(html).toContain('&quot;x&lt;y&quot;');
      expect(html).not.toContain('"x<y"');
    });

    it('keeps formula and card management presentations unchanged', () => {
      const formula = renderManagePage({ slug: 'formula-link', content: 'E=mc^2', content_type: 'formula', owner_user_id: null }, 'manage-nonce');
      const card = renderManagePage({ slug: 'card-link', content: 'a card', content_type: 'card', owner_user_id: null }, 'manage-nonce');
      for (const html of [formula, card]) {
        expect(html).not.toContain('class="managed-destination"');
        expect(html).not.toContain('>Destination<');
      }
    });
  });

  it('emits a syntactically valid anonymous management script', () => {
    const html = renderManagePage({ slug: 'safe-slug', content_type: 'url', owner_user_id: null }, 'manage-nonce');
    const script = extractScript(html);
    expect(html).toContain('nonce="manage-nonce"');
    expect(() => new Function(script)).not.toThrow();
  });

  describe('anonymous recovery handoff', () => {
    const urlLink = { slug: 'handoff-url', content: 'https://example.com/watch?v=abc', content_type: 'url', is_affiliate: 0, created_at: '2026-09-01 00:00:00' };
    const formulaLink = { slug: 'handoff-formula', content: 'x² + y²', content_type: 'formula', created_at: '2026-09-01 00:00:00' };
    const cardLink = { slug: 'handoff-card', content: 'a quiet note', signature: '', theme: 'paper', content_type: 'card', created_at: '2026-09-01 00:00:00' };

    it('keeps the recovery URL fragment-based and persists verified credentials', () => {
      const html = renderManagePage(urlLink, 'manage-nonce', null, false, 'en');
      const script = extractScript(html);
      // The fragment stays the credential transport (never query, path, or server-visible state).
      expect(script).toContain("location.hash.slice(1)");
      // Persistence happens only after the fragment re-verifies against the
      // page's public fingerprint; an invalid credential is never stored.
      expect(script).toContain("localStorage.setItem(storageKey, fragmentToken)");
      expect(script).toContain("explicitCredentialValid = Boolean(publicFingerprint) && observedFragmentHash === publicFingerprint");
      // The copied management address keeps the recovery-file format.
      expect(script).toContain("'/manage/' + encodeURIComponent(slug) + '#' + token");
      expect(html).toContain('Copy management address');
      expect(html).toContain('Download recovery file');
      expect(() => new Function(script)).not.toThrow();
    });

    it('maps successful recovery onto the canonical surface of each content type', () => {
      const urlScript = extractScript(renderManagePage(urlLink, 'n1'));
      expect(urlScript).toContain('"/handoff-url+?handoff=1"');
      const formulaScript = extractScript(renderManagePage(formulaLink, 'n2'));
      expect(formulaScript).toContain('"/handoff-formula?handoff=1"');
      const cardScript = extractScript(renderManagePage(cardLink, 'n3'));
      expect(cardScript).toContain('"/handoff-card?handoff=1"');
      for (const script of [urlScript, formulaScript, cardScript]) {
        // Direct handoff after validation — no intermediate success page.
        expect(script).toContain('location.replace(canonicalDestination)');
      }
    });

    it('gates the handoff on the stored credential re-verifying against the stored hash', () => {
      const script = extractScript(renderManagePage(formulaLink, 'n1'));
      // The deciding composition: the hash-derived fingerprint must match;
      // the localStorage hit alone never owns the redirect.
      expect(script).toContain("localStorage.getItem('purelink:management:' + slug)");
      expect(script).toContain("observedHash.slice(0, 16) === publicFingerprint");
      expect(script).toContain("if (token && fingerprintMatches && !accountAccess)");
    });

    it('redirects invalid credentials nowhere and keeps the recovery error state', () => {
      const html = renderManagePage({ slug: 'gone-slug', content_type: 'formula', owner_user_id: null, management_token_hash: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }, 'n1', null, false, 'en');
      const script = extractScript(html);
      // No credential-independent redirect: without a verified match, the
      // visitor keeps the fallback page and its recovery status.
      expect(html).toContain('No anonymous management credential was found');
      expect(script).toContain("status.textContent = manageMessages.missingCredential");
    });

    it('fails closed on an explicitly wrong fragment credential, in every corrupted variant', async () => {
      const { createHash } = await import('node:crypto');
      const clientHash = (token) => createHash('sha256').update(token, 'utf8').digest('base64url');
      const CRED = 'recovered-management-credential';
      const credHash = clientHash(CRED);
      const link = { slug: 'fp-gate', content: 'E=mc²', content_type: 'formula', owner_user_id: null, management_token_hash: credHash };
      const html = renderManagePage(link, 'gate-nonce', null, false, 'en');
      const script = extractScript(html);
      // Exercise the exact inline script: replace only the asset-loader
      // boundary with the same SHA-256 base64url primitive the client uses.
      const runnable = script.replaceAll("import('/assets/hash-credential.js')", '__hashModule()');

      const run = async (fragment, storedItems = {}) => {
        const store = new Map(Object.entries(storedItems));
        const storageStub = { getItem: (key) => (store.has(key) ? store.get(key) : null), setItem: (key, value) => { store.set(key, String(value)); } };
        const replacements = [];
        const elements = new Map();
        const element = () => ({ hidden: false, textContent: '', disabled: false, addEventListener() {} });
        const documentStub = { getElementById: () => element() };
        const locationStub = { hash: fragment, origin: 'https://no-no.uk', pathname: '/manage/fp-gate', search: '', replace: (target) => replacements.push(target) };
        const factory = new Function('__hashModule', 'document', 'localStorage', 'location', 'navigator', runnable);
        factory(() => Promise.resolve({ hashManagementToken: clientHash }), documentStub, storageStub, locationStub, { clipboard: {} });
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { store, replacements };
      };

      // 1. Correct explicit credential: succeeds and hands off to the
      // canonical surface (unchanged CASE A behavior).
      const valid = await run(`#${CRED}`, { 'purelink:management:fp-gate': 'stale-previous-value' });
      expect(valid.replacements).toEqual(['/fp-gate?handoff=1']);
      expect(valid.store.get('purelink:management:fp-gate')).toBe(CRED);
      // 1b. No stored credential either: handoff still happens.
      const fresh = await run(`#${CRED}`);
      expect(fresh.replacements).toEqual(['/fp-gate?handoff=1']);
      expect(fresh.store.get('purelink:management:fp-gate')).toBe(CRED);

      // 2-4. Wrong / one-character-short / one-character-mutated explicit
      // credentials all fail closed: no handoff, explicit invalid state,
      // and the previously stored credential is preserved, never clobbered.
      const variants = {
        wrong: `${CRED}-not`,
        short: CRED.slice(0, -1),
        mutated: `${CRED.slice(0, -1)}X`,
      };
      for (const [label, fragment] of Object.entries(variants)) {
        const result = await run(`#${fragment}`);
        expect(result.replacements, label).toEqual([]);
        expect(result.store.get('purelink:management:fp-gate'), label).toBeUndefined();
        const resultWithStored = await run(`#${fragment}`, { 'purelink:management:fp-gate': CRED });
        // 5. Explicit fragment is authoritative: a valid stored credential
        // is NEVER substituted for the failed verification, and is left
        // untouched so a later correct recovery still works.
        expect(resultWithStored.replacements, label).toEqual([]);
        expect(resultWithStored.store.get('purelink:management:fp-gate'), label).toBe(CRED);
      }

      // 6. Missing fragment + valid localStorage credential: the existing
      // recovery semantics still hand off (missing never means invalid).
      const storedOnly = await run('', { 'purelink:management:fp-gate': CRED });
      expect(storedOnly.replacements).toEqual(['/fp-gate?handoff=1']);
      // 7. Missing fragment + no stored credential: explicit missing state.
      const missing = await run('');
      expect(missing.replacements).toEqual([]);
      // 8. Localized invalid message is wired for both locales.
      expect(html).toContain('This management credential is invalid.');
      const zhHtml = renderManagePage(link, 'gate-nonce', null, false, 'zh-Hant');
      expect(zhHtml).toContain('此管理憑證無效。');
    });

    it('keeps signed-in owner behavior unchanged while failing closed on a corrupted fragment', async () => {
      const { createHash } = await import('node:crypto');
      const clientHash = (token) => createHash('sha256').update(token, 'utf8').digest('base64url');
      const CRED = 'owner-session-credential';
      const credHash = clientHash(CRED);
      const owner = { id: 'user-1', email: 'owner@example.com' };
      const link = { slug: 'fp-owner', content: 'E=mc²', content_type: 'formula', owner_user_id: 'user-1', management_token_hash: credHash };
      const script = extractScript(renderManagePage(link, 'n1', owner, true, 'en')).replaceAll("import('/assets/hash-credential.js')", '__hashModule()');

      const run = async (fragment, storedItems = {}) => {
        const store = new Map(Object.entries(storedItems));
        const storageStub = { getItem: (key) => (store.has(key) ? store.get(key) : null), setItem: (key, value) => { store.set(key, String(value)); } };
        const replacements = [];
        const elements = new Map();
        const element = () => ({ hidden: false, textContent: '', disabled: false, addEventListener() {} });
        const locationStub = { hash: fragment, origin: 'https://no-no.uk', pathname: '/manage/fp-owner', search: '', replace: (target) => replacements.push(target) };
        const factory = new Function('__hashModule', 'document', 'localStorage', 'location', 'navigator', script);
        factory(() => Promise.resolve({ hashManagementToken: clientHash }), { getElementById: () => element() }, storageStub, locationStub, { clipboard: {} });
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { store, replacements };
      };

      // Verified fragment + session: unchanged handoff for the owner.
      const valid = await run(`#${CRED}`);
      expect(valid.replacements).toEqual(['/fp-owner?handoff=1']);
      // Bare session owner (no fragment) stays on the fallback page,
      // unchanged.
      const bare = await run('');
      expect(bare.replacements).toEqual([]);
      // An explicitly WRONG fragment fails closed even for the session
      // owner: no auto-handoff during this navigation attempt (the owner
      // keeps every session-based management surface; only the corrupt
      // credential's silent auto-redirect is removed).
      const corrupted = await run('#deliberately-corrupted-credential');
      expect(corrupted.replacements).toEqual([]);
      expect(corrupted.store.get('purelink:management:fp-owner')).toBeUndefined();
    });

    it('keeps credentials out of markup, scripts, and noscript fallbacks', () => {
      for (const [link, nonce] of [[urlLink, 'n1'], [formulaLink, 'n2'], [cardLink, 'n3']]) {
        const html = renderManagePage(link, nonce, null, false, 'en');
        expect(html).not.toContain('purelink:owner-fp:');
        expect(html).not.toContain('data-purelink-owner-fp');
        // The noscript body carries instructions only, never credentials.
        expect(html).toContain('<noscript>');
        expect(html).toContain('management needs JavaScript');
        expect(() => new Function(extractScript(html))).not.toThrow();
      }
    });
  });

  describe('anonymous owner activation on canonical pages', () => {
    const activationSource = readFileSync(new URL('../client/owner-activation.js', import.meta.url), 'utf8');

    it('reveals the identical owner section only after a verified local credential', () => {
      // Same section contract as the session-owner render: ids, title, delete.
      const formula = renderFormulaPage({ slug: 'a-f', content: 'x² + y²', content_type: 'formula', created_at: '2026-09-01 00:00:00' }, 'en', { nonce: '', slug: 'a-f', publicFingerprint: 'fp16chars' });
      const card = renderCardPage({ slug: 'a-c', content: 'note', signature: '', theme: 'paper', content_type: 'card', created_at: '2026-09-01 00:00:00' }, 'en', 'card-nonce', { nonce: '', slug: 'a-c', publicFingerprint: 'fp16chars' });
      const urlPreview = renderUrlPreview({ slug: 'a-u', content: 'https://example.com', content_type: 'url', is_affiliate: 0, created_at: '2026-09-01 00:00:00' }, 'en', { nonce: '', slug: 'a-u', publicFingerprint: 'fp16chars' });
      for (const [page, sectionClass] of [[formula, 'content-manage'], [card, 'content-manage'], [urlPreview, 'preview-manage']]) {
        expect(page).toContain('You manage this PureLink');
        expect(page).toContain('Delete this PureLink');
        expect(page).toContain(`<section class="${sectionClass}" hidden data-owner-section`);
        expect(page).toContain('data-public-fingerprint="fp16chars"');
        expect(page).toContain("import('/assets/owner-activation.js')");
        // No credential ever reaches the markup.
        expect(page).not.toContain('purelink:management:');
        expect(page).not.toContain('Bearer ');
      }
      expect(formula).toContain('owner-delete');
      expect(urlPreview).toContain('preview-delete');
      // Activation reveals the same id-wired section, never invents its own.
      expect(activationSource).toContain("section.querySelector('.danger-button')");
      expect(activationSource).toContain("observedFingerprint !== publicFingerprint");
      expect(activationSource).toContain("localStorage.getItem(`purelink:management:${slug}`)");
      // The temporary handoff signal leaves the visible address after load.
      expect(activationSource).toContain("location.pathname + location.hash");
    });
  });

  it('emits a syntactically valid report form script', () => {
    const html = renderReportPage('reported-link', 'report-nonce');
    const script = extractScript(html);
    expect(html).toContain('reported-link');
    expect(() => new Function(script)).not.toThrow();
  });

  it('renders the start page with correct content and SEO metadata in both locales', () => {
    const englishStart = renderStartPage('en');
    const chineseStart = renderStartPage('zh-Hant');
    expect(englishStart).toContain('<html lang="en">');
    expect(englishStart).toContain('Understand PureLink in 20 seconds');
    expect(englishStart).toContain('PureLink is a clean sharing tool.');
    expect(englishStart).toContain('No ads. No cross-site tracking.');
    expect(englishStart).toContain('Paste what you want to share');
    expect(englishStart).toContain('Start sharing →');
    expect(englishStart).toContain('<link rel="canonical" href="https://no-no.uk/en/start">');
    expect(englishStart).toContain('hreflang="zh-Hant"');
    expect(englishStart).toContain('hreflang="x-default"');
    expect(englishStart).toContain('<meta name="robots" content="index, follow">');

    expect(chineseStart).toContain('<html lang="zh-Hant">');
    expect(chineseStart).toContain('20 秒看懂 PureLink');
    expect(chineseStart).toContain('PureLink 是一個乾淨的分享工具。');
    expect(chineseStart).toContain('沒有廣告、不做跨站追蹤');
    expect(chineseStart).toContain('把你想分享的東西貼進來');
    expect(chineseStart).toContain('開始分享 →');
    expect(chineseStart).toContain('<link rel="canonical" href="https://no-no.uk/zh-Hant/start">');
    expect(chineseStart).not.toContain('First time here?');
    expect(chineseStart).not.toContain('Understand PureLink in 20 seconds');
  });

  it('does not leak cross-language content on the start page', () => {
    const englishStart = renderStartPage('en');
    const chineseStart = renderStartPage('zh-Hant');
    expect(englishStart).not.toContain('20 秒看懂 PureLink');
    expect(englishStart).not.toContain('第一次使用');
    expect(englishStart).not.toContain('把你想分享的');
    expect(englishStart).not.toContain('安心分享');
    expect(chineseStart).not.toContain('Understand PureLink in 20 seconds');
    expect(chineseStart).not.toContain('First time here?');
    expect(chineseStart).not.toContain('Paste what you want to share');
    expect(chineseStart).not.toContain('Just share');
  });

  it('shows the homepage onboarding link in both locales', () => {
    const englishHome = renderHomePage('test-nonce', '', false, '', null, 'en');
    const chineseHome = renderHomePage('test-nonce', '', false, '', null, 'zh-Hant');
    expect(englishHome).toContain('First time here? Understand PureLink in 20 seconds →');
    expect(englishHome).toContain('href="/en/start"');
    expect(chineseHome).toContain('第一次使用嗎？20 秒看懂 PureLink →');
    expect(chineseHome).toContain('href="/zh-Hant/start"');
  });

  it('shows mode microcopy for each creation mode on the homepage', () => {
    const englishHome = renderHomePage('test-nonce', '', false, '', null, 'en');
    const chineseHome = renderHomePage('test-nonce', '', false, '', null, 'zh-Hant');
    expect(englishHome).toContain('URL: Shorten a long URL and optionally preview it before opening');
    expect(englishHome).toContain('Formula: Paste LaTeX or Unicode math and share it as a link or PNG');
    expect(englishHome).toContain('Card: Turn short text, notes, or multiple links into a simple shareable card');
    expect(chineseHome).toContain('網址：把長網址縮短，分享前也能先預覽');
    expect(chineseHome).toContain('公式：貼 LaTeX / Unicode，分享成連結或 PNG');
    expect(chineseHome).toContain('小卡：把短文、留言或多個連結整理成一張卡');
  });

  it('mode microcopy container becomes visible when data-active is set', () => {
    const html = renderHomePage('test-nonce', '', false, '', null, 'en');
    expect(html).toContain('id="mode-microcopy"');
    expect(html).toContain('data-active="url"');
    const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
    expect(styleMatch).toBeTruthy();
    const css = styleMatch[1];
    expect(css).toContain('.mode-microcopy[data-active="url"]');
    const activeRuleMatch = css.match(/\.mode-microcopy\[data-active="url"\][^{]*\{([^}]*)\}/);
    expect(activeRuleMatch).toBeTruthy();
    expect(activeRuleMatch[1]).toContain('display: flex');
    expect(activeRuleMatch[1]).not.toContain('display: none');
    expect(css).toContain('.mode-microcopy span { display: none; }');
  });

  it('homepage does not leak cross-language mode microcopy', () => {
    const englishHome = renderHomePage('test-nonce', '', false, '', null, 'en');
    const chineseHome = renderHomePage('test-nonce', '', false, '', null, 'zh-Hant');
    expect(englishHome).not.toContain('網址：');
    expect(englishHome).not.toContain('公式：');
    expect(englishHome).not.toContain('小卡：');
    expect(chineseHome).not.toContain('URL: Shorten');
    expect(chineseHome).not.toContain('Formula: Paste');
    expect(chineseHome).not.toContain('Card: Turn');
  });
});

function extractScript(html) {
  const match = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/);
  if (!match) throw new Error('Inline script was not found.');
  return match[1];
}

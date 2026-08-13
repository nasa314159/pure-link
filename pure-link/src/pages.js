import { escapeHtml } from './http.js';
import { renderFormulaContent } from './formula.js';

const PLATFORM_NOTICE = '透過 PureLink 分享的內容與外部網站由建立者提供，不代表 PureLink 的立場、推薦、背書或安全保證。';

const FORMULA_SHORTCUT_GROUPS = [
  {
    id: 'common',
    label: '★',
    ariaLabel: 'Common math',
    shortcuts: [
      ['a⁄b', '\\frac{}{}', 3, 'fraction'], ['x²', '^2', 0, 'square'], ['xⁿ', '^', 0, 'power'], ['√x', '\\sqrt{}', 1, 'square root'], ['∛x', '\\sqrt[3]{}', 1, 'cube root'], ['ⁿ√x', '\\sqrt[n]{}', 1, 'nth root'],
      ['d⁄dx', '\\frac{d}{dx}', 0, 'derivative'], ['d²⁄dx²', '\\frac{d^2}{dx^2}', 0, 'second derivative'], ['∫', '\\int ', 0, 'indefinite integral'], ['∫ₐᵇ', '\\int_{}^{}', 4, 'definite integral'],
      ['Σ', '\\sum_{}^{}', 4, 'sum'], ['lim', '\\lim_{}', 1, 'limit'], ['[x;y]', '\\begin{bmatrix}  \\\\  \\end{bmatrix}', 16, 'column vector'], ['[a b;c d]', '\\begin{bmatrix}  &  \\\\  &  \\end{bmatrix}', 21, 'two by two matrix'],
    ],
  },
  {
    id: 'algebra',
    label: '√',
    ariaLabel: 'Algebra',
    shortcuts: [
      ['a⁄b', '\\frac{}{}', 3, 'fraction'], ['x²', '^2', 0, 'square'], ['xⁿ', '^', 0, 'power'], ['√x', '\\sqrt{}', 1, 'square root'], ['∛x', '\\sqrt[3]{}', 1, 'cube root'], ['ⁿ√x', '\\sqrt[n]{}', 1, 'nth root'],
      ['∞', '\\infty'], ['−∞', '-\\infty'], ['π', '\\pi'], ['e', 'e'], ['eˣ', 'e^', 0, 'exponential'], ['ln', '\\ln '],
      ['logₐ', '\\log_{}', 1, 'logarithm'], ['log₁₀', '\\log_{10}'], ['|x|', '\\left|  \\right|', 8, 'absolute value'], ['≤', '\\le'], ['≥', '\\ge'], ['≠', '\\ne'],
      ['±', '\\pm'], ['≈', '\\approx'], ['×', '\\times'], ['÷', '\\div'], ['→', '\\to'], ['↔', '\\leftrightarrow'],
    ],
  },
  {
    id: 'calculus',
    label: '∂ ∫',
    ariaLabel: 'Calculus',
    shortcuts: [
      ['d⁄dx', '\\frac{d}{dx}', 0, 'derivative'], ['d²⁄dx²', '\\frac{d^2}{dx^2}', 0, 'second derivative'], ['∂⁄∂x', '\\frac{\\partial}{\\partial x}', 0, 'partial derivative'], ['∂²⁄∂x²', '\\frac{\\partial^2}{\\partial x^2}', 0, 'second partial derivative'], ['∂²⁄∂x∂y', '\\frac{\\partial^2}{\\partial x\\partial y}', 0, 'mixed partial derivative'],
      ['∫', '\\int '], ['∬', '\\iint '], ['∭', '\\iiint '], ['∫ₐᵇ', '\\int_{}^{}', 4, 'definite integral'], ['∬ₐᵇ', '\\int_{}^{}\\int_{}^{}', 14, 'double definite integral'], ['∭ₐᵇ', '\\int_{}^{}\\int_{}^{}\\int_{}^{}', 24, 'triple definite integral'],
      ['Σ', '\\sum_{}^{}', 4, 'sum'], ['Π', '\\prod_{}^{}', 4, 'product'], ['lim', '\\lim_{}', 1, 'limit'], ['lim₋', '\\lim_{x\\to a^-}', 0, 'left limit'], ['lim₊', '\\lim_{x\\to a^+}', 0, 'right limit'], ['lim∞', '\\lim_{x\\to\\infty}', 0, 'limit at infinity'],
      ['∇', '\\nabla'], ['∂', '\\partial'], ['δ', '\\delta'], ['ℒ', '\\mathcal{L}\\{  \\}', 3, 'Laplace transform'], ['ℒ⁻¹', '\\mathcal{L}^{-1}\\{  \\}', 3, 'inverse Laplace transform'], ['ℱ', '\\mathcal{F}\\{  \\}', 3, 'Fourier transform'], ['ℱ⁻¹', '\\mathcal{F}^{-1}\\{  \\}', 3, 'inverse Fourier transform'],
    ],
  },
  {
    id: 'matrices',
    label: '[ ]',
    ariaLabel: 'Vectors and matrices',
    shortcuts: [
      ['(x,y)', '( , )', 3, 'pair'], ['(x,y,z)', '( , , )', 5, 'triple'], ['(w,x,y,z)', '( , , , )', 7, 'quadruple'], ['[x;y]', '\\begin{bmatrix}  \\\\  \\end{bmatrix}', 16, 'two dimensional column vector'], ['[x;y;z]', '\\begin{bmatrix}  \\\\  \\\\  \\end{bmatrix}', 21, 'three dimensional column vector'],
      ['[x y]', '\\begin{bmatrix}  &  \\end{bmatrix}', 15, 'two dimensional row vector'], ['[x y z]', '\\begin{bmatrix}  &  &  \\end{bmatrix}', 18, 'three dimensional row vector'],
      ['[2×2]', '\\begin{bmatrix}  &  \\\\  &  \\end{bmatrix}', 21, 'two by two matrix'], ['[2×3]', '\\begin{bmatrix}  &  &  \\\\  &  &  \\end{bmatrix}', 27, 'two by three matrix'], ['[3×2]', '\\begin{bmatrix}  &  \\\\  &  \\\\  &  \\end{bmatrix}', 27, 'three by two matrix'], ['[3×3]', '\\begin{bmatrix}  &  &  \\\\  &  &  \\\\  &  &  \\end{bmatrix}', 36, 'three by three matrix'],
      ['|2×2|', '\\begin{vmatrix}  &  \\\\  &  \\end{vmatrix}', 21, 'determinant'], ['(2×2)', '\\begin{pmatrix}  &  \\\\  &  \\end{pmatrix}', 21, 'parenthesized matrix'], ['Iₙ', 'I_n', 0, 'identity matrix'], ['Aᵀ', '^{\\mathsf T}', 0, 'transpose'], ['A⁻¹', '^{-1}', 0, 'inverse matrix'],
    ],
  },
  {
    id: 'trigonometry',
    label: 'sin',
    ariaLabel: 'Trigonometry',
    shortcuts: [
      ['π', '\\pi'], ['°', '^{\\circ}', 0, 'degrees'], ['rad', '\\operatorname{rad}'], ['sin', '\\sin '], ['cos', '\\cos '], ['tan', '\\tan '], ['sec', '\\sec '], ['csc', '\\csc '], ['cot', '\\cot '],
      ['sin⁻¹', '\\sin^{-1}'], ['cos⁻¹', '\\cos^{-1}'], ['tan⁻¹', '\\tan^{-1}'], ['sinh', '\\sinh '], ['cosh', '\\cosh '], ['tanh', '\\tanh '], ['sech', '\\operatorname{sech} '], ['csch', '\\operatorname{csch} '], ['coth', '\\coth '],
      ['arsinh', '\\operatorname{arsinh} '], ['arcosh', '\\operatorname{arcosh} '], ['artanh', '\\operatorname{artanh} '],
    ],
  },
  {
    id: 'symbols',
    label: 'α ω',
    ariaLabel: 'Greek and symbols',
    shortcuts: [
      ['α', '\\alpha'], ['β', '\\beta'], ['γ', '\\gamma'], ['δ', '\\delta'], ['ε', '\\epsilon'], ['ζ', '\\zeta'], ['η', '\\eta'], ['θ', '\\theta'], ['κ', '\\kappa'], ['λ', '\\lambda'], ['μ', '\\mu'], ['ν', '\\nu'], ['ξ', '\\xi'], ['ρ', '\\rho'], ['σ', '\\sigma'], ['τ', '\\tau'], ['φ', '\\phi'], ['χ', '\\chi'], ['ψ', '\\psi'], ['ω', '\\omega'],
      ['Γ', '\\Gamma'], ['Δ', '\\Delta'], ['Θ', '\\Theta'], ['Λ', '\\Lambda'], ['Ξ', '\\Xi'], ['Π', '\\Pi'], ['Σ', '\\Sigma'], ['Φ', '\\Phi'], ['Ψ', '\\Psi'], ['Ω', '\\Omega'],
      ['∀', '\\forall'], ['∃', '\\exists'], ['∪', '\\cup'], ['∩', '\\cap'], ['∈', '\\in'], ['∉', '\\notin'], ['∅', '\\varnothing'], ['∴', '\\therefore'], ['∵', '\\because'], ['∥', '\\parallel'], ['⊥', '\\perp'], ['≅', '\\cong'], ['∝', '\\propto'], ['⊆', '\\subseteq'], ['⊇', '\\supseteq'], ['⊕', '\\oplus'], ['⊗', '\\otimes'],
    ],
  },
];

function renderFormulaShortcutPalette() {
  const tabs = FORMULA_SHORTCUT_GROUPS.map((group, index) => `<button type="button" role="tab" id="formula-tab-${group.id}" aria-label="${escapeHtml(group.ariaLabel)}" aria-controls="formula-panel-${group.id}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}" data-formula-category="${group.id}">${escapeHtml(group.label)}</button>`).join('');
  const panels = FORMULA_SHORTCUT_GROUPS.map((group, index) => {
    const buttons = group.shortcuts.map(([label, insert, cursorBack = 0, accessibleLabel = label]) => `<button type="button" title="${escapeHtml(insert)}" aria-label="${escapeHtml(accessibleLabel)}; insert ${escapeHtml(insert)}" data-formula-insert="${escapeHtml(insert)}"${cursorBack ? ` data-cursor-back="${cursorBack}"` : ''}>${escapeHtml(label)}</button>`).join('');
    return `<div class="symbol-group" role="tabpanel" id="formula-panel-${group.id}" aria-labelledby="formula-tab-${group.id}" data-formula-panel="${group.id}"${index === 0 ? '' : ' hidden'}>${buttons}</div>`;
  }).join('');
  return `<div class="formula-category-tabs" role="tablist" aria-label="Math shortcut categories">${tabs}</div><div class="symbol-groups">${panels}</div>`;
}

export function renderHomePage(nonce, turnstileSiteKey = '', googleAuthConfigured = false, authStatus = '', user = null) {
  const turnstileWidget = turnstileSiteKey
    ? `<div class="turnstile-wrap"><div class="cf-turnstile" data-sitekey="${escapeHtml(turnstileSiteKey)}" data-action="create"></div></div>`
    : '';
  const authNotice = authStatus === 'expired'
    ? '<div class="auth-notice" role="status"><strong>登入等待時間已結束。</strong><span>為了保護帳戶，這次的一次性登入已失效；請從「我的 PureLink」重新開始。</span><a href="/account">重新登入</a></div>'
    : authStatus
      ? '<div class="auth-notice" role="status"><strong>這次登入沒有完成。</strong><span>沒有建立任何帳戶工作階段，請重新嘗試。</span><a href="/account">重新登入</a></div>'
      : '';
  const accountEntry = googleAuthConfigured
    ? `<nav class="account-entry" aria-label="帳戶"><a href="${user ? '/account' : '/auth/google?returnTo=%2F'}"${user ? '' : ' aria-label="使用 Google 登入"'}>${user ? '我的 PureLink' : '登入'}</a></nav>`
    : '';
  return documentShell({
    title: 'PureLink — 安靜地分享',
    description: '以簡潔、尊重隱私的方式分享網址、數學公式或一張短文小卡。',
    body: `
      ${accountEntry}
      <main class="home creator-home">
        <header class="hero">
          <p class="eyebrow">PURELINK</p>
          <h1>清楚地分享，<br>少留一點痕跡。</h1>
          <p class="lede">把網址、公式，或一段想好好送出去的話，交給一個安靜的連結。</p>
        </header>

        ${authNotice}

        <section class="creator-panel panel" id="creator-panel" aria-labelledby="creator-title">
          <div class="creator-heading">
            <div>
              <p class="eyebrow">CREATE</p>
              <h2 id="creator-title">你想分享什麼？</h2>
            </div>
            <button class="suggestion" id="suggestion" type="button" hidden></button>
          </div>

          <form id="create-form" novalidate>
            <input type="hidden" id="content-type" name="contentType" value="url">
            <div class="type-tabs" role="group" aria-label="內容類型">
              <button class="type-tab active" type="button" data-type="url" aria-pressed="true"><span>↗</span>網址</button>
              <button class="type-tab" type="button" data-type="formula" aria-pressed="false"><span>∑</span>公式</button>
              <button class="type-tab" type="button" data-type="card" aria-pressed="false"><span>✦</span>小卡</button>
            </div>

            <div class="content-workspace" id="content-workspace">
              <div class="content-input-pane">
                <label class="field-label" for="content">內容</label>
                <textarea id="content" name="content" maxlength="4096" placeholder="example.com" required></textarea>
                <div class="field-meta"><span id="content-help">我們會補上 HTTPS，但不會暗中改寫網址。</span><span id="character-count">0 / 4096</span></div>
              </div>
              <aside class="formula-preview" id="formula-live-preview" aria-label="公式即時預覽" hidden>
                <span class="preview-label">即時預覽</span>
                <p id="formula-preview-empty">輸入 LaTeX 或 Unicode 數學符號後，這裡會立即排版。</p>
                <div id="formula-preview-rendered" class="formula-preview-rendered" hidden></div>
              </aside>
            </div>

            <div class="formula-tools" id="formula-tools" hidden>
              <div class="formula-tool-heading"><strong>數學快捷輸入</strong><span>每個按鍵只插入 LaTeX；右側會立即預覽。</span></div>
              ${renderFormulaShortcutPalette()}
            </div>

            <div class="conditional-options" id="url-options">
              <label class="check-row"><input type="checkbox" name="cleanTracking" value="true"><span><strong>清理常見追蹤參數</strong><small>建立前移除 utm、fbclid 等已知參數。</small></span></label>
              <label class="check-row"><input type="checkbox" name="isAffiliate" value="true"><span><strong>這可能是推薦或分潤連結</strong><small>會在 + 預覽頁誠實告知接收者。</small></span></label>
            </div>

            <div class="conditional-options" id="card-options" hidden>
              <label class="field-label" for="signature">署名（選填）</label>
              <input id="signature" name="signature" maxlength="60" placeholder="例如：一直惦記你的我">
              <fieldset class="theme-picker">
                <legend>安靜主題</legend>
                <label><input type="radio" name="theme" value="paper" checked><span class="theme-swatch paper-swatch">紙白</span></label>
                <label><input type="radio" name="theme" value="mist"><span class="theme-swatch mist-swatch">薄霧</span></label>
                <label><input type="radio" name="theme" value="night"><span class="theme-swatch night-swatch">夜色</span></label>
              </fieldset>
            </div>

            <details class="advanced-options">
              <summary>自訂短連結</summary>
              <label class="field-label" for="slug">no-no.uk/</label>
              <input id="slug" name="slug" maxlength="30" pattern="[A-Za-z0-9_-]+" placeholder="留白就會安全地自動產生">
            </details>

            <p class="form-error" id="form-error" role="alert" hidden></p>
            ${turnstileWidget}
            <button class="create-button" id="create-button" type="submit">建立 PureLink</button>
            <p class="privacy-note">不用先註冊。建立時只處理維持服務與防止濫用所需的最低限度資料。</p>
          </form>

          <section class="result-panel" id="result-panel" aria-live="polite" hidden>
            <p class="eyebrow">READY</p>
            <h2>你的 PureLink 準備好了。</h2>
            <a class="result-url" id="result-url" href=""></a>
            <div class="result-actions">
              <button class="create-button" type="button" data-copy-target="result-url">複製分享連結</button>
              <a class="secondary-link" id="preview-link" href="" hidden></a>
            </div>
            <div class="recovery-box">
              <strong>請保存匿名管理憑證</strong>
              <p>PureLink 不知道你是誰。若這個瀏覽器與你的備份都遺失，我們無法替你找回刪除權限。</p>
              <div class="recovery-actions">
                <button class="secondary-button" id="copy-management" type="button">複製管理地址</button>
                <button class="secondary-button" id="download-recovery" type="button">下載恢復檔案</button>
              </div>
            </div>
            <button class="quiet-button" id="create-another" type="button">再建立一個</button>
          </section>
        </section>

        <footer class="home-footer">
          <p>內容由建立者提供，不代表 PureLink 的立場、推薦或安全保證。</p>
          <nav aria-label="服務資訊">${googleAuthConfigured ? '<a href="/account">我的 PureLink</a>' : ''}<a href="/privacy">隱私說明</a><a href="/terms">使用與內容規範</a><a href="/transparency">透明度</a><a href="https://github.com/nasa314159/pure-link" rel="noreferrer">GitHub 原始碼</a></nav>
        </footer>
      </main>
    `,
    script: `
      const form = document.getElementById('create-form');
      const content = document.getElementById('content');
      const contentType = document.getElementById('content-type');
      const contentHelp = document.getElementById('content-help');
      const characterCount = document.getElementById('character-count');
      const suggestion = document.getElementById('suggestion');
      const urlOptions = document.getElementById('url-options');
      const cardOptions = document.getElementById('card-options');
      const formulaTools = document.getElementById('formula-tools');
      const contentWorkspace = document.getElementById('content-workspace');
      const errorBox = document.getElementById('form-error');
      const submitButton = document.getElementById('create-button');
      const resultPanel = document.getElementById('result-panel');
      let latestResult = null;

      const typeCopy = {
        url: { placeholder: 'example.com', help: '我們會補上 HTTPS，但不會暗中改寫網址。', limit: 4096 },
        formula: { placeholder: '例如：能量是 $E=mc^2$，或直接貼上 \\\\frac{a}{b}', help: '支援純公式，以及使用 $...$、$$...$$ 混合文字與公式。', limit: 5000 },
        card: { placeholder: '寫下一段想好好送出去的話…', help: '一段話、可選署名、三種安靜主題。', limit: 1000 },
      };

      function selectType(type) {
        contentType.value = type;
        document.querySelectorAll('.type-tab').forEach((tab) => {
          const active = tab.dataset.type === type;
          tab.classList.toggle('active', active);
          tab.setAttribute('aria-pressed', String(active));
        });
        const copy = typeCopy[type];
        content.placeholder = copy.placeholder;
        content.maxLength = copy.limit;
        contentHelp.textContent = copy.help;
        urlOptions.hidden = type !== 'url';
        cardOptions.hidden = type !== 'card';
        formulaTools.hidden = type !== 'formula';
        contentWorkspace.classList.toggle('formula-mode', type === 'formula');
        updateCount();
        updateSuggestion();
        document.dispatchEvent(new CustomEvent('purelink:typechange', { detail: { type } }));
      }

      function suggestedType(value) {
        const trimmed = value.trim();
        if (!trimmed) return null;
        if (/^(?:https?:\\/\\/)?[^\\s/]+\\.[^\\s/]{2,}(?:\\/[^\\s]*)?$/i.test(trimmed)) return 'url';
        if (/\\\\(?:begin|end|frac|sqrt|sum|int|lim|left|right|text|mathrm|mathbf|mathbb|partial|nabla)\\b|[∂∫∑√∞≈≠≤≥±×÷∇]|\\$[^$]+\\$/.test(trimmed)) return 'formula';
        return 'card';
      }

      function updateSuggestion() {
        const type = suggestedType(content.value);
        if (!type || type === contentType.value) {
          suggestion.hidden = true;
          return;
        }
        suggestion.dataset.type = type;
        suggestion.textContent = '建議：' + ({ url: '網址', formula: '公式', card: '小卡' })[type] + ' · 點一下採用';
        suggestion.hidden = false;
      }

      function updateCount() {
        characterCount.textContent = content.value.length + ' / ' + content.maxLength;
      }

      document.querySelectorAll('.type-tab').forEach((tab) => tab.addEventListener('click', () => selectType(tab.dataset.type)));
      suggestion.addEventListener('click', () => selectType(suggestion.dataset.type));
      content.addEventListener('input', () => { updateCount(); updateSuggestion(); });

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        errorBox.hidden = true;
        submitButton.disabled = true;
        submitButton.textContent = '正在建立…';
        const data = Object.fromEntries(new FormData(form));
        data.cleanTracking = data.cleanTracking === 'true';
        data.isAffiliate = data.isAffiliate === 'true';

        try {
          const response = await fetch('/api/links', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(data),
          });
          const result = await response.json();
          if (!response.ok) {
            window.turnstile?.reset();
            throw new Error(result.error || '建立失敗，請稍後再試。');
          }
          latestResult = result;
          localStorage.setItem('purelink:management:' + result.slug, result.managementToken);
          document.getElementById('result-url').textContent = result.url;
          document.getElementById('result-url').href = result.url;
          const previewLink = document.getElementById('preview-link');
          previewLink.hidden = !result.previewUrl;
          previewLink.href = result.previewUrl || '';
          previewLink.textContent = result.previewLabel || '查看分享內容';
          form.hidden = true;
          resultPanel.hidden = false;
          resultPanel.focus();
        } catch (error) {
          errorBox.textContent = error.message;
          errorBox.hidden = false;
        } finally {
          submitButton.disabled = false;
          submitButton.textContent = '建立 PureLink';
        }
      });

      document.querySelector('[data-copy-target="result-url"]').addEventListener('click', async (event) => {
        await navigator.clipboard.writeText(latestResult.url);
        const button = event.currentTarget;
        button.textContent = '已複製';
        setTimeout(() => { button.textContent = '複製分享連結'; }, 1600);
      });

      document.getElementById('copy-management').addEventListener('click', async (event) => {
        await navigator.clipboard.writeText(latestResult.managementUrl);
        const button = event.currentTarget;
        button.textContent = '已複製';
        setTimeout(() => { button.textContent = '複製管理地址'; }, 1600);
      });

      document.getElementById('download-recovery').addEventListener('click', () => {
        const typeName = ({ url: '網址', formula: '公式', card: '小卡' })[latestResult.contentType] || '內容';
        const text = 'PureLink 匿名管理與分享資訊\\n\\n內容類型：' + typeName + '\\n分享／查看內容：\\n' + latestResult.url + '\\n\\n私人管理地址（請勿分享）：\\n' + latestResult.managementUrl + '\\n\\n分享連結可交給接收者；管理地址只留給建立者。PureLink 無法恢復遺失的匿名管理憑證。\\n';
        const anchor = document.createElement('a');
        anchor.download = 'purelink-' + latestResult.slug + '-recovery.txt';
        anchor.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(text);
        anchor.click();
      });

      document.getElementById('create-another').addEventListener('click', () => {
        latestResult = null;
        form.reset();
        window.turnstile?.reset();
        selectType('url');
        form.hidden = false;
        resultPanel.hidden = true;
        content.focus();
      });

      selectType('url');
    `,
    nonce,
    externalScripts: [
      '/assets/formula-editor.js',
      turnstileSiteKey ? 'https://challenges.cloudflare.com/turnstile/v0/api.js' : '',
    ],
  });
}

export function renderUrlPreview(link) {
  const destination = new URL(link.content);
  const affiliate = Number(link.is_affiliate) === 1;
  return documentShell({
    title: `Preview ${destination.hostname} — PureLink`,
    description: 'Review a PureLink destination before continuing.',
    robots: 'noindex, nofollow, noarchive',
    body: `
      <main class="page">
        <a class="wordmark" href="/">PureLink</a>
        <article class="panel preview-panel">
          <p class="eyebrow">DESTINATION PREVIEW</p>
          <h1 class="destination-host">${escapeHtml(destination.hostname)}</h1>
          <p class="destination-url">${escapeHtml(destination.toString())}</p>
          <div class="facts">
            <p><strong>Connection</strong><span>${destination.protocol === 'https:' ? 'HTTPS' : 'HTTP — not encrypted'}</span></p>
            <p><strong>Shared</strong><span>${escapeHtml(formatDate(link.created_at))}</span></p>
            <p><strong>Referral</strong><span>${affiliate ? 'Creator says this may provide referral or affiliate benefit.' : 'Creator did not declare an affiliate relationship.'}</span></p>
          </div>
          <a class="primary-link" href="${escapeHtml(destination.toString())}" rel="noreferrer">Continue to destination</a>
          <a class="report-link" href="/report/${escapeHtml(link.slug)}">回報這個 PureLink</a>
          <p class="notice">${escapeHtml(PLATFORM_NOTICE)} This preview is informational and is not a security certification.</p>
        </article>
      </main>
    `,
  });
}

export function renderFormulaPage(link) {
  return documentShell({
    title: 'Formula — PureLink',
    description: 'A formula shared with PureLink.',
    robots: 'noindex, nofollow, noarchive',
    body: `
      <main class="page">
        <a class="wordmark" href="/">PureLink</a>
        <article class="panel content-panel">
          <div class="share-export formula-export" id="share-export">
            <p class="eyebrow" data-export-brand>PURELINK · FORMULA</p>
            <div class="shared-content formula-rendered">${renderFormulaContent(link.content)}</div>
          </div>
          <label class="export-brand-option"><input type="checkbox" data-export-brand-toggle checked><span><strong>PNG 加入「PURELINK · FORMULA」</strong><small>可隨時取消；分享內容本身不受影響。</small></span></label>
          <div class="content-actions">
            <button class="secondary-button" type="button" data-copy-content>複製原始內容</button>
            <button class="secondary-button" type="button" data-download-png data-filename="purelink-${escapeHtml(link.slug)}-formula.png">下載 PNG</button>
          </div>
          <details class="source-details">
            <summary>查看原始輸入（LaTeX／Unicode）</summary>
            <pre class="formula-source">${escapeHtml(link.content)}</pre>
          </details>
          <textarea id="raw-content" hidden>${escapeHtml(link.content)}</textarea>
          <p class="notice">${escapeHtml(PLATFORM_NOTICE)}</p>
          <a class="report-link" href="/report/${escapeHtml(link.slug)}">回報這個 PureLink</a>
        </article>
      </main>
    `,
    externalScript: '/assets/content-actions.js',
  });
}

export function renderCardPage(link) {
  const signature = link.signature ? `<p class="signature">— ${escapeHtml(link.signature)}</p>` : '';
  return documentShell({
    title: 'A small card — PureLink',
    description: 'A small card shared with PureLink.',
    robots: 'noindex, nofollow, noarchive',
    body: `
      <main class="page card-page theme-${escapeHtml(link.theme || 'paper')}">
        <a class="wordmark" href="/">PureLink</a>
        <article class="panel content-panel card-panel">
          <div class="share-export card-export" id="share-export">
            <p class="eyebrow" data-export-brand>PURELINK · A SMALL CARD</p>
            <p class="shared-content card-copy">${escapeHtml(link.content)}</p>
            ${signature}
          </div>
          <label class="export-brand-option"><input type="checkbox" data-export-brand-toggle checked><span><strong>PNG 加入「PURELINK · A SMALL CARD」</strong><small>可隨時取消；小卡內容本身不受影響。</small></span></label>
          <div class="content-actions">
            <button class="secondary-button" type="button" data-copy-content>複製文字</button>
            <button class="secondary-button" type="button" data-download-png data-filename="purelink-${escapeHtml(link.slug)}-card.png">下載 PNG</button>
          </div>
          <textarea id="raw-content" hidden>${escapeHtml(link.content)}</textarea>
          <p class="notice">${escapeHtml(PLATFORM_NOTICE)}</p>
          <a class="report-link" href="/report/${escapeHtml(link.slug)}">回報這個 PureLink</a>
        </article>
      </main>
    `,
    externalScript: '/assets/content-actions.js',
  });
}

export function renderReportPage(slug, nonce, turnstileSiteKey = '') {
  const safeSlugScript = JSON.stringify(slug).replaceAll('<', '\\u003c');
  const turnstileWidget = turnstileSiteKey
    ? `<div class="turnstile-wrap"><div class="cf-turnstile" data-sitekey="${escapeHtml(turnstileSiteKey)}" data-action="report"></div></div>`
    : '';
  return documentShell({
    title: '回報內容 — PureLink',
    description: '回報可能有害或不當的 PureLink。',
    robots: 'noindex, nofollow, noarchive',
    body: `
      <main class="page">
        <a class="wordmark" href="/">PureLink</a>
        <article class="panel report-panel">
          <p class="eyebrow">REPORT</p>
          <h1 class="manage-title">協助我們保持這裡乾淨。</h1>
          <p class="lede manage-lede">你正在回報 <strong>/${escapeHtml(slug)}</strong>。回報不會自動下架；我們會依內容、安全風險與適用規範進行審查。</p>
          <form id="report-form">
            <label class="field-label" for="category">原因</label>
            <select id="category" name="category" required>
              <option value="">請選擇</option>
              <option value="phishing">釣魚或詐騙</option>
              <option value="malware">惡意程式或危險下載</option>
              <option value="impersonation">冒用身分</option>
              <option value="copyright">著作權或其他權利問題</option>
              <option value="privacy">未經同意揭露個人資料</option>
              <option value="other">其他</option>
            </select>
            <label class="field-label" for="details">補充說明（選填）</label>
            <textarea id="details" name="details" maxlength="1000" placeholder="請提供判斷所需的最少資訊；不要填入密碼、證件或其他敏感資料。"></textarea>
            ${turnstileWidget}
            <p class="form-error" id="report-error" role="alert" hidden></p>
            <button class="create-button" id="report-button" type="submit">送出回報</button>
          </form>
          <p class="notice" id="report-status" role="status">${escapeHtml(PLATFORM_NOTICE)}</p>
        </article>
      </main>
    `,
    script: `
      const slug = ${safeSlugScript};
      const form = document.getElementById('report-form');
      const button = document.getElementById('report-button');
      const errorBox = document.getElementById('report-error');
      const status = document.getElementById('report-status');
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        errorBox.hidden = true;
        button.disabled = true;
        button.textContent = '正在送出…';
        const data = Object.fromEntries(new FormData(form));
        data.slug = slug;
        try {
          const response = await fetch('/api/reports', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(data),
          });
          const result = await response.json();
          if (!response.ok) {
            window.turnstile?.reset();
            throw new Error(result.error || '回報未能送出。');
          }
          form.hidden = true;
          status.textContent = '回報已收到。謝謝你協助保護其他使用者。';
        } catch (error) {
          errorBox.textContent = error.message;
          errorBox.hidden = false;
          button.disabled = false;
          button.textContent = '送出回報';
        }
      });
    `,
    nonce,
    externalScript: turnstileSiteKey ? 'https://challenges.cloudflare.com/turnstile/v0/api.js' : '',
  });
}

export function renderLegalPage(page) {
  const pages = {
    privacy: {
      eyebrow: 'PRIVACY',
      title: '只留下服務真正需要的資料。',
      intro: 'PureLink 不以廣告、跨站追蹤或建立個人檔案為目的。這份說明用一般人看得懂的方式，列出服務會處理什麼。',
      sections: [
        ['我們保存的內容', '你主動建立的網址、公式或小卡，以及必要的設定、建立時間、狀態與不可逆的匿名管理憑證雜湊。管理憑證本身只交給建立者，PureLink 無法替匿名使用者找回。'],
        ['最低限度統計', '只按日期、功能類型與國家或地區代碼累加總數，用來估計人數、成本與服務狀況；不保存原始 IP，也不建立個人瀏覽歷程。未知地區統一記為 ZZ。'],
        ['防止濫用', '公開寫入會使用 Turnstile 驗證，並以原始 IP、時間窗與伺服器密鑰產生不可逆的短期速率限制代碼。代碼只用於限制惡意大量請求，逾期後清除。'],
        ['自願登入', '完全不登入仍可建立與管理匿名內容。若你自願使用 Google 登入，PureLink 會保存 Google 提供的穩定帳號識別碼、電子郵件、顯示名稱，以及登入工作階段的不可逆雜湊，用來跨裝置顯示你主動連結的內容；不保存 Google 密碼或長期存取權杖。'],
        ['我們刻意不做的事', '不販售資料、不投放行為廣告、不做跨站追蹤、不建立個人興趣檔案，也不把使用內容拿去訓練模型。瀏覽器與網路供應商仍會在傳輸請求時接觸必要的網路資料。'],
        ['刪除與聯絡', '匿名建立者可用管理地址永久刪除內容；遺失管理憑證時無法驗證建立者身分。若內容涉及安全、隱私或權利問題，可從內容頁使用回報功能。'],
      ],
    },
    terms: {
      eyebrow: 'TERMS & CONTENT',
      title: '自由分享，不等於沒有邊界。',
      intro: PLATFORM_NOTICE,
      sections: [
        ['使用者的責任', '請只分享你有權分享的內容，並自行確認外部網址、公式與文字的正確性。不得利用 PureLink 從事釣魚、詐騙、散布惡意程式、冒用身分、侵害隱私或其他違法行為。'],
        ['預覽不是安全認證', '網址後加上 + 會完整顯示目的地與建立者是否宣告推薦或分潤關係，幫助接收者自行判斷；這不是惡意網站掃描、法律審核或安全保證。'],
        ['處理與下架', '收到回報後，PureLink 可依風險、內容規範與適用法律限制存取或移除內容。回報本身不代表內容必然違規，也不會自動下架。'],
        ['服務狀態', 'PureLink 以盡力而為方式提供，可能因維護、成本、安全事件或不可抗力暫停。重要內容不應只保存在 PureLink。'],
        ['支持方式', '基本成果希望任何人都能使用。自願贊助用於服務成本、後續學習與硬體開發，不會改變平台對內容的背書立場。未來若提供高風險或高成本的加密連結等付費功能，會另行清楚揭露條件。'],
      ],
    },
    transparency: {
      eyebrow: 'TRANSPARENCY',
      title: '能被檢查，才配得上「不追蹤」。',
      intro: 'PureLink 的承諾不只是一句文案：產品設計、資料欄位與防濫用方式都以可公開檢視為方向。',
      sections: [
        ['目前的資料邊界', '內容資料庫保存分享內容、設定與匿名管理雜湊；自願登入者另保存最低限度 Google 帳號資料與工作階段雜湊；統計資料庫只保存每日聚合數字；速率限制只保存短期不可逆代碼；檢舉不要求姓名或電子郵件。'],
        ['人類驗證的定位', 'Turnstile 只保護建立與檢舉等公開寫入，不阻擋一般人閱讀內容。它是防止機器大量濫用的安全措施，不是建立會員身分或追蹤閱讀者。'],
        ['開源與驗證', '正式發布時將公開程式、資料結構、部署說明與製作歷程，讓任何人能檢查承諾、提出問題或自行部署。版本與政策有實質變更時，也應在公開紀錄中留下痕跡。'],
        ['目前限制', '這是仍在驗證中的 MVP。自訂網域、正式監控、事件處理流程與定期透明度報告，會在正式上線前或依服務規模逐步完成。'],
      ],
    },
  };
  const content = pages[page] || pages.transparency;
  return documentShell({
    title: `${content.title} — PureLink`,
    description: content.intro,
    robots: 'index, follow',
    body: `
      <main class="page legal-page">
        <a class="wordmark" href="/">PureLink</a>
        <article class="panel legal-panel">
          <p class="eyebrow">${content.eyebrow}</p>
          <h1 class="legal-title">${escapeHtml(content.title)}</h1>
          <p class="lede legal-intro">${escapeHtml(content.intro)}</p>
          <div class="legal-sections">${content.sections.map(([heading, copy]) => `<section><h2>${escapeHtml(heading)}</h2><p>${escapeHtml(copy)}</p></section>`).join('')}</div>
          <p class="legal-updated">MVP 說明版本：2026-08-06</p>
        </article>
      </main>
    `,
  });
}

export function renderManagePage(link, nonce, user = null, googleAuthConfigured = false) {
  const slug = link.slug;
  const safeSlugScript = JSON.stringify(slug).replaceAll('<', '\\u003c');
  const accountAccess = Boolean(user && link.owner_user_id === user.id);
  const contentTypeName = ({ url: '網址', formula: '公式', card: '小卡' })[link.content_type] || '內容';
  const accountPanel = user
    ? `<div class="account-connect"><p>已使用 Google 登入：<strong>${escapeHtml(user.email)}</strong></p>${accountAccess ? '<p>這個 PureLink 已保存在你的帳號。</p>' : '<button class="secondary-button" id="claim-link" type="button">把這個 PureLink 加入我的帳號</button>'}<a href="/account">查看我的 PureLink</a></div>`
    : googleAuthConfigured
      ? `<div class="account-connect"><strong>想跨裝置管理？</strong><p>匿名憑證仍可直接使用；也可以自願連結 Google 帳號，之後從其他裝置登入找回。</p><a class="google-link" href="/auth/google?returnTo=${encodeURIComponent(`/manage/${slug}`)}">使用 Google 繼續</a></div>`
      : '';
  return documentShell({
    title: '管理你的 PureLink',
    description: '使用匿名管理憑證或自願連結的帳號管理 PureLink。',
    robots: 'noindex, nofollow, noarchive',
    body: `
      <main class="page">
        <a class="wordmark" href="/">PureLink</a>
        <article class="panel manage-panel">
          <p class="eyebrow">PRIVATE MANAGEMENT</p>
          <h1 class="manage-title">管理這個 PureLink。</h1>
          <p class="lede manage-lede">匿名憑證本身就是管理權限，不需要強迫登入；請不要把這個管理地址交給別人。</p>
          <div class="managed-content-card">
            <span>${escapeHtml(contentTypeName)}</span>
            <strong>/${escapeHtml(slug)}</strong>
            <a class="primary-link" href="/${escapeHtml(slug)}">查看分享內容</a>
          </div>
          ${accountPanel}
          <div class="manage-actions" id="manage-actions" hidden>
            <button class="secondary-button" id="copy-management" type="button">複製管理地址</button>
            <button class="secondary-button" id="download-recovery" type="button">下載恢復檔案</button>
            <button class="danger-button" id="delete-link" type="button">刪除這個 PureLink</button>
          </div>
          <p class="notice" id="management-status" role="status">正在確認管理權限…</p>
        </article>
      </main>
    `,
    script: `
      const slug = ${safeSlugScript};
      const storageKey = 'purelink:management:' + slug;
      const fragmentToken = location.hash.slice(1);
      if (fragmentToken) localStorage.setItem(storageKey, fragmentToken);
      const token = fragmentToken || localStorage.getItem(storageKey) || '';
      const accountAccess = ${accountAccess};
      const actions = document.getElementById('manage-actions');
      const status = document.getElementById('management-status');
      const copyManagement = document.getElementById('copy-management');
      const downloadRecovery = document.getElementById('download-recovery');
      const canonicalAddress = location.origin + '/manage/' + encodeURIComponent(slug) + '#' + token;

      copyManagement.hidden = !token;
      downloadRecovery.hidden = !token;

      if (token || accountAccess) {
        actions.hidden = false;
        status.textContent = accountAccess ? '已透過你的 Google 帳號取得管理權限。' : '此裝置已有匿名管理權限。';
      } else {
        status.textContent = '找不到匿名管理憑證。若曾連結 Google 帳號，請先登入；未連結的匿名憑證無法恢復。';
      }

      copyManagement.addEventListener('click', async (event) => {
        await navigator.clipboard.writeText(canonicalAddress);
        const button = event.currentTarget;
        button.textContent = '已複製';
        setTimeout(() => { button.textContent = '複製管理地址'; }, 1600);
      });

      downloadRecovery.addEventListener('click', () => {
        const recoveryText = 'PureLink 匿名管理與分享資訊\\n\\n內容類型：${contentTypeName}\\n分享／查看內容：\\n' + location.origin + '/' + encodeURIComponent(slug) + '\\n\\n私人管理地址（請勿分享）：\\n' + canonicalAddress + '\\n\\n分享連結可交給接收者；管理地址只留給建立者。\\n';
        const anchor = document.createElement('a');
        anchor.download = 'purelink-' + slug + '-recovery.txt';
        anchor.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(recoveryText);
        anchor.click();
      });

      document.getElementById('claim-link')?.addEventListener('click', async (event) => {
        const button = event.currentTarget;
        if (!token) {
          status.textContent = '需要先用原本的匿名管理地址開啟此頁，才能綁定帳號。';
          return;
        }
        button.disabled = true;
        const response = await fetch('/api/links/' + encodeURIComponent(slug) + '/claim', {
          method: 'POST',
          headers: { authorization: 'Bearer ' + token },
        });
        if (response.ok) {
          button.replaceWith(document.createTextNode('已加入你的帳號。'));
          status.textContent = '之後可在任何裝置使用 Google 登入管理。';
        } else {
          button.disabled = false;
          status.textContent = '帳號連結失敗，請重新開啟完整管理地址後再試。';
        }
      });

      let deleteArmed = false;
      document.getElementById('delete-link').addEventListener('click', async (event) => {
        const button = event.currentTarget;
        if (!deleteArmed) {
          deleteArmed = true;
          button.textContent = '再按一次，永久刪除';
          setTimeout(() => { deleteArmed = false; button.textContent = '刪除這個 PureLink'; }, 5000);
          return;
        }

        button.disabled = true;
        const response = await fetch('/api/links/' + encodeURIComponent(slug), {
          method: 'DELETE',
          headers: token ? { authorization: 'Bearer ' + token } : {},
        });
        if (response.ok) {
          localStorage.removeItem(storageKey);
          actions.hidden = true;
          history.replaceState(null, '', location.pathname);
          status.textContent = '這個 PureLink 已永久刪除。';
        } else {
          button.disabled = false;
          deleteArmed = false;
          button.textContent = '刪除這個 PureLink';
          status.textContent = '刪除失敗，請確認管理地址或帳號權限。';
        }
      });
    `,
    nonce,
  });
}

export function renderAccountPage(user, links) {
  const rows = links.length
    ? links.map((link) => `<li><div><span>${escapeHtml(({ url: '網址', formula: '公式', card: '小卡' })[link.content_type] || '內容')}</span><strong>/${escapeHtml(link.slug)}</strong></div><a href="/${escapeHtml(link.slug)}">查看</a><a href="/manage/${escapeHtml(link.slug)}">管理</a></li>`).join('')
    : '<li class="empty-account">還沒有連結到這個帳號的 PureLink。</li>';
  return documentShell({
    title: '我的 PureLink',
    description: '跨裝置管理自願連結到 Google 帳號的 PureLink。',
    robots: 'noindex, nofollow, noarchive',
    body: `
      <main class="page account-page">
        <a class="wordmark" href="/">PureLink</a>
        <article class="panel account-panel">
          <p class="eyebrow">YOUR PURELINKS</p>
          <h1 class="manage-title">你好，${escapeHtml(user.display_name || user.email)}。</h1>
          <p class="lede manage-lede">只有你主動連結或登入後建立的內容會出現在這裡。匿名建立仍然可以完全不登入。</p>
          <ul class="account-links">${rows}</ul>
          <form action="/auth/logout" method="post"><button class="secondary-button" type="submit">登出</button></form>
        </article>
      </main>
    `,
  });
}

export function renderNotFoundPage() {
  return documentShell({
    title: 'Not found — PureLink',
    description: 'This PureLink could not be found.',
    robots: 'noindex, nofollow',
    body: `
      <main class="home">
        <p class="eyebrow">404</p>
        <h1>This PureLink is not here.</h1>
        <p class="lede">It may have been removed, expired, or typed incorrectly.</p>
        <a class="primary-link compact" href="/">Return home</a>
      </main>
    `,
  });
}

function documentShell({ title, description, body, robots = 'noindex, nofollow', script = '', nonce = '', externalScript = '', externalScripts = [] }) {
  const scriptMarkup = script ? `<script nonce="${escapeHtml(nonce)}">${script}</script>` : '';
  const scripts = [externalScript, ...externalScripts].filter(Boolean);
  const externalScriptMarkup = scripts.map((source) => source.startsWith('https://challenges.cloudflare.com/')
    ? `<script src="${escapeHtml(source)}" async defer></script>`
    : `<script type="module" src="${escapeHtml(source)}"></script>`).join('');
  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="${escapeHtml(robots)}">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="/assets/katex/katex.min.css">
  <style>
    :root { color-scheme: light; --ink: #17231f; --muted: #65716b; --line: #dce3df; --paper: #f7f8f5; --surface: rgba(255,255,255,.88); --green: #235c48; }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    body { margin: 0; min-height: 100vh; color: var(--ink); background: radial-gradient(circle at 15% 5%, #e4f0e8 0, transparent 28rem), var(--paper); font-family: ui-rounded, "SF Pro Rounded", "Avenir Next", system-ui, sans-serif; }
    a { color: inherit; }
    .home, .page { width: min(calc(100% - 2rem), 58rem); min-height: 100vh; margin: 0 auto; display: flex; flex-direction: column; justify-content: center; }
    .home { align-items: flex-start; padding: 5rem 0; }
    .page { padding: 3rem 0; }
    .eyebrow { margin: 0 0 1rem; color: var(--green); font-size: .75rem; font-weight: 750; letter-spacing: .18em; }
    h1 { max-width: 13ch; margin: 0; font-size: clamp(3rem, 9vw, 6.6rem); font-weight: 680; letter-spacing: -.06em; line-height: .94; }
    .lede { max-width: 35rem; margin: 1.75rem 0 0; color: var(--muted); font-size: clamp(1.05rem, 2.5vw, 1.35rem); line-height: 1.65; }
    .status { display: inline-flex; align-items: center; gap: .65rem; margin-top: 3rem; padding: .7rem 1rem; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); color: var(--muted); font-size: .86rem; }
    .status-dot { width: .55rem; height: .55rem; border-radius: 50%; background: #37a875; box-shadow: 0 0 0 .25rem #dff3e9; }
    .creator-home { width: min(calc(100% - 2rem), 68rem); gap: 4rem; }
    .account-entry { position: fixed; z-index: 20; top: max(1rem, env(safe-area-inset-top)); right: max(1rem, env(safe-area-inset-right)); }
    .account-entry a { display: inline-flex; align-items: center; justify-content: center; min-height: 2.7rem; padding: .7rem 1rem; border: 1px solid var(--line); border-radius: 999px; background: rgba(255,255,255,.9); box-shadow: 0 .65rem 2rem rgba(35,62,50,.1); color: var(--ink); text-decoration: none; font-size: .82rem; font-weight: 750; backdrop-filter: blur(18px); }
    .account-entry a:hover, .account-entry a:focus-visible { border-color: var(--green); background: white; }
    .hero { padding-top: 3rem; }
    .creator-panel { width: 100%; }
    .auth-notice { width: 100%; display: flex; align-items: center; gap: .7rem 1rem; flex-wrap: wrap; padding: .9rem 1rem; border: 1px solid #d8ceb0; border-radius: 1rem; background: #fffaf0; color: #6d654f; font-size: .8rem; line-height: 1.5; }
    .auth-notice strong { color: var(--ink); }
    .auth-notice a { margin-left: auto; font-weight: 700; }
    .creator-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1.5rem; }
    h2 { margin: 0; font-size: clamp(1.7rem, 4vw, 2.5rem); letter-spacing: -.04em; }
    .suggestion { width: auto; padding: .55rem .8rem; border: 1px solid #bed8ca; background: #edf7f1; color: var(--green); font-size: .75rem; }
    .type-tabs { display: grid; grid-template-columns: repeat(3, 1fr); gap: .65rem; margin-bottom: 1.6rem; }
    .type-tab { display: flex; align-items: center; justify-content: center; gap: .5rem; border: 1px solid var(--line); background: transparent; color: var(--muted); }
    .type-tab span { font-size: 1.2rem; }
    .type-tab.active { border-color: var(--ink); background: var(--ink); color: white; }
    .field-label, legend { display: block; margin: 1rem 0 .55rem; color: var(--ink); font-size: .85rem; font-weight: 700; }
    textarea, input:not([type="checkbox"]):not([type="radio"]) { width: 100%; border: 1px solid var(--line); border-radius: 1.15rem; background: rgba(249,251,249,.9); color: var(--ink); font: inherit; outline: none; }
    select { width: 100%; padding: .9rem 1rem; border: 1px solid var(--line); border-radius: 1.15rem; background: rgba(249,251,249,.9); color: var(--ink); font: inherit; }
    textarea { min-height: 10rem; padding: 1.1rem; resize: vertical; line-height: 1.6; }
    input:not([type="checkbox"]):not([type="radio"]) { padding: .9rem 1rem; }
    textarea:focus, input:focus { border-color: var(--green); box-shadow: 0 0 0 .2rem rgba(35,92,72,.1); }
    .field-meta { display: flex; justify-content: space-between; gap: 1rem; margin-top: .5rem; color: var(--muted); font-size: .74rem; line-height: 1.45; }
    .field-meta span:first-child { max-width: 38rem; }
    .field-meta span:last-child { white-space: nowrap; }
    .content-workspace.formula-mode { display: grid; grid-template-columns: minmax(0, 1fr) minmax(16rem, .85fr); gap: 1rem; align-items: stretch; }
    .content-input-pane { min-width: 0; }
    .formula-preview { min-height: 11rem; margin-top: 1.75rem; padding: 1rem; border: 1px solid var(--line); border-radius: 1.2rem; background: #f8fbf9; overflow: auto; }
    .preview-label { display: block; margin-bottom: .75rem; color: var(--green); font-size: .7rem; font-weight: 750; letter-spacing: .12em; }
    .formula-preview p { margin: 1.5rem 0; color: var(--muted); font-size: .82rem; line-height: 1.6; }
    .formula-preview-rendered { min-height: 7rem; display: flex; flex-direction: column; justify-content: center; overflow: auto; line-height: 1.8; }
    .formula-tools { margin: .4rem 0 1.2rem; padding: 1rem; border: 1px solid var(--line); border-radius: 1.2rem; background: #f8fbf9; }
    .formula-tool-heading { display: flex; justify-content: space-between; gap: 1rem; margin-bottom: .8rem; font-size: .78rem; }
    .formula-tool-heading span { color: var(--muted); }
    .formula-category-tabs { display: flex; gap: .4rem; margin: 0 -.1rem .75rem; padding: .1rem; overflow-x: auto; scrollbar-width: thin; }
    .formula-category-tabs button { width: auto; flex: 0 0 auto; min-height: 2.35rem; padding: .48rem .78rem; border: 1px solid var(--line); border-radius: 999px; background: white; color: var(--muted); font-size: .75rem; }
    .formula-category-tabs button[aria-selected="true"] { border-color: var(--ink); background: var(--ink); color: white; }
    .symbol-groups { display: grid; gap: .55rem; }
    .symbol-group { display: flex; flex-wrap: wrap; gap: .4rem; }
    .symbol-group button { width: auto; min-width: 2.55rem; padding: .55rem .7rem; border: 1px solid var(--line); border-radius: .7rem; background: white; color: var(--ink); font-family: ui-serif, Georgia, serif; font-size: .88rem; }
    .symbol-group button:hover, .symbol-group button:focus-visible { border-color: var(--green); background: #edf5f1; }
    .conditional-options { margin-top: 1.25rem; padding: .25rem 1rem; border: 1px solid var(--line); border-radius: 1.15rem; }
    .check-row { display: flex; align-items: flex-start; gap: .8rem; padding: .9rem 0; border-bottom: 1px solid var(--line); cursor: pointer; }
    .check-row:last-child { border-bottom: 0; }
    .check-row input { margin-top: .2rem; accent-color: var(--green); }
    .check-row span { display: grid; gap: .2rem; }
    .check-row small { color: var(--muted); line-height: 1.45; }
    .theme-picker { margin: 1rem 0; padding: 0; border: 0; }
    .theme-picker div { display: flex; }
    .theme-picker label { display: inline-block; margin-right: .5rem; cursor: pointer; }
    .theme-picker input { position: absolute; opacity: 0; pointer-events: none; }
    .theme-swatch { display: inline-block; padding: .65rem .85rem; border: 2px solid transparent; border-radius: 999px; font-size: .8rem; }
    .theme-picker input:checked + .theme-swatch { border-color: var(--green); }
    .paper-swatch { background: #f7f5ee; color: #38372f; }
    .mist-swatch { background: #dfece8; color: #345b53; }
    .night-swatch { background: #1b252b; color: #edf4f0; }
    .advanced-options { margin: 1rem 0; padding: .85rem 0; color: var(--muted); }
    .advanced-options summary { cursor: pointer; font-size: .85rem; font-weight: 650; }
    .create-button { border: 1px solid var(--ink); background: var(--ink); color: white; }
    .privacy-note { margin: .85rem 0 0; color: var(--muted); font-size: .72rem; line-height: 1.5; text-align: center; }
    .turnstile-wrap { display: flex; justify-content: center; margin: 1rem 0; }
    .form-error { padding: .85rem 1rem; border-radius: 1rem; background: #fff0ee; color: #8a322c; font-size: .85rem; }
    .result-panel h2 { margin-bottom: 1.25rem; }
    .result-url { display: block; padding: 1rem; border-radius: 1rem; background: #edf2ef; font-family: ui-monospace, "SFMono-Regular", monospace; overflow-wrap: anywhere; }
    .result-actions, .recovery-actions { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem; margin-top: .8rem; }
    .secondary-link { display: flex; align-items: center; justify-content: center; padding: .95rem 1.1rem; border: 1px solid var(--line); border-radius: 999px; text-decoration: none; font-weight: 700; }
    .recovery-box { margin-top: 2rem; padding: 1.2rem; border: 1px solid #d8ceb0; border-radius: 1.2rem; background: #fffaf0; }
    .recovery-box p { margin: .5rem 0; color: #6d654f; font-size: .82rem; line-height: 1.55; }
    .quiet-button { margin-top: 1.25rem; border: 0; background: transparent; color: var(--muted); }
    .home-footer { padding-bottom: 3rem; color: var(--muted); font-size: .75rem; line-height: 1.6; }
    .home-footer nav { display: flex; flex-wrap: wrap; gap: 1rem; }
    .wordmark { width: fit-content; margin-bottom: 1.2rem; text-decoration: none; font-weight: 750; }
    .panel { padding: clamp(1.4rem, 5vw, 3.5rem); border: 1px solid var(--line); border-radius: 2rem; background: var(--surface); box-shadow: 0 1.5rem 5rem rgba(35, 62, 50, .08); backdrop-filter: blur(18px); }
    .preview-panel h1 { max-width: none; font-size: clamp(2rem, 6vw, 4.5rem); overflow-wrap: anywhere; }
    .destination-url { margin: 1.5rem 0; padding: 1rem; border-radius: 1rem; background: #edf2ef; color: #435149; font-family: ui-monospace, "SFMono-Regular", monospace; overflow-wrap: anywhere; }
    .facts { margin: 1.5rem 0 2rem; border-block: 1px solid var(--line); }
    .facts p { display: grid; grid-template-columns: minmax(7rem, .4fr) 1fr; gap: 1rem; margin: 0; padding: 1rem 0; border-bottom: 1px solid var(--line); }
    .facts p:last-child { border-bottom: 0; }
    .facts span { color: var(--muted); }
    .primary-link { display: inline-flex; justify-content: center; padding: .95rem 1.25rem; border-radius: 999px; background: var(--ink); color: white; text-decoration: none; font-weight: 700; }
    .primary-link.compact { margin-top: 2rem; }
    .shared-content { margin: 2rem 0; white-space: pre-wrap; overflow-wrap: anywhere; }
    .formula-rendered { font-size: clamp(1.05rem, 3vw, 1.45rem); line-height: 1.8; text-align: center; }
    .formula-source { margin: .75rem 0 0; padding: 1.25rem; border-radius: 1.25rem; background: #edf2ef; font-size: .88rem; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; }
    .source-details { margin-top: 1.5rem; color: var(--muted); }
    .source-details summary { cursor: pointer; font-weight: 650; }
    .share-export { padding: clamp(1.2rem, 4vw, 2.5rem); border-radius: 1.4rem; background: #fff; color: var(--ink); }
    .formula-export { min-height: 14rem; display: flex; flex-direction: column; justify-content: center; }
    .card-export { min-height: 20rem; display: flex; flex-direction: column; justify-content: center; }
    .content-actions { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem; margin-top: 1rem; }
    .export-brand-option { display: flex; gap: .7rem; margin-top: 1rem; padding: .9rem 1rem; border: 1px solid var(--line); border-radius: 1rem; cursor: pointer; }
    .export-brand-option input { margin-top: .15rem; accent-color: var(--green); }
    .export-brand-option span { display: grid; gap: .2rem; }
    .export-brand-option small { color: var(--muted); line-height: 1.45; }
    .card-copy { font-family: ui-serif, "New York", Georgia, serif; font-size: clamp(1.35rem, 4vw, 2.2rem); line-height: 1.7; }
    .signature { margin: 1.5rem 0 0; color: var(--muted); text-align: right; }
    .notice { margin: 2.5rem 0 0; color: var(--muted); font-size: .78rem; line-height: 1.6; }
    .report-link { display: inline-block; margin-top: 1rem; color: var(--muted); font-size: .75rem; }
    .manage-title { max-width: 16ch; font-size: clamp(2.4rem, 7vw, 5rem); }
    .manage-lede { margin-bottom: 2rem; }
    .legal-page { max-width: 52rem; }
    .legal-title { max-width: 15ch; font-size: clamp(2.5rem, 7vw, 5.4rem); }
    .legal-intro { margin-bottom: 2.5rem; }
    .legal-sections { display: grid; gap: 2rem; }
    .legal-sections section { padding-top: 2rem; border-top: 1px solid var(--line); }
    .legal-sections h2 { font-size: 1.2rem; letter-spacing: -.02em; }
    .legal-sections p { margin: .7rem 0 0; color: var(--muted); line-height: 1.8; }
    .legal-updated { margin: 2.5rem 0 0; color: var(--muted); font-size: .75rem; }
    .manage-actions { display: grid; gap: .75rem; }
    .managed-content-card { display: grid; grid-template-columns: auto 1fr auto; gap: .8rem; align-items: center; margin: 1.5rem 0; padding: 1rem; border: 1px solid var(--line); border-radius: 1.2rem; background: #f8fbf9; }
    .managed-content-card span { color: var(--muted); font-size: .75rem; }
    .managed-content-card .primary-link { padding: .7rem 1rem; }
    .account-connect { display: grid; gap: .7rem; margin: 1rem 0 1.5rem; padding: 1rem; border-radius: 1.2rem; background: #edf5f1; }
    .account-connect p { margin: 0; color: var(--muted); line-height: 1.55; }
    .google-link { display: flex; justify-content: center; padding: .85rem 1rem; border: 1px solid var(--line); border-radius: 999px; background: white; text-decoration: none; font-weight: 700; }
    .account-links { display: grid; gap: .7rem; margin: 0 0 1.5rem; padding: 0; list-style: none; }
    .account-links li { display: grid; grid-template-columns: 1fr auto auto; gap: .8rem; align-items: center; padding: 1rem; border: 1px solid var(--line); border-radius: 1rem; }
    .account-links li div { display: grid; gap: .2rem; }
    .account-links li span { color: var(--muted); font-size: .72rem; }
    .account-links .empty-account { display: block; color: var(--muted); }
    button { width: 100%; padding: .95rem 1.1rem; border-radius: 999px; font: inherit; font-weight: 700; cursor: pointer; }
    button:disabled { cursor: wait; opacity: .55; }
    .secondary-button { border: 1px solid var(--line); background: transparent; color: var(--ink); }
    .danger-button { margin-top: .5rem; border: 1px solid #d7aaa7; background: #fff4f2; color: #8a322c; }
    .theme-mist { --paper: #edf4f2; --surface: rgba(247,252,250,.9); --green: #426e68; }
    .theme-night { color-scheme: dark; --paper: #141b20; --surface: rgba(28,38,44,.92); --ink: #edf4f0; --muted: #a8b7b0; --line: #3a4843; --green: #91cbb4; }
    .theme-mist .card-export { background: #e6f0ed; }
    .theme-night .card-export { background: #1b252b; }
    @media (max-width: 46rem) { .content-workspace.formula-mode { grid-template-columns: 1fr; } .formula-preview { margin-top: 0; } }
    @media (max-width: 38rem) { .account-entry a { min-height: 2.5rem; padding: .6rem .85rem; } .facts p { grid-template-columns: 1fr; gap: .35rem; } .panel { border-radius: 1.35rem; } .creator-heading, .formula-tool-heading { display: grid; } .type-tabs { gap: .4rem; } .field-meta { display: grid; } .result-actions, .recovery-actions, .content-actions { grid-template-columns: 1fr; } .managed-content-card { grid-template-columns: 1fr; } .account-links li { grid-template-columns: 1fr auto; } }
  </style>
</head>
<body>${body}${scriptMarkup}${externalScriptMarkup}</body>
</html>`;
}

function formatDate(value) {
  if (!value) return 'Unknown';
  const date = new Date(value.endsWith?.('Z') ? value : `${value}Z`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
}

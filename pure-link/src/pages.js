import { escapeHtml } from './http.js';
import { renderFormulaContent } from './formula.js';

const PLATFORM_NOTICE = '透過 PureLink 分享的內容與外部網站由建立者提供，不代表 PureLink 的立場、推薦、背書或安全保證。';

export function renderHomePage(nonce, turnstileSiteKey = '') {
  const turnstileWidget = turnstileSiteKey
    ? `<div class="turnstile-wrap"><div class="cf-turnstile" data-sitekey="${escapeHtml(turnstileSiteKey)}" data-action="create"></div></div>`
    : '';
  return documentShell({
    title: 'PureLink — 安靜地分享',
    description: '以簡潔、尊重隱私的方式分享網址、數學公式或一張短文小卡。',
    body: `
      <main class="home creator-home">
        <header class="hero">
          <p class="eyebrow">PURELINK</p>
          <h1>清楚地分享，<br>少留一點痕跡。</h1>
          <p class="lede">把網址、公式，或一段想好好送出去的話，交給一個安靜的連結。</p>
        </header>

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

            <label class="field-label" for="content">內容</label>
            <textarea id="content" name="content" maxlength="4096" placeholder="example.com" required></textarea>
            <div class="field-meta"><span id="content-help">我們會補上 HTTPS，但不會暗中改寫網址。</span><span id="character-count">0 / 4096</span></div>

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
              <label class="field-label" for="slug">pure.link/</label>
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
              <a class="secondary-link" id="preview-link" href="" hidden>查看 + 預覽</a>
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
          <nav aria-label="服務資訊"><a href="/privacy">隱私說明</a><a href="/terms">使用與內容規範</a><a href="/transparency">透明度</a></nav>
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
        updateCount();
        updateSuggestion();
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
        const text = 'PureLink 匿名管理憑證\\n\\n' + latestResult.managementUrl + '\\n\\n請妥善保管；PureLink 無法恢復遺失的匿名憑證。\\n';
        const anchor = document.createElement('a');
        anchor.download = 'purelink-' + latestResult.slug + '-recovery.txt';
        anchor.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(text);
        anchor.click();
      });

      document.getElementById('create-another').addEventListener('click', () => {
        latestResult = null;
        form.reset();
        selectType('url');
        form.hidden = false;
        resultPanel.hidden = true;
        content.focus();
      });

      selectType('url');
    `,
    nonce,
    externalScript: turnstileSiteKey ? 'https://challenges.cloudflare.com/turnstile/v0/api.js' : '',
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
            <p class="eyebrow">PURELINK · FORMULA</p>
            <div class="shared-content formula-rendered">${renderFormulaContent(link.content)}</div>
          </div>
          <div class="content-actions">
            <button class="secondary-button" type="button" data-copy-content>複製原始內容</button>
            <button class="secondary-button" type="button" data-download-png data-filename="purelink-${escapeHtml(link.slug)}-formula.png">下載 PNG</button>
          </div>
          <details class="source-details">
            <summary>查看原始 LaTeX</summary>
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
            <p class="eyebrow">PURELINK · A SMALL CARD</p>
            <p class="shared-content card-copy">${escapeHtml(link.content)}</p>
            ${signature}
          </div>
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
        ['目前的資料邊界', '內容資料庫保存分享內容、設定與匿名管理雜湊；統計資料庫只保存每日聚合數字；速率限制只保存短期不可逆代碼；檢舉不要求姓名或電子郵件。'],
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

export function renderManagePage(slug, nonce) {
  const safeSlugScript = JSON.stringify(slug).replaceAll('<', '\\u003c');
  return documentShell({
    title: 'Manage your PureLink',
    description: 'Manage an anonymous PureLink using its private management credential.',
    robots: 'noindex, nofollow, noarchive',
    body: `
      <main class="page">
        <a class="wordmark" href="/">PureLink</a>
        <article class="panel manage-panel">
          <p class="eyebrow">ANONYMOUS MANAGEMENT</p>
          <h1 class="manage-title">Keep this access safe.</h1>
          <p class="lede manage-lede">PureLink does not know who created this link. Save this management address now; it cannot be recovered if both this browser and your copy are lost.</p>
          <div class="manage-actions" id="manage-actions" hidden>
            <button class="secondary-button" id="copy-management" type="button">Copy management address</button>
            <button class="secondary-button" id="download-recovery" type="button">Download recovery file</button>
            <button class="danger-button" id="delete-link" type="button">Delete this PureLink</button>
          </div>
          <p class="notice" id="management-status" role="status">Checking this browser for management access…</p>
        </article>
      </main>
    `,
    script: `
      const slug = ${safeSlugScript};
      const storageKey = 'purelink:management:' + slug;
      const fragmentToken = location.hash.slice(1);
      if (fragmentToken) localStorage.setItem(storageKey, fragmentToken);
      const token = fragmentToken || localStorage.getItem(storageKey) || '';
      const actions = document.getElementById('manage-actions');
      const status = document.getElementById('management-status');
      const canonicalAddress = location.origin + '/manage/' + encodeURIComponent(slug) + '#' + token;

      if (token) {
        actions.hidden = false;
        status.textContent = 'Management access is available on this device.';
      } else {
        status.textContent = 'No management credential was found. PureLink cannot recover an anonymous credential.';
      }

      document.getElementById('copy-management').addEventListener('click', async (event) => {
        await navigator.clipboard.writeText(canonicalAddress);
        const button = event.currentTarget;
        button.textContent = 'Copied';
        setTimeout(() => { button.textContent = 'Copy management address'; }, 1600);
      });

      document.getElementById('download-recovery').addEventListener('click', () => {
        const recoveryText = 'PureLink anonymous management credential\\n\\n' + canonicalAddress + '\\n\\nKeep this file private. PureLink cannot recover this credential.\\n';
        const anchor = document.createElement('a');
        anchor.download = 'purelink-' + slug + '-recovery.txt';
        anchor.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(recoveryText);
        anchor.click();
      });

      let deleteArmed = false;
      document.getElementById('delete-link').addEventListener('click', async (event) => {
        const button = event.currentTarget;
        if (!deleteArmed) {
          deleteArmed = true;
          button.textContent = 'Press again to permanently delete';
          setTimeout(() => { deleteArmed = false; button.textContent = 'Delete this PureLink'; }, 5000);
          return;
        }

        button.disabled = true;
        const response = await fetch('/api/links/' + encodeURIComponent(slug), {
          method: 'DELETE',
          headers: { authorization: 'Bearer ' + token },
        });
        if (response.ok) {
          localStorage.removeItem(storageKey);
          actions.hidden = true;
          history.replaceState(null, '', location.pathname);
          status.textContent = 'This PureLink has been permanently deleted.';
        } else {
          button.disabled = false;
          deleteArmed = false;
          button.textContent = 'Delete this PureLink';
          status.textContent = 'Deletion failed. Check the management address and try again.';
        }
      });
    `,
    nonce,
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

function documentShell({ title, description, body, robots = 'noindex, nofollow', script = '', nonce = '', externalScript = '' }) {
  const scriptMarkup = script ? `<script nonce="${escapeHtml(nonce)}">${script}</script>` : '';
  const externalScriptMarkup = externalScript
    ? externalScript.startsWith('https://challenges.cloudflare.com/')
      ? `<script src="${escapeHtml(externalScript)}" async defer></script>`
      : `<script type="module" src="${escapeHtml(externalScript)}"></script>`
    : '';
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
    .hero { padding-top: 3rem; }
    .creator-panel { width: 100%; }
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
    button { width: 100%; padding: .95rem 1.1rem; border-radius: 999px; font: inherit; font-weight: 700; cursor: pointer; }
    button:disabled { cursor: wait; opacity: .55; }
    .secondary-button { border: 1px solid var(--line); background: transparent; color: var(--ink); }
    .danger-button { margin-top: .5rem; border: 1px solid #d7aaa7; background: #fff4f2; color: #8a322c; }
    .theme-mist { --paper: #edf4f2; --surface: rgba(247,252,250,.9); --green: #426e68; }
    .theme-night { color-scheme: dark; --paper: #141b20; --surface: rgba(28,38,44,.92); --ink: #edf4f0; --muted: #a8b7b0; --line: #3a4843; --green: #91cbb4; }
    .theme-mist .card-export { background: #e6f0ed; }
    .theme-night .card-export { background: #1b252b; }
    @media (max-width: 38rem) { .facts p { grid-template-columns: 1fr; gap: .35rem; } .panel { border-radius: 1.35rem; } .creator-heading { display: grid; } .type-tabs { gap: .4rem; } .field-meta { display: grid; } .result-actions, .recovery-actions { grid-template-columns: 1fr; } }
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

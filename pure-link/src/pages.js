import { escapeHtml } from './http.js';
import { renderFormulaContent } from './formula.js';

const PLATFORM_NOTICE = 'Shared content and destination sites are provided by their creators. They do not represent PureLink’s views, endorsement, or guarantee of safety.';

export function renderHomePage(nonce) {
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
          if (!response.ok) throw new Error(result.error || '建立失敗，請稍後再試。');
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
        </article>
      </main>
    `,
    externalScript: '/assets/content-actions.js',
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
  const externalScriptMarkup = externalScript ? `<script type="module" src="${escapeHtml(externalScript)}"></script>` : '';
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
    .form-error { padding: .85rem 1rem; border-radius: 1rem; background: #fff0ee; color: #8a322c; font-size: .85rem; }
    .result-panel h2 { margin-bottom: 1.25rem; }
    .result-url { display: block; padding: 1rem; border-radius: 1rem; background: #edf2ef; font-family: ui-monospace, "SFMono-Regular", monospace; overflow-wrap: anywhere; }
    .result-actions, .recovery-actions { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem; margin-top: .8rem; }
    .secondary-link { display: flex; align-items: center; justify-content: center; padding: .95rem 1.1rem; border: 1px solid var(--line); border-radius: 999px; text-decoration: none; font-weight: 700; }
    .recovery-box { margin-top: 2rem; padding: 1.2rem; border: 1px solid #d8ceb0; border-radius: 1.2rem; background: #fffaf0; }
    .recovery-box p { margin: .5rem 0; color: #6d654f; font-size: .82rem; line-height: 1.55; }
    .quiet-button { margin-top: 1.25rem; border: 0; background: transparent; color: var(--muted); }
    .home-footer { padding-bottom: 3rem; color: var(--muted); font-size: .75rem; line-height: 1.6; }
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
    .manage-title { max-width: 16ch; font-size: clamp(2.4rem, 7vw, 5rem); }
    .manage-lede { margin-bottom: 2rem; }
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

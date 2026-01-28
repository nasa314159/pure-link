/**
 * Project PureLink - Admin 3.0 (Secured & Polished)
 * Features: 
 * - Strict Slug Validation (No special chars)
 * - Duplicate Slug Prevention
 * - UI/UX Polish (No Emojis, Auto Button Reset)
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = decodeURIComponent(url.pathname.slice(1));

    // Admin 介面
    if (path === "admin") {
      return new Response(renderAdminPage(), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    // API: 建立連結
    if (path === "api/create" && request.method === "POST") {
      return handleCreateLink(request, env);
    }

    // 核心跳轉邏輯
    const isPreview = path.endsWith('+');
    const lookupSlug = isPreview ? path.slice(0, -1) : path;
    if (lookupSlug === "") return new Response("PureLink: Operational.");

    const linkData = await env.pure_link_db.prepare(
      "SELECT content, type, is_affiliate FROM links WHERE slug = ?"
    ).bind(lookupSlug).first();

    if (!linkData) return new Response("404 - Link not found.", { status: 404 });

    if (isPreview || linkData.type === 'latex') {
      return new Response(generateHTML(linkData, lookupSlug), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    return Response.redirect(sanitize(linkData.content), 301);
  },
};

// --- Backend Logic ---

async function handleCreateLink(request, env) {
  try {
    const formData = await request.formData();
    let slug = formData.get("slug").trim();
    let content = formData.get("content").trim();
    const secret = formData.get("secret");
    let type = formData.get("type");

    // 1. 權限驗證
    const correctSecret = env.ADMIN_SECRET || "science"; 
    if (secret !== correctSecret) return new Response(JSON.stringify({ success: false, msg: "⛔ Wrong Secret" }), { status: 403 });

    // 2. Slug 自動生成與清洗
    if (!slug) {
      slug = Math.random().toString(36).substring(2, 8);
    } else {
      // ★ 後端強制清洗：只允許 英數、底線、減號
      if (!/^[a-zA-Z0-9-_]+$/.test(slug)) {
        return new Response(JSON.stringify({ success: false, msg: "❌ Invalid Slug: Only a-z, 0-9, - and _ allowed." }), { status: 400 });
      }
    }

    // ★ 3. 檢查 Slug 是否重複 (防止 SQL 報錯)
    const existing = await env.pure_link_db.prepare("SELECT 1 FROM links WHERE slug = ?").bind(slug).first();
    if (existing) {
       return new Response(JSON.stringify({ success: false, msg: `⚠️ Slug '${slug}' already exists. Please choose another.` }), { status: 409 });
    }

    // 4. 自動識別邏輯
    if (type === "auto") {
      const latexPatterns = /[\\^_{}]|\b(frac|sqrt|partial|hbar|hat|psi|phi)\b/i;
      const isUrl = /^(http|https):\/\/|www\.|\.[a-z]{2,}/i.test(content);
      type = latexPatterns.test(content) ? "latex" : (isUrl ? "url" : "latex");
    }

    // 5. URL 補全
    if (type === "url" && !/^https?:\/\//i.test(content)) {
      content = "https://" + content;
    }

    // 6. 寫入資料庫
    await env.pure_link_db.prepare(
      "INSERT INTO links (slug, type, content, is_affiliate) VALUES (?, ?, ?, 0)"
    ).bind(slug, type, content).run();

    const fullUrl = new URL(request.url).origin + "/" + slug;
    return new Response(JSON.stringify({ success: true, slug: slug, type: type, fullUrl: fullUrl }), { headers: { "content-type": "application/json" } });

  } catch (e) {
    return new Response(JSON.stringify({ success: false, msg: e.message }), { status: 500 });
  }
}

// --- Frontend UI (Admin 3.0) ---

function renderAdminPage() {
  return `
  <!DOCTYPE html>
  <html lang="zh-TW">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PureLink Console</title>
    <style>
      :root { --accent: #007aff; --bg: #f2f2f7; --card: #ffffff; }
      body { font-family: -apple-system, sans-serif; background: var(--bg); display: flex; justify-content: center; padding-top: 40px; margin: 0; min-height: 100vh; }
      
      .container { width: 100%; max-width: 400px; padding: 20px; }
      .card { background: var(--card); padding: 30px; border-radius: 24px; box-shadow: 0 8px 30px rgba(0,0,0,0.06); margin-bottom: 20px; }
      
      h2 { text-align: center; margin: 0 0 25px 0; color: #1c1c1e; font-weight: 700; letter-spacing: -0.5px; }
      
      .input-group { margin-bottom: 18px; }
      .label { font-size: 12px; color: #8e8e93; font-weight: 600; margin-bottom: 6px; display: flex; justify-content: space-between; }
      
      input, select, textarea { width: 100%; padding: 14px; border: 1px solid #e5e5ea; border-radius: 14px; background: #f9f9f9; font-size: 16px; box-sizing: border-box; transition: 0.2s; outline: none; }
      input:focus, textarea:focus { background: #fff; border-color: var(--accent); box-shadow: 0 0 0 4px rgba(0,122,255,0.1); }
      textarea { min-height: 100px; resize: vertical; font-family: monospace; }
      
      .badge { padding: 4px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; background: #e5e5ea; color: #8e8e93; }
      .badge.latex { background: #34c759; color: white; }
      .badge.url { background: #007aff; color: white; }
      
      button { width: 100%; padding: 16px; background: var(--accent); color: white; border: none; border-radius: 16px; font-size: 16px; font-weight: 600; cursor: pointer; transition: 0.2s; }
      button:active { transform: scale(0.96); }
      button:disabled { opacity: 0.5; cursor: not-allowed; }

      #result-card { display: none; text-align: center; border: 2px solid #34c759; background: #f0fdf4; }
      .success-title { color: #34c759; font-weight: 700; margin-bottom: 10px; }
      .result-link { font-size: 18px; font-weight: 600; word-break: break-all; color: #1c1c1e; margin-bottom: 15px; display: block; text-decoration: none; }
      .action-row { display: flex; gap: 10px; }
      .btn-secondary { background: white; color: var(--accent); border: 1px solid var(--accent); }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="card">
        <h2>PureLink Console</h2>
        <form id="create-form">
          <div class="input-group">
            <div class="label">ADMIN SECRET</div>
            <input type="password" name="secret" placeholder="••••••" required>
          </div>
          
          <div class="input-group">
            <div class="label">SLUG (Optional) <span class="badge">A-Z, 0-9, -, _</span></div>
            <input type="text" name="slug" id="slug-input" placeholder="e.g. qm-notes">
          </div>
          
          <div class="input-group">
            <div class="label">CONTENT <span id="type-badge" class="badge">AUTO</span></div>
            <textarea name="content" id="content-area" placeholder="https://... or \hbar" required></textarea>
            <input type="hidden" name="type" id="type-input" value="auto">
          </div>
          
          <button type="submit" id="submit-btn">Create Node</button>
        </form>
      </div>

      <div class="card" id="result-card">
        <div class="success-title">✅ NODE CREATED</div>
        <a href="#" target="_blank" class="result-link" id="result-url">...</a>
        <div class="action-row">
          <button type="button" class="btn-secondary" onclick="copyResult()">Copy</button>
          <button type="button" onclick="resetForm()">New</button>
        </div>
      </div>
    </div>

    <script>
      const form = document.getElementById('create-form');
      const slugInput = document.getElementById('slug-input');
      const contentArea = document.getElementById('content-area');
      const typeBadge = document.getElementById('type-badge');
      const typeInput = document.getElementById('type-input');
      const resultCard = document.getElementById('result-card');
      const submitBtn = document.getElementById('submit-btn');
      
      // ★ 前端 Slug 限制：輸入時自動刪除非法字元
      slugInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/[^a-zA-Z0-9-_]/g, '');
      });

      contentArea.addEventListener('input', (e) => {
        const val = e.target.value;
        const latexPatterns = /[\\\\^_{}]|\\b(frac|sqrt|partial|hbar|hat)\\b/i;
        const isUrl = /^(http|https):\\/\\/|www\\.|\\.[a-z]{2,}/i.test(val);

        if (latexPatterns.test(val)) {
          typeBadge.innerText = 'LATEX';
          typeBadge.className = 'badge latex';
          typeInput.value = 'auto';
        } else if (isUrl) {
          typeBadge.innerText = 'URL';
          typeBadge.className = 'badge url';
          typeInput.value = 'auto';
        } else {
          typeBadge.innerText = 'AUTO';
          typeBadge.className = 'badge';
        }
      });

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        submitBtn.disabled = true;
        submitBtn.innerText = "Processing...";

        const formData = new FormData(form);
        
        try {
          const res = await fetch('/api/create', { method: 'POST', body: formData });
          const json = await res.json();
          
          if (json.success) {
            document.getElementById('result-url').innerText = json.fullUrl;
            document.getElementById('result-url').href = json.fullUrl;
            resultCard.style.display = 'block';
            form.style.display = 'none'; // 隱藏表單
          } else {
            alert("Error: " + json.msg);
          }
        } catch (err) {
          alert("Network Error");
        } finally {
          submitBtn.disabled = false;
          submitBtn.innerText = "Create Node";
        }
      });

      function copyResult() {
        const url = document.getElementById('result-url').innerText;
        navigator.clipboard.writeText(url);
        const btn = document.querySelector('.btn-secondary');
        btn.innerText = "Copied!";
        setTimeout(() => btn.innerText = "Copy", 2000);
      }

      function resetForm() {
        form.reset();
        form.style.display = 'block';
        resultCard.style.display = 'none';
        typeBadge.innerText = 'AUTO';
        typeBadge.className = 'badge';
      }
    </script>
  </body>
  </html>
  `;
}

// 核心 Sanitize
function sanitize(u) {
  try {
    const url = new URL(u);
    ['fbclid', 'igshid', 'gclid', 'utm_source', 'utm_medium', 'utm_campaign', 'si'].forEach(p => url.searchParams.delete(p));
    return url.toString().replace(/[?&]$/, "");
  } catch (e) { return u; }
}

// 核心渲染 (更新標題 + 按鈕修復)
function generateHTML(data, slug) { // 這裡記得傳入 slug 供下載檔名使用
  const isLaTeX = data.type === 'latex';
  // ★ 修改標題：移除 Emoji，更專業
  const pageTitle = isLaTeX ? "Scientific Note | PureLink" : "Link Preview | PureLink";
  
  return `
  <!DOCTYPE html>
  <html lang="zh-TW">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>${pageTitle}</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
    <style>
      :root { --bg: #f2f2f7; --card: #ffffff; --text: #1c1c1e; --secondary: #8e8e93; }
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
      
      .card { background: var(--card); width: 85%; max-width: 420px; padding: 35px 25px; border-radius: 30px; box-shadow: 0 10px 40px rgba(0,0,0,0.06); text-align: center; }
      .badge { display: inline-block; padding: 6px 14px; border-radius: 20px; font-size: 11px; font-weight: 700; background: #e5e5ea; color: var(--secondary); margin-bottom: 25px; text-transform: uppercase; letter-spacing: 1px; }
      
      .content { font-size: 1.15rem; margin-bottom: 30px; color: var(--text); min-height: 80px; display: flex; justify-content: center; align-items: center; border-radius: 16px; transition: all 0.2s ease; position: relative; }
      .content.clickable { cursor: pointer; }
      .content.clickable:active { transform: scale(0.98); background: #f9f9f9; }

      #math-display { font-size: 1.6rem; width: 100%; padding: 20px 10px; }
      
      .copy-group { display: flex; gap: 8px; justify-content: center; margin-top: 25px; flex-wrap: wrap; }
      .copy-btn { flex: 1; min-width: 90px; padding: 12px 8px; border: 1px solid #d1d1d6; border-radius: 14px; background: white; cursor: pointer; font-size: 12px; font-weight: 600; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 4px; }
      .copy-btn:active { transform: scale(0.95); background: #f2f2f7; }
      .copy-btn.success { border-color: #34c759; color: #34c759; background: #f2fff5; }
      
      .btn-main { display: block; background: var(--text); color: #fff; text-align: center; padding: 18px; border-radius: 18px; text-decoration: none; font-weight: 600; margin-top: 30px; }
      .footer-text { color: var(--secondary); font-size: 11px; margin-top: 25px; font-weight: 500; opacity: 0.8; }

      #toast { visibility: hidden; min-width: 220px; background-color: rgba(28,28,30,0.9); color: #fff; text-align: center; border-radius: 50px; padding: 12px 20px; position: fixed; z-index: 100; bottom: 40px; left: 50%; transform: translateX(-50%); font-size: 13px; backdrop-filter: blur(10px); opacity: 0; transition: opacity 0.3s; pointer-events: none; }
      #toast.show { visibility: visible; opacity: 1; transform: translateX(-50%) translateY(-10px); }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="badge">${isLaTeX ? 'Scientific Formula' : 'Link Preview'}</div>
      
      <div class="content ${isLaTeX ? 'clickable' : ''}" 
           ${isLaTeX ? 'onclick="copyImageToClipboard()"' : ''}>
        ${isLaTeX ? `<div id="math-display" style="opacity: 0;">${data.content}</div>` : data.content}
      </div>
      
      ${isLaTeX ? `
        <div class="copy-group">
          <button class="copy-btn" onclick="copyText(this, \`${data.content}\`, 'latex')">📋 LaTeX</button>
          <button class="copy-btn" onclick="copyText(this, \`${data.content}\`, 'unicode')">🔤 Uni</button>
          <button class="copy-btn" onclick="downloadImage(this)">📥 PNG</button>
        </div>
      ` : ''}

      ${!isLaTeX ? `<a href="${data.content}" class="btn-main">Continue to Site</a>` : ''}
      <div class="footer-text">PureLink Knowledge Node</div>
    </div>
    
    <div id="toast"></div>

    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
    <script defer src="https://html2canvas.hertzen.com/dist/html2canvas.min.js"></script>
    <script>
      const isInApp = /Line|FBAN|FBAV|Instagram/i.test(navigator.userAgent);

      function toUnicode(latex) {
        let t = latex.replace(/\\\\frac\\{(.+?)\\}\\{(.+?)\\}/g, '($1)/($2)');
        t = t.replace(/\\frac\\{(.+?)\\}\\{(.+?)\\}/g, '($1)/($2)');
        const m = { '\\\\hbar': 'ℏ', '\\\\partial': '∂', '\\\\Psi': 'Ψ', '\\\\hat{H}': 'Ĥ' };
        for (const [k, v] of Object.entries(m)) t = t.replace(new RegExp(k.replace(/\\\\/g, '\\\\\\\\'), 'g'), v);
        return t.replace(/\\\\/g, '').replace(/[{}]/g, ' ').replace(/\\s+/g, ' ').trim();
      }

      window.onload = () => {
        const el = document.getElementById('math-display');
        if (${isLaTeX} && el) {
          try {
            const raw = el.textContent.replace(/\\\\\\\\/g, '\\\\'); 
            katex.render(raw, el, { throwOnError: false, displayMode: true, trust: true });
            el.style.opacity = '1';
          } catch (e) { el.style.opacity = '1'; }
        }
      };

      async function copyText(btn, raw, mode) {
        const text = mode === 'unicode' ? toUnicode(raw) : raw;
        try {
          await navigator.clipboard.writeText(text);
          showFeedback(btn, "✅ Copied");
        } catch (e) { showToast("⚠️ Copy failed"); }
      }

      async function captureAndAction(callback) {
        const el = document.getElementById('math-display');
        await new Promise(r => setTimeout(r, 500)); 

        try {
          const canvas = await html2canvas(el, {
            scale: 3,
            backgroundColor: '#ffffff',
            logging: false,
            onclone: (clonedDoc) => {
              const clonedEl = clonedDoc.getElementById('math-display');
              clonedEl.style.display = 'inline-block';
              clonedEl.style.padding = '40px';
              clonedEl.style.transform = 'none';
            }
          });
          callback(canvas);
        } catch (e) {
          showToast("❌ Render failed");
        }
      }
        
      async function copyImageToClipboard() {
        showToast("🎨 Rendering...");
        captureAndAction(canvas => {
          canvas.toBlob(async (blob) => {
            try {
              const item = new ClipboardItem({ 'image/png': blob });
              await navigator.clipboard.write([item]);
              showToast("✅ Image copied!");
            } catch (err) {
              showToast("⚠️ Copy blocked. Use PNG button.");
            }
          });
        });
      }

      async function downloadImage(btn) {
        const old = btn.innerHTML; // 記住原本的文字 (📥 PNG)
        btn.innerHTML = "⏳";
        
        captureAndAction(canvas => {
          const link = document.createElement('a');
          link.download = 'formula_${slug}.png';
          link.href = canvas.toDataURL("image/png");
          link.click();
          showFeedback(btn, "✅ Saved");
          
          // ★ 關鍵修復：下載後 2 秒還原按鈕狀態
          setTimeout(() => {
             btn.innerHTML = old;
             btn.classList.remove('success');
          }, 2000);
        });
      }

      function showFeedback(btn, msg) {
        const old = btn.innerHTML; btn.innerHTML = msg; btn.classList.add('success');
        // 這裡不需要 setTimeout 了，因為 downloadImage 會自己處理還原
      }
      
      function showToast(msg) {
        const t = document.getElementById("toast"); t.innerText = msg; t.className = "show";
        setTimeout(() => { t.className = t.className.replace("show", ""); }, 3000);
      }
    </script>
  </body>
  </html>`;
}
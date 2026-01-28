/**
 * Project PureLink - Admin 7.0 (The Real Final)
 * Fixes:
 * 1. NO MORE ALERTS (Button text feedback only)
 * 2. Real-time Char Counter (current/2000)
 * 3. Text Wrapping & Newline support (pre-wrap)
 * 4. "More Detail" UI + Full-length Ghost Capture
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = decodeURIComponent(url.pathname.slice(1));

    if (path === "admin") return new Response(renderAdminPage(), { headers: { "content-type": "text/html; charset=utf-8" } });
    if (path === "api/create" && request.method === "POST") return handleCreateLink(request, env);
    if (path === "api/check-slug" && request.method === "POST") return handleCheckSlug(request, env);

    const isPreview = path.endsWith('+');
    const lookupSlug = isPreview ? path.slice(0, -1) : path;
    if (lookupSlug === "") return new Response("PureLink: Operational.");

    const linkData = await env.pure_link_db.prepare("SELECT content, type FROM links WHERE slug = ?").bind(lookupSlug).first();
    if (!linkData) return new Response("404 - Link not found.", { status: 404 });

    // 針對 LaTeX 或純文字內容
    if (isPreview || linkData.type === 'latex') {
      return new Response(generateHTML(linkData, lookupSlug), { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    return Response.redirect(sanitize(linkData.content), 301);
  },
};

// --- Backend Logic ---

async function handleCheckSlug(request, env) {
  try {
    const { slug, secret } = await request.json();
    if (secret !== (env.ADMIN_SECRET || "science")) return new Response(JSON.stringify({ error: "Auth" }), { status: 401 });
    const existing = await env.pure_link_db.prepare("SELECT 1 FROM links WHERE slug = ?").bind(slug).first();
    return new Response(JSON.stringify({ exists: !!existing }));
  } catch (e) { return new Response(e.message, { status: 500 }); }
}

async function handleCreateLink(request, env) {
  try {
    const formData = await request.formData();
    let slug = formData.get("slug").trim();
    let content = formData.get("content").trim(); // 這裡不轉義，保留換行符
    const secret = formData.get("secret");
    let type = formData.get("type");

    if (secret !== (env.ADMIN_SECRET || "science")) return new Response(JSON.stringify({ success: false, msg: "⛔ Access Denied" }), { status: 403 });

    // 後端長度雙重確認
    if (content.length > 2000) return new Response(JSON.stringify({ success: false, msg: "❌ Content too long" }), { status: 400 });

    if (!slug) {
      slug = Math.random().toString(36).substring(2, 8);
    } else {
      if (slug.length > 30) return new Response(JSON.stringify({ success: false, msg: "❌ Slug too long" }), { status: 400 });
      if (!/^[a-zA-Z0-9-_]+$/.test(slug)) return new Response(JSON.stringify({ success: false, msg: "❌ Invalid chars" }), { status: 400 });
    }

    const existing = await env.pure_link_db.prepare("SELECT 1 FROM links WHERE slug = ?").bind(slug).first();
    if (existing) return new Response(JSON.stringify({ success: false, msg: "⚠️ Slug taken" }), { status: 409 });

    if (type === "auto") {
      const isLatex = /[\\^_{}]|\b(frac|sqrt|partial|hbar|hat)\b/i.test(content);
      type = isLatex ? "latex" : (/^http/i.test(content) ? "url" : "latex");
    }

    if (type === "url" && !/^https?:\/\//i.test(content)) content = "https://" + content;

    await env.pure_link_db.prepare("INSERT INTO links (slug, type, content, is_affiliate) VALUES (?, ?, ?, 0)").bind(slug, type, content).run();
    return new Response(JSON.stringify({ success: true, fullUrl: new URL(request.url).origin + "/" + slug }));
  } catch (e) { return new Response(JSON.stringify({ success: false, msg: e.message }), { status: 500 }); }
}

function sanitize(u) {
  try {
    const url = new URL(u);
    ['fbclid', 'igshid', 'gclid', 'si'].forEach(p => url.searchParams.delete(p));
    return url.toString().replace(/[?&]$/, "");
  } catch (e) { return u; }
}

// --- Frontend Generator (Admin) ---

function renderAdminPage() {
  return `
  <!DOCTYPE html>
  <html lang="zh-TW">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PureLink Console</title>
    <style>
      :root { --accent: #007aff; --bg: #f2f2f7; --card: #ffffff; --danger: #ff3b30; --success: #34c759; }
      body { font-family: -apple-system, sans-serif; background: var(--bg); display: flex; justify-content: center; padding-top: 40px; margin: 0; min-height: 100vh; }
      .container { width: 100%; max-width: 400px; padding: 20px; }
      .card { background: var(--card); padding: 30px; border-radius: 24px; box-shadow: 0 8px 30px rgba(0,0,0,0.06); margin-bottom: 20px; }
      h2 { text-align: center; margin-bottom: 25px; color: #1c1c1e; }
      .label { font-size: 12px; color: #8e8e93; font-weight: 600; margin-bottom: 6px; display: flex; justify-content: space-between; }
      input, textarea { width: 100%; padding: 14px; border: 1px solid #e5e5ea; border-radius: 14px; background: #f9f9f9; font-size: 16px; box-sizing: border-box; outline: none; margin-bottom: 18px; }
      input:focus, textarea:focus { border-color: var(--accent); background: white; }
      input.valid { border-color: var(--success); background: #f0fdf4; }
      input.invalid { border-color: var(--danger); background: #fff5f5; }
      textarea { min-height: 120px; resize: vertical; font-family: monospace; }
      .badge { padding: 4px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; background: #e5e5ea; color: #8e8e93; }
      .badge.latex { background: #34c759; color: white; }
      .badge.url { background: #007aff; color: white; }
      button { width: 100%; padding: 16px; background: var(--accent); color: white; border: none; border-radius: 16px; font-weight: 600; cursor: pointer; transition: 0.2s; }
      button:disabled { opacity: 0.5; cursor: not-allowed; }
      #result-card { display: none; text-align: center; border: 2px solid var(--success); }
      .result-link { font-size: 18px; font-weight: 600; word-break: break-all; color: #1c1c1e; margin-bottom: 15px; display: block; text-decoration: none; }
      .btn-secondary { background: white; color: var(--accent); border: 1px solid var(--accent); margin-top: 10px; }
      
      /* 字數統計樣式 */
      #char-count { font-size: 10px; color: #8e8e93; text-align: right; margin-top: -15px; margin-bottom: 15px; display: block; }
      #char-count.limit { color: var(--danger); font-weight: bold; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="card">
        <h2>PureLink Console</h2>
        <form id="create-form">
          <div class="label">ADMIN SECRET</div>
          <input type="password" id="secret-input" name="secret" placeholder="••••••" required>
          
          <div class="label">SLUG (Optional) <span id="slug-status" style="font-size:10px;">Max 30 chars</span></div>
          <input type="text" name="slug" id="slug-input" placeholder="e.g. qm-notes" maxlength="30">
          
          <div class="label">CONTENT <span id="type-badge" class="badge">AUTO</span></div>
          <textarea name="content" id="content-area" placeholder="Write something..." required></textarea>
          <span id="char-count">0/2000</span>
          
          <input type="hidden" name="type" id="type-input" value="auto">
          
          <button type="submit" id="submit-btn">Create Node</button>
        </form>
      </div>
      <div class="card" id="result-card">
        <div style="font-weight:700; color:var(--success);">✅ NODE CREATED</div>
        <p id="result-url" style="word-break:break-all; font-weight:600;"></p>
        <button class="btn-secondary" onclick="copyResult(this)">Copy</button>
        <button onclick="location.reload()">Create New</button>
      </div>
    </div>
    <script>
      const slugInput = document.getElementById('slug-input');
      const secretInput = document.getElementById('secret-input');
      const slugStatus = document.getElementById('slug-status');
      const contentArea = document.getElementById('content-area');
      const charCount = document.getElementById('char-count');
      const typeBadge = document.getElementById('type-badge');
      const typeInput = document.getElementById('type-input');
      const submitBtn = document.getElementById('submit-btn');
      let timeout;

      function checkSlug() {
        const slug = slugInput.value.replace(/[^a-zA-Z0-9-_]/g, '');
        slugInput.value = slug;
        clearTimeout(timeout);
        const secret = secretInput.value;
        if (!slug) { 
            slugInput.className = ''; slugStatus.innerText = "Auto-Gen"; slugStatus.style.color = "#8e8e93"; 
            submitBtn.disabled = false; return; 
        }
        if (!secret) return;

        timeout = setTimeout(async () => {
          try {
            const res = await fetch('/api/check-slug', { method: 'POST', body: JSON.stringify({ slug, secret }) });
            if (res.status === 401) return;
            const { exists } = await res.json();
            slugInput.className = exists ? 'invalid' : 'valid';
            slugStatus.innerText = exists ? '❌ TAKEN' : '✅ AVAILABLE';
            slugStatus.style.color = exists ? '#ff3b30' : '#34c759';
            submitBtn.disabled = exists;
          } catch(e) {}
        }, 500);
      }

      slugInput.addEventListener('input', checkSlug);
      secretInput.addEventListener('input', checkSlug);

      contentArea.addEventListener('input', (e) => {
        const val = e.target.value;
        const len = val.length;
        
        // ★ 1. 字數統計邏輯
        charCount.innerText = len + "/2000";
        if (len > 2000) {
            charCount.classList.add('limit');
            submitBtn.disabled = true;
        } else {
            charCount.classList.remove('limit');
            submitBtn.disabled = false;
        }

        // 2. 自動識別
        const isLatex = /[\\\\^_{}]|\\b(frac|sqrt|partial|hbar|hat)\\b/i.test(val);
        const isUrl = /^(http|https):\\/\\/|www\\.|\\.[a-z]{2,}/i.test(val);
        if (isLatex) { typeBadge.innerText = 'LATEX'; typeBadge.className = 'badge latex'; typeInput.value = 'auto'; }
        else if (isUrl) { typeBadge.innerText = 'URL'; typeBadge.className = 'badge url'; typeInput.value = 'auto'; }
        else { typeBadge.innerText = 'AUTO'; typeBadge.className = 'badge'; }
      });

      document.getElementById('create-form').onsubmit = async (e) => {
        e.preventDefault();
        if (contentArea.value.length > 2000) return; // 雙重防護
        
        submitBtn.disabled = true; submitBtn.innerText = "Processing...";
        const res = await fetch('/api/create', { method: 'POST', body: new FormData(e.target) });
        const json = await res.json();
        if (json.success) {
          document.getElementById('result-url').innerText = json.fullUrl;
          document.getElementById('result-url').href = json.fullUrl;
          document.getElementById('result-card').style.display = 'block';
          e.target.style.display = 'none';
        } else { alert(json.msg); submitBtn.disabled = false; submitBtn.innerText = "Create Node"; }
      };

      // ★ 3. 複製按鈕：只變字，不彈窗
      function copyResult(btn) {
        navigator.clipboard.writeText(document.getElementById('result-url').innerText);
        const old = btn.innerText;
        btn.innerText = "Copied!";
        setTimeout(() => btn.innerText = old, 2000);
      }
    </script>
  </body>
  </html>`;
}

// ★★★ 核心渲染：包含 More Detail 與 長截圖引擎 ★★★
function generateHTML(data, slug) {
  // 將 JSON 字串化以傳遞給前端 JS
  const safeContent = JSON.stringify(data.content);
  
  return `
  <!DOCTYPE html>
  <html lang="zh-TW">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Link Preview | PureLink</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
    <style>
      :root { --bg: #f2f2f7; --card: #ffffff; --text: #1c1c1e; --secondary: #8e8e93; }
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
      
      .card { background: var(--card); width: 100%; max-width: 480px; padding: 40px 30px; border-radius: 30px; box-shadow: 0 20px 40px rgba(0,0,0,0.08); text-align: center; box-sizing: border-box; position: relative; }
      .badge { display: inline-block; padding: 6px 14px; border-radius: 20px; font-size: 11px; font-weight: 700; background: #e5e5ea; color: var(--secondary); margin-bottom: 25px; text-transform: uppercase; letter-spacing: 1px; }
      
      /* 內容容器 */
      .content-wrapper { position: relative; margin-bottom: 30px; }
      
      .content { 
        font-size: 1.15rem; 
        color: var(--text); 
        min-height: 80px; 
        display: flex; 
        justify-content: center; 
        align-items: center; 
        
        /* ★ 核心：保留換行與空格 ★ */
        white-space: pre-wrap; 
        word-break: break-word;
        line-height: 1.6;
        text-align: center; /* 預設置中 */
        
        /* 預設折疊 */
        max-height: 200px; 
        overflow: hidden;
        transition: max-height 0.3s ease;
      }
      
      /* 展開樣式 */
      .content.expanded { max-height: none; }

      /* More Detail 按鈕 */
      .more-btn {
        display: none; /* JS 決定是否顯示 */
        width: 100%;
        text-align: center;
        padding: 10px 0 0 0;
        font-size: 12px;
        color: #007aff;
        background: transparent;
        border: none;
        cursor: pointer;
        font-weight: 600;
      }
      
      .content.clickable { cursor: pointer; }
      .content.clickable:active { transform: scale(0.99); }

      #math-display { width: 100%; }
      
      /* 按鈕群組 */
      .copy-group { display: flex; gap: 10px; justify-content: center; margin-top: 30px; flex-wrap: wrap; }
      .copy-btn { 
        flex: 1; min-width: 90px; padding: 12px; 
        border: 1px solid #d1d1d6; border-radius: 14px; 
        background: white; cursor: pointer; 
        font-size: 13px; font-weight: 600; color: var(--text);
        transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 6px;
      }
      .copy-btn:active { transform: scale(0.96); background: #f2f2f7; }
      .copy-btn.success { border-color: #34c759; color: #34c759; background: #f2fff5; }
      
      .btn-main { display: block; background: var(--text); color: #fff; text-align: center; padding: 18px; border-radius: 18px; text-decoration: none; font-weight: 600; margin-top: 30px; }
      .footer-text { color: var(--secondary); font-size: 11px; margin-top: 30px; font-weight: 500; opacity: 0.6; }
      
      #toast { visibility: hidden; min-width: 220px; background-color: rgba(28,28,30,0.9); color: #fff; text-align: center; border-radius: 50px; padding: 12px 20px; position: fixed; z-index: 100; bottom: 40px; left: 50%; transform: translateX(-50%); font-size: 13px; backdrop-filter: blur(10px); opacity: 0; transition: opacity 0.3s; pointer-events: none; }
      #toast.show { visibility: visible; opacity: 1; transform: translateX(-50%) translateY(-10px); }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="badge">SCIENTIFIC FORMULA</div>
      
      <div class="content-wrapper">
        <div class="content clickable" id="main-content" onclick="copyImageToClipboard()">
          <div id="math-display"></div>
        </div>
        <button id="more-btn" class="more-btn" onclick="toggleExpand()">More Detail ↓</button>
      </div>
      
      <div class="copy-group">
        <button class="copy-btn" onclick="copyText(this, 'latex')">📋 LaTeX</button>
        <button class="copy-btn" onclick="copyText(this, 'unicode')">🔤 Uni</button>
        <button class="copy-btn" onclick="downloadImage(this)">📥 PNG</button>
      </div>

      <div class="footer-text">PureLink Knowledge Node</div>
    </div>
    <div id="toast"></div>

    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
    <script defer src="https://html2canvas.hertzen.com/dist/html2canvas.min.js"></script>
    <script>
      // 這裡拿到原始資料
      const rawContent = ${safeContent};

      function toUnicode(latex) {
        let t = latex.replace(/\\\\frac\\{(.+?)\\}\\{(.+?)\\}/g, '($1)/($2)');
        const m = { '\\\\hbar': 'ℏ', '\\\\partial': '∂', '\\\\Psi': 'Ψ', '\\\\hat{H}': 'Ĥ', '\\\\rightarrow': '→' };
        for (const [k, v] of Object.entries(m)) t = t.replace(new RegExp(k.replace(/\\\\/g, '\\\\\\\\'), 'g'), v);
        return t.replace(/\\\\/g, '').replace(/[{}]/g, ' ').replace(/\\s+/g, ' ').trim();
      }

      window.onload = () => {
        const el = document.getElementById('math-display');
        const contentDiv = document.getElementById('main-content');
        const moreBtn = document.getElementById('more-btn');

        // 嘗試用 KaTeX 渲染，如果失敗則顯示純文字 (並保留換行)
        try {
            katex.render(rawContent, el, { throwOnError: true, displayMode: true, trust: true });
        } catch (e) {
            // KaTeX 失敗 (代表是純文字)，直接塞文字，pre-wrap 會處理換行
            el.innerText = rawContent;
            el.style.fontFamily = '-apple-system, sans-serif';
            el.style.fontSize = '1.1rem';
        }

        // 檢查是否溢出 (200px)
        if (contentDiv.scrollHeight > 200) {
          moreBtn.style.display = 'block';
        }
      };

      function toggleExpand() {
        const contentDiv = document.getElementById('main-content');
        const btn = document.getElementById('more-btn');
        contentDiv.classList.toggle('expanded');
        btn.innerText = contentDiv.classList.contains('expanded') ? 'Less ↑' : 'More Detail ↓';
      }

      async function copyText(btn, mode) {
        const text = mode === 'unicode' ? toUnicode(rawContent) : rawContent;
        try {
          await navigator.clipboard.writeText(text);
          showFeedback(btn, "✅ Copied");
        } catch (e) { showToast("⚠️ Copy failed"); }
      }

      // ★ 核心截圖邏輯 (幽靈全展開模式)
      async function captureAndAction(callback) {
        const card = document.querySelector('.card');
        await new Promise(r => setTimeout(r, 200));

        try {
          const canvas = await html2canvas(card, {
            scale: 3,
            backgroundColor: '#ffffff',
            logging: false,
            onclone: (clonedDoc) => {
              const clonedContent = clonedDoc.getElementById('main-content');
              const clonedBtn = clonedDoc.getElementById('more-btn');
              const clonedCopyGroup = clonedDoc.querySelector('.copy-group');
              
              // 1. 強制展開 (全高)
              clonedContent.style.maxHeight = 'none';
              clonedContent.style.overflow = 'visible';
              // 2. 確保文字換行與寬度固定
              clonedContent.style.width = '600px'; 
              clonedContent.style.whiteSpace = 'pre-wrap';
              
              // 3. 隱藏按鈕
              if(clonedBtn) clonedBtn.style.display = 'none';
              if(clonedCopyGroup) clonedCopyGroup.style.display = 'none';
              
              // 4. 調整卡片尺寸
              const clonedCard = clonedDoc.querySelector('.card');
              clonedCard.style.width = 'fit-content';
              clonedCard.style.height = 'auto';
              clonedCard.style.padding = '50px';
            }
          });
          callback(canvas);
        } catch (e) { showToast("❌ Render failed"); }
      }
        
      async function copyImageToClipboard() {
        showToast("🎨 Rendering...");
        try {
          await captureAndAction(canvas => {
            canvas.toBlob(async (blob) => {
              try {
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                showToast("✅ Image copied!");
              } catch (err) { showToast("⚠️ Browser blocked"); }
            });
          });
        } catch(e) {}
      }

      async function downloadImage(btn) {
        const oldHtml = btn.innerHTML;
        // 兩段式按鈕：不顯示文字，僅變暗
        btn.style.opacity = "0.7"; btn.style.pointerEvents = "none";
        
        try {
          await captureAndAction(canvas => {
            const link = document.createElement('a');
            link.download = 'formula_${slug}.png';
            link.href = canvas.toDataURL("image/png");
            link.click();
            
            // 成功狀態
            btn.innerHTML = "✅ Saved";
            btn.classList.add('success');
            btn.style.opacity = "1";
          });
        } catch (e) {
            btn.innerHTML = "❌ Error";
        } finally {
            // 無論如何 2 秒後還原
            setTimeout(() => {
                btn.innerHTML = oldHtml;
                btn.classList.remove('success');
                btn.style.pointerEvents = "auto";
                btn.style.opacity = "1";
            }, 2000);
        }
      }

      function showFeedback(btn, msg) {
        const oldHtml = btn.innerHTML;
        btn.innerHTML = msg; btn.classList.add('success');
        setTimeout(() => { btn.innerHTML = oldHtml; btn.classList.remove('success'); }, 2000);
      }
      
      function showToast(msg) {
        const t = document.getElementById("toast"); t.innerText = msg; t.className = "show";
        setTimeout(() => { t.className = t.className.replace("show", ""); }, 3000);
      }
    </script>
  </body>
  </html>`;
}
/**
 * Project PureLink - Admin 8.0 (Strict Auto-Detect & Clean UX)
 * Fixes:
 * 1. STRICT LaTeX detection (Ignored code blocks like function/return)
 * 2. NO ALERTS anywhere. Button feedback only.
 * 3. NO HOURGLASS. 2-State buttons (Default -> Saved -> Default).
 * 4. CSS Layout: Pre-wrap fixed, long text handles correctly.
 * 5. Ghost Capture: Downloads full content even if collapsed in UI.
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

    // 針對 LaTeX 或 純文字 (這裡我們統稱為 latex 類型進行渲染)
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
    let content = formData.get("content").trim();
    const secret = formData.get("secret");
    let type = formData.get("type");

    if (secret !== (env.ADMIN_SECRET || "science")) return new Response(JSON.stringify({ success: false, msg: "⛔ Access Denied" }), { status: 403 });
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
      // ★ 嚴格判斷邏輯 ★
      // 1. 必須包含 LaTeX 特徵符號 (反斜線+指令)
      const hasLatexCommand = /\\(frac|sqrt|partial|hbar|hat|psi|phi|int|sum|begin|end)/i.test(content);
      // 2. 絕對不能包含程式碼關鍵字 (避免誤判 JS/Python)
      const isCode = /\b(function|return|const|var|let|import|class|def|if|else)\b/.test(content);
      
      const isUrl = /^https?:\/\//i.test(content) || /^(www\.)|[a-z0-9-]+\.[a-z]{2,}/i.test(content);

      if (hasLatexCommand && !isCode) {
        type = "latex";
      } else if (isUrl && !content.includes('\n')) { // 如果有換行就不算 URL
        type = "url";
      } else {
        // 其他狀況都當作純文字 (存成 latex 類型以便渲染顯示，但不解析數學公式)
        type = "latex"; 
      }
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
      #char-count { font-size: 10px; color: #8e8e93; text-align: right; margin-top: -15px; margin-bottom: 15px; display: block; }
      #char-count.limit { color: var(--danger); font-weight: bold; }
      .btn-secondary { background: white; color: var(--accent); border: 1px solid var(--accent); margin-top: 10px; }
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
          <textarea name="content" id="content-area" placeholder="Write something..." maxlength="2000" required></textarea>
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
        charCount.innerText = len + "/2000";
        if (len >= 2000) charCount.classList.add('limit'); else charCount.classList.remove('limit');

        // ★ 前端同步嚴格判斷 ★
        const hasLatex = /\\\\(frac|sqrt|partial|hbar|hat|psi|phi)/i.test(val);
        const isCode = /\\b(function|return|const|var|if|else)\\b/.test(val);
        const isUrl = /^(http|www)/i.test(val) && !val.includes('\\n');

        if (hasLatex && !isCode) { 
            typeBadge.innerText = 'LATEX'; typeBadge.className = 'badge latex'; 
        } else if (isUrl) { 
            typeBadge.innerText = 'URL'; typeBadge.className = 'badge url'; 
        } else { 
            typeBadge.innerText = 'TEXT'; typeBadge.className = 'badge'; 
        }
        // 永遠傳 auto 給後端，讓後端做最終裁決
        typeInput.value = 'auto'; 
      });

      document.getElementById('create-form').onsubmit = async (e) => {
        e.preventDefault();
        submitBtn.disabled = true; submitBtn.innerText = "Processing...";
        const res = await fetch('/api/create', { method: 'POST', body: new FormData(e.target) });
        const json = await res.json();
        if (json.success) {
          document.getElementById('result-url').innerText = json.fullUrl;
          document.getElementById('result-url').href = json.fullUrl;
          document.getElementById('result-card').style.display = 'block';
          document.getElementById('create-form').style.display = 'none';
        } else { alert(json.msg); submitBtn.disabled = false; submitBtn.innerText = "Create Node"; }
      };

      // ★ 複製連結：無彈窗
      function copyResult(btn) {
        navigator.clipboard.writeText(document.getElementById('result-url').innerText);
        const old = btn.innerText; btn.innerText = "Copied!";
        setTimeout(() => btn.innerText = old, 2000);
      }
    </script>
  </body>
  </html>`;
}

// ★★★ 核心渲染 (Layout + Expand + Ghost Capture) ★★★
function generateHTML(data, slug) {
  const safeContent = JSON.stringify(data.content);
  
  return `
  <!DOCTYPE html>
  <html lang="zh-TW">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>PureLink Node</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
    <style>
      :root { --bg: #f2f2f7; --card: #ffffff; --text: #1c1c1e; --secondary: #8e8e93; }
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
      
      .card { background: var(--card); width: 100%; max-width: 500px; padding: 40px 30px; border-radius: 30px; box-shadow: 0 20px 40px rgba(0,0,0,0.08); text-align: center; box-sizing: border-box; position: relative; }
      .badge { display: inline-block; padding: 6px 14px; border-radius: 20px; font-size: 11px; font-weight: 700; background: #e5e5ea; color: var(--secondary); margin-bottom: 25px; text-transform: uppercase; letter-spacing: 1px; }
      
      /* ★ 內容區：支援換行與自動折疊 */
      .content-wrapper { position: relative; margin-bottom: 25px; width: 100%; }
      .content { 
        font-size: 1.15rem; color: var(--text); 
        min-height: 60px; 
        
        /* 關鍵：保留換行，強制斷字 */
        white-space: pre-wrap; 
        word-break: break-word; 
        overflow-wrap: break-word;
        text-align: left; /* 純文字靠左讀起來比較順，公式會置中 */
        line-height: 1.6;
        
        /* 折疊邏輯 */
        max-height: 200px; 
        overflow: hidden; 
        transition: max-height 0.3s ease;
        
        /* 置中內容 */
        display: flex;
        flex-direction: column;
        align-items: center; 
      }
      
      .content.expanded { max-height: none; }
      .more-btn { display: none; margin-top: 10px; font-size: 12px; color: #007aff; background: none; border: none; cursor: pointer; font-weight: 600; width: 100%; }
      
      /* 公式樣式 */
      .katex-display { margin: 0; } 

      .copy-group { display: flex; gap: 10px; justify-content: center; margin-top: 20px; }
      .copy-btn { flex: 1; padding: 12px; border: 1px solid #d1d1d6; border-radius: 14px; background: white; cursor: pointer; font-size: 13px; font-weight: 600; color: var(--text); display: flex; align-items: center; justify-content: center; gap: 6px; transition: 0.2s; }
      .copy-btn:active { transform: scale(0.96); background: #f2f2f7; }
      .copy-btn.success { border-color: #34c759; color: #34c759; background: #f2fff5; }
      
      .footer-text { color: var(--secondary); font-size: 11px; margin-top: 30px; font-weight: 500; opacity: 0.6; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="badge">PureLink Node</div>
      
      <div class="content-wrapper">
        <div class="content" id="main-content"></div> <button id="more-btn" class="more-btn" onclick="toggleExpand()">More Detail ↓</button>
      </div>
      
      <div class="copy-group">
        <button class="copy-btn" onclick="copyText(this, 'latex')">📋 Text</button>
        <button class="copy-btn" onclick="downloadImage(this)">📥 PNG</button>
      </div>

      <div class="footer-text">PureLink Knowledge Node</div>
    </div>

    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
    <script defer src="https://html2canvas.hertzen.com/dist/html2canvas.min.js"></script>
    <script>
      const rawContent = ${safeContent};
      
      // ★ 判斷是否為程式碼關鍵字 (輔助渲染)
      const isCode = /\\b(function|return|const|var|if|else)\\b/.test(rawContent);

      window.onload = () => {
        const el = document.getElementById('main-content');
        const btn = document.getElementById('more-btn');

        // 嘗試 KaTeX 渲染
        try {
            if (isCode) throw new Error("Code detected"); // 程式碼強制不渲染公式
            katex.render(rawContent, el, { throwOnError: true, displayMode: true });
        } catch (e) {
            // 失敗或程式碼：顯示純文字
            el.innerText = rawContent;
            el.style.fontFamily = isCode ? 'monospace' : '-apple-system, sans-serif';
        }

        // 檢查折疊
        if (el.scrollHeight > 200) {
            btn.style.display = 'block';
        }
      };

      function toggleExpand() {
        const el = document.getElementById('main-content');
        const btn = document.getElementById('more-btn');
        el.classList.toggle('expanded');
        btn.innerText = el.classList.contains('expanded') ? 'Less ↑' : 'More Detail ↓';
      }

      async function copyText(btn, mode) {
        try {
          await navigator.clipboard.writeText(rawContent);
          // ★ 這裡只有按鈕變色，沒有 Alert
          const old = btn.innerText; btn.innerText = "✅ Copied!"; btn.classList.add('success');
          setTimeout(() => { btn.innerText = old; btn.classList.remove('success'); }, 2000);
        } catch (e) {}
      }

      // ★ 長截圖引擎 (Ghost Capture)
      async function downloadImage(btn) {
        const oldHtml = btn.innerHTML;
        
        // ★ 兩段式狀態：點擊後僅變暗 (Processing)，不顯示文字
        btn.style.opacity = "0.6"; 
        btn.style.pointerEvents = "none";

        try {
          const card = document.querySelector('.card');
          await new Promise(r => setTimeout(r, 200));

          const canvas = await html2canvas(card, {
            scale: 3, backgroundColor: '#ffffff', logging: false,
            // ★ onclone: 強制展開內容，隱藏按鈕，固定寬度
            onclone: (clonedDoc) => {
              const cContent = clonedDoc.getElementById('main-content');
              const cBtn = clonedDoc.getElementById('more-btn');
              const cCopy = clonedDoc.querySelector('.copy-group');
              
              // 強制全展開
              cContent.style.maxHeight = 'none';
              cContent.style.overflow = 'visible';
              cContent.style.width = '500px'; // 固定寬度防止跑版
              
              if(cBtn) cBtn.style.display = 'none';
              if(cCopy) cCopy.style.display = 'none'; // 截圖不含按鈕
              
              // 調整卡片高度適應
              const cCard = clonedDoc.querySelector('.card');
              cCard.style.height = 'auto';
              cCard.style.width = 'fit-content';
            }
          });

          const link = document.createElement('a');
          link.download = 'purelink_snap.png';
          link.href = canvas.toDataURL("image/png");
          link.click();

          // ★ 成功狀態：變成 Saved
          btn.innerHTML = "✅ Saved";
          btn.classList.add('success');
          btn.style.opacity = "1";

        } catch (e) {
            btn.innerText = "❌ Error";
        } finally {
            // ★ 2秒後復原
            setTimeout(() => {
                btn.innerHTML = oldHtml;
                btn.classList.remove('success');
                btn.style.opacity = "1";
                btn.style.pointerEvents = "auto";
            }, 2000);
        }
      }
    </script>
  </body>
  </html>`;
}
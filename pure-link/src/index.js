/**
 * Project PureLink - Admin 9.5 (Layout & Regex Repair)
 * Fixes:
 * 1. Layout: Enforced word-wrap similar to MS Word.
 * - content width restricted.
 * - 'overflow-wrap: anywhere' handles continuous strings.
 * - 'pre-wrap' preserves manual line breaks.
 * 2. URL Logic: Strict full-string matching.
 * - "Hello google.com" -> Text.
 * - "google.com" -> URL.
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

    // 只要是 latex 類型，就進入卡片渲染 (包含純文字)
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
    let content = formData.get("content"); // 保留原始輸入
    const secret = formData.get("secret");
    let type = formData.get("type");

    if (secret !== (env.ADMIN_SECRET || "science")) return new Response(JSON.stringify({ success: false, msg: "⛔ Access Denied" }), { status: 403 });

    // 標準化換行：將 \r\n 轉為 \n，確保計數與顯示一致
    content = content.replace(/\r\n/g, '\n').trim();

    if (content.length > 2000) return new Response(JSON.stringify({ success: false, msg: `❌ Content too long (${content.length}/2000)` }), { status: 400 });

    if (!slug) {
      slug = Math.random().toString(36).substring(2, 8);
    } else {
      if (slug.length > 30 || !/^[a-zA-Z0-9-_]+$/.test(slug)) return new Response(JSON.stringify({ success: false, msg: "❌ Invalid Slug" }), { status: 400 });
    }

    const existing = await env.pure_link_db.prepare("SELECT 1 FROM links WHERE slug = ?").bind(slug).first();
    if (existing) return new Response(JSON.stringify({ success: false, msg: "⚠️ Slug taken" }), { status: 409 });

    if (type === "auto") {
      // ★ 9.5 嚴格 URL 判斷：必須全字匹配 ★
      // ^ 和 $ 確保了內容 "只能" 是網址，不能包含其他文字
      // 允許 google.com (補 https) 或 https://google.com
      const strictUrlPattern = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/i;
      
      const isUrl = strictUrlPattern.test(content);
      const hasMath = /[\\]|[\u0370-\u03FF\u2100-\u214F\u2200-\u22FF]/.test(content); // 寬容的數學符號偵測

      if (isUrl) {
        type = "url";
      } else {
        // 只要不是純網址，一律當作 latex (文字/公式/代碼) 處理
        type = "latex";
      }
    }

    if (type === "url" && !/^https?:\/\//i.test(content)) content = "https://" + content;

    await env.pure_link_db.prepare("INSERT INTO links (slug, type, content, is_affiliate) VALUES (?, ?, ?, 0)").bind(slug, type, content).run();
    return new Response(JSON.stringify({ success: true, fullUrl: new URL(request.url).origin + "/" + slug }));
  } catch (e) { return new Response(JSON.stringify({ success: false, msg: e.message }), { status: 500 }); }
}

function sanitize(u) { try { const url = new URL(u); ['fbclid', 'igshid'].forEach(p => url.searchParams.delete(p)); return url.toString().replace(/[?&]$/, ""); } catch (e) { return u; } }

// --- Admin UI ---

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
      input.valid { border-color: var(--success); }
      input.invalid { border-color: var(--danger); }
      textarea { min-height: 120px; font-family: monospace; resize: vertical; }
      button { width: 100%; padding: 16px; background: var(--accent); color: white; border: none; border-radius: 16px; font-weight: 600; cursor: pointer; transition: 0.2s; }
      button:disabled { opacity: 0.5; cursor: not-allowed; }
      #char-count { font-size: 10px; color: #8e8e93; text-align: right; margin-top: -15px; margin-bottom: 15px; display: block; }
      #char-count.limit { color: var(--danger); font-weight: bold; }
      .badge { padding: 4px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; background: #e5e5ea; color: #8e8e93; }
      .badge.latex { background: #34c759; color: white; }
      .badge.url { background: #007aff; color: white; }
      #result-card { display: none; text-align: center; border: 2px solid var(--success); }
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
          <div class="label">SLUG</div>
          <input type="text" name="slug" id="slug-input" placeholder="e.g. qm-notes" maxlength="30">
          <div class="label">CONTENT <span id="type-badge" class="badge">AUTO</span></div>
          <textarea name="content" id="content-area" maxlength="2000" required></textarea>
          <span id="char-count">0/2000</span>
          <input type="hidden" name="type" id="type-input" value="auto">
          <button type="submit" id="submit-btn">Create Node</button>
        </form>
      </div>
      <div class="card" id="result-card">
        <div style="font-weight:700; color:var(--success);">✅ NODE CREATED</div>
        <p id="result-url" style="word-break:break-all; font-weight:600; margin:15px 0;"></p>
        <button class="btn-secondary" onclick="copyResult(this)">Copy</button>
        <button onclick="location.reload()">New</button>
      </div>
    </div>
    <script>
      const sI = document.getElementById('slug-input'), secI = document.getElementById('secret-input'), cA = document.getElementById('content-area'), cC = document.getElementById('char-count'), tB = document.getElementById('type-badge');
      let t;
      
      cA.oninput = (e) => {
        const val = e.target.value;
        cC.innerText = val.length + "/2000";
        cC.style.color = val.length >= 2000 ? "#ff3b30" : "#8e8e93";
        
        // ★ 前端同步嚴格 URL 判斷 ★
        // 必須全字匹配，且不能包含空格或換行 (除了前後空白已被 trim)
        const strictUrl = /^(https?:\\/\\/)?([\\da-z\\.-]+)\\.([a-z\\.]{2,6})([\\/\\w \\.-]*)*\\/?$/i.test(val.trim());
        const hasMath = /[\\\u0370-\u03FF\u2200-\u22FF]/.test(val);
        
        if (strictUrl) { tB.innerText = 'URL'; tB.className = 'badge url'; }
        else if (hasMath) { tB.innerText = 'MATH'; tB.className = 'badge latex'; }
        else { tB.innerText = 'TEXT'; tB.className = 'badge'; }
      };

      const check = () => {
        const s = sI.value.replace(/[^a-zA-Z0-9-_]/g, ''); sI.value = s;
        clearTimeout(t); if (!s || !secI.value) return;
        t = setTimeout(async () => {
          const res = await fetch('/api/check-slug', { method: 'POST', body: JSON.stringify({ slug: s, secret: secI.value }) });
          if(res.ok) { const { exists } = await res.json(); sI.className = exists ? 'invalid' : 'valid'; document.getElementById('submit-btn').disabled = exists; }
        }, 400);
      };
      sI.oninput = check; secI.oninput = check;

      document.getElementById('create-form').onsubmit = async (e) => {
        e.preventDefault();
        const btn = document.getElementById('submit-btn');
        btn.disabled = true; btn.innerText = "Processing...";
        const res = await fetch('/api/create', { method: 'POST', body: new FormData(e.target) });
        const j = await res.json();
        if(j.success) { 
            document.getElementById('result-url').innerText = j.fullUrl; 
            document.getElementById('result-url').href = j.fullUrl; 
            document.getElementById('result-card').style.display='block'; 
            document.getElementById('create-form').style.display='none'; 
        }
        else { 
            alert(j.msg); 
            btn.disabled = false; btn.innerText = "Create Node"; 
        }
      };

      function copyResult(b) { 
          navigator.clipboard.writeText(document.getElementById('result-url').innerText); 
          const o = b.innerText; b.innerText = "Copied!"; 
          setTimeout(() => b.innerText = o, 2000); 
      }
    </script>
  </body>
  </html>`;
}

// ★★★ 核心渲染 (Layout Repair) ★★★
function generateHTML(data, slug) {
  const content = data.content;
  const safeContent = JSON.stringify(content);
  // 保持 200 字分流
  const isReaderMode = content.length > 200;
  
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
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; background: var(--bg); color: var(--text); display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
      
      .card { background: var(--card); width: 100%; max-width: ${isReaderMode ? '800px' : '480px'}; padding: ${isReaderMode ? '30px' : '40px 30px'}; border-radius: 30px; box-shadow: 0 20px 40px rgba(0,0,0,0.08); text-align: center; display: flex; flex-direction: column; max-height: 90vh; }
      
      .badge { display: inline-block; padding: 6px 14px; border-radius: 20px; font-size: 11px; font-weight: 700; background: #e5e5ea; color: var(--secondary); margin-bottom: 25px; align-self: center; text-transform: uppercase; }
      
      /* ★ 核心修復區 ★ */
      .content-wrapper { 
        width: 100%; position: relative; margin-bottom: 25px; 
        ${isReaderMode ? 'overflow-y: auto; text-align: left; background: #1e1e1e; color: #d4d4d4; padding: 20px; border-radius: 15px; border: 1px solid #333;' : ''}
      }

      .content { 
        /* 限制最大寬度，強迫換行 */
        max-width: 100%; 
        font-size: 1.2rem;
        min-height: 60px; 
        
        /* 1. 保留使用者輸入的換行 */
        white-space: pre-wrap; 
        
        /* 2. 像 Word 一樣斷字 (解決 dddd 問題) */
        word-break: break-word; 
        overflow-wrap: anywhere; 
        
        line-height: 1.6;
        ${isReaderMode ? 'font-family: "SF Mono", monospace; font-size: 14px;' : 'text-align: center; color: var(--text);'}
      }
      
      .copy-group { display: flex; gap: 10px; justify-content: center; margin-top: auto; }
      .copy-btn { flex: 1; padding: 12px; border: 1px solid #d1d1d6; border-radius: 14px; background: white; cursor: pointer; font-size: 13px; font-weight: 600; color: var(--text); display: flex; align-items: center; justify-content: center; gap: 6px; transition: 0.2s; }
      .copy-btn:active { transform: scale(0.96); background: #f2f2f7; }
      .copy-btn.success { border-color: #34c759; color: #34c759; background: #f2fff5; }
      
      .footer-text { color: var(--secondary); font-size: 11px; margin-top: 25px; font-weight: 500; opacity: 0.6; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="badge">${isReaderMode ? 'READER MODE' : 'PURELINK NODE'}</div>
      
      <div class="content-wrapper">
        <div class="content" id="main-content"></div>
      </div>
      
      <div class="copy-group">
        <button class="copy-btn" onclick="copyText(this)">📋 Text</button>
        ${!isReaderMode ? `<button class="copy-btn" onclick="downloadImage(this)">📥 PNG</button>` : ''}
      </div>

      <div class="footer-text">PureLink Knowledge Node</div>
    </div>

    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
    <script defer src="https://html2canvas.hertzen.com/dist/html2canvas.min.js"></script>
    <script>
      const raw = ${safeContent};
      const isCode = /\\b(function|return|const|var|if|else)\\b/.test(raw);

      window.onload = () => {
        const el = document.getElementById('main-content');
        try {
          if (${isReaderMode} || isCode) throw 'skip';
          // KaTeX 渲染
          katex.render(raw, el, { displayMode: true, trust: true, throwOnError: true });
        } catch (e) {
          // 純文字顯示 (自動應用 CSS 換行規則)
          el.innerText = raw;
        }
      };

      async function copyText(btn) {
        try {
          await navigator.clipboard.writeText(raw);
          const old = btn.innerText; btn.innerText = "✅ Copied!"; btn.classList.add('success');
          setTimeout(() => { btn.innerText = old; btn.classList.remove('success'); }, 2000);
        } catch (e) {}
      }

      async function downloadImage(btn) {
        const oldHtml = btn.innerHTML;
        btn.style.opacity = "0.6"; btn.style.pointerEvents = "none";

        try {
          const card = document.querySelector('.card');
          await new Promise(r => setTimeout(r, 200));
          
          const canvas = await html2canvas(card, { scale: 3, backgroundColor: '#ffffff', logging: false });
          const link = document.createElement('a');
          link.download = 'purelink_snap.png';
          link.href = canvas.toDataURL("image/png");
          link.click();

          btn.innerHTML = "✅ Saved"; btn.classList.add('success'); btn.style.opacity = "1";
        } catch (e) {
            btn.innerHTML = "❌ Error";
        } finally {
            setTimeout(() => {
                btn.innerHTML = oldHtml; btn.classList.remove('success'); btn.style.opacity = "1"; btn.style.pointerEvents = "auto";
            }, 2000);
        }
      }
    </script>
  </body>
  </html>`;
}
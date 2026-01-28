/**
 * Project PureLink - Admin & Core
 * Base: Chromium-Stable Version (User Provided)
 * Feature: Admin Console for URL Shortening
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = decodeURIComponent(url.pathname.slice(1)); // 去掉開頭的 /

    // ==========================================
    // 🛡️ 區域 1: Admin 管理介面 (新增功能)
    // ==========================================
    
    // 路由: /admin -> 顯示輸入框
    if (path === "admin") {
      return new Response(renderAdminPage(), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    // 路由: /api/create -> 接收表單 POST 資料並寫入 D1
    if (path === "api/create" && request.method === "POST") {
      return handleCreateLink(request, env);
    }

    // ==========================================
    // 🚀 區域 2: 核心功能 (你提供的穩定版代碼)
    // ==========================================

    const isPreview = path.endsWith('+');
    const lookupSlug = isPreview ? path.slice(0, -1) : path;

    if (lookupSlug === "") return new Response("PureLink: Operational.");

    const linkData = await env.pure_link_db.prepare(
      "SELECT content, type, is_affiliate FROM links WHERE slug = ?"
    ).bind(lookupSlug).first();

    if (!linkData) return new Response("404 - Link not found.", { status: 404 });

    if (isPreview || linkData.type === 'latex') {
      return new Response(generateHTML(linkData), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    return Response.redirect(sanitize(linkData.content), 301);
  },
};

// --- Admin 邏輯區 ---

async function handleCreateLink(request, env) {
  try {
    const formData = await request.formData();
    const slug = formData.get("slug");
    const type = formData.get("type");
    const content = formData.get("content");
    const secret = formData.get("secret"); // 簡單的密碼驗證

    // 簡單驗證 (你可以在 wrangler.toml 設定 ADMIN_SECRET)
    // 如果沒有設定環境變數，預設密碼是 "science"
    const correctSecret = env.ADMIN_SECRET || "science"; 
    if (secret !== correctSecret) {
      return new Response("⛔ Access Denied: Wrong Secret", { status: 403 });
    }

    if (!slug || !content) return new Response("❌ Missing Fields", { status: 400 });

    // 寫入資料庫
    await env.pure_link_db.prepare(
      "INSERT INTO links (slug, type, content, is_affiliate) VALUES (?, ?, ?, 0)"
    ).bind(slug, type, content).run();

    return new Response(`✅ Success! <br> Link created: <a href="/${slug}">${slug}</a>`, {
      headers: { "content-type": "text/html; charset=utf-8" }
    });
  } catch (e) {
    return new Response("❌ Database Error: " + e.message, { status: 500 });
  }
}

function renderAdminPage() {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PureLink Console</title>
    <style>
      body { font-family: -apple-system, system-ui, sans-serif; background: #f2f2f7; display: flex; justify-content: center; padding-top: 50px; }
      .card { background: white; padding: 30px; border-radius: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); width: 350px; }
      h2 { text-align: center; margin-bottom: 20px; color: #1c1c1e; }
      input, select, textarea { width: 100%; padding: 12px; margin-bottom: 15px; border: 1px solid #d1d1d6; border-radius: 10px; box-sizing: border-box; font-size: 14px; }
      textarea { height: 100px; font-family: monospace; }
      button { width: 100%; padding: 12px; background: #007aff; color: white; border: none; border-radius: 10px; font-weight: bold; cursor: pointer; }
      button:hover { background: #0063ce; }
    </style>
  </head>
  <body>
    <div class="card">
      <h2>🔗 New Link</h2>
      <form action="/api/create" method="POST">
        <input type="password" name="secret" placeholder="Admin Secret" required>
        <input type="text" name="slug" placeholder="Slug (e.g. schrodinger)" required>
        <select name="type">
          <option value="url">Redirect URL</option>
          <option value="latex">LaTeX Formula</option>
        </select>
        <textarea name="content" placeholder="URL or LaTeX Code..." required></textarea>
        <button type="submit">Create Node</button>
      </form>
    </div>
  </body>
  </html>
  `;
}

// --- 以下是你指定的 Core Logic (完全保留，未修改) ---

function sanitize(u) {
  try {
    const url = new URL(u);
    ['fbclid', 'igshid', 'gclid', 'utm_source', 'utm_medium', 'utm_campaign', 'si'].forEach(p => url.searchParams.delete(p));
    return url.toString().replace(/[?&]$/, "");
  } catch (e) { return u; }
}

function generateHTML(data) {
  const isLaTeX = data.type === 'latex';
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
      
      /* 公式區 */
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

      /* Toast */
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
      // 1. 偵測是否為 In-App Browser (Line, FB, IG)
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
        const log = (msg) => {
          const logEl = document.getElementById('debug-log');
          if (logEl) logEl.innerHTML += "<div>> " + msg + "</div>";
          console.log(msg);
        };

        const el = document.getElementById('math-display');
        await new Promise(r => setTimeout(r, 500)); 

        try {
          const canvas = await html2canvas(el, {
            scale: 3,
            backgroundColor: '#ffffff',
            logging: true,
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
        const old = btn.innerHTML; btn.innerHTML = "⏳";
        captureAndAction(canvas => {
          const link = document.createElement('a');
          link.download = 'formula.png';
          link.href = canvas.toDataURL("image/png");
          link.click();
          showFeedback(btn, "✅ Saved");
        });
      }

      function showFeedback(btn, msg) {
        const old = btn.innerHTML; btn.innerHTML = msg; btn.classList.add('success');
        setTimeout(() => { btn.innerHTML = old; btn.classList.remove('success'); }, 2000);
      }
      
      function showToast(msg) {
        const t = document.getElementById("toast"); t.innerText = msg; t.className = "show";
        setTimeout(() => { t.className = t.className.replace("show", ""); }, 3000);
      }
    </script>
  </body>
  </html>`;
}
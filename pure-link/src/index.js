/**
 * Project PureLink - Admin 2.0
 * Features: AJAX UI, Smart Auto-Detect, Random Slugs, Protocol Fixing
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

    // 核心跳轉邏輯 (保留原樣)
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

    // 2. Slug 自動生成 (如果留空)
    if (!slug) {
      slug = Math.random().toString(36).substring(2, 8); // 產生 6 碼亂數
    }

    // 3. 聰明的後端類型修正
    if (type === "auto") {
      const latexPatterns = /[\\^_{}]|\b(frac|sqrt|partial|hbar|hat|psi|phi)\b/i;
      // 寬容的 URL 判斷：包含 http, www, 或 .com/.tw 等
      const isUrl = /^(http|https):\/\/|www\.|\.[a-z]{2,}/i.test(content);
      type = latexPatterns.test(content) ? "latex" : (isUrl ? "url" : "latex"); // 預設回落到 latex 以防萬一
    }

    // 4. URL 補全協議 (如果 user 只打 www.google.com -> https://www.google.com)
    if (type === "url" && !/^https?:\/\//i.test(content)) {
      content = "https://" + content;
    }

    // 5. 寫入資料庫
    await env.pure_link_db.prepare(
      "INSERT INTO links (slug, type, content, is_affiliate) VALUES (?, ?, ?, 0)"
    ).bind(slug, type, content).run();

    // 6. 回傳 JSON 給前端 JS 處理 (不再直接回傳 HTML)
    const fullUrl = new URL(request.url).origin + "/" + slug;
    return new Response(JSON.stringify({ 
      success: true, 
      slug: slug, 
      type: type, 
      fullUrl: fullUrl 
    }), { headers: { "content-type": "application/json" } });

  } catch (e) {
    return new Response(JSON.stringify({ success: false, msg: e.message }), { status: 500 });
  }
}

// --- Frontend UI (Admin 2.0) ---

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
      .card { background: var(--card); padding: 30px; border-radius: 24px; box-shadow: 0 8px 30px rgba(0,0,0,0.06); margin-bottom: 20px; transition: all 0.3s ease; }
      
      h2 { text-align: center; margin: 0 0 25px 0; color: #1c1c1e; display: flex; align-items: center; justify-content: center; gap: 10px; }
      
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

      /* 結果卡片 (預設隱藏) */
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
        <h2>🔗 New Link</h2>
        <form id="create-form">
          <div class="input-group">
            <div class="label">ADMIN SECRET</div>
            <input type="password" name="secret" placeholder="••••••" required>
          </div>
          
          <div class="input-group">
            <div class="label">SLUG (Optional) <span class="badge">Auto-Gen if empty</span></div>
            <input type="text" name="slug" placeholder="e.g. qm-notes">
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
      const contentArea = document.getElementById('content-area');
      const typeBadge = document.getElementById('type-badge');
      const typeInput = document.getElementById('type-input');
      const resultCard = document.getElementById('result-card');
      const submitBtn = document.getElementById('submit-btn');
      
      // 前端即時識別 (UX)
      contentArea.addEventListener('input', (e) => {
        const val = e.target.value;
        const latexPatterns = /[\\\\^_{}]|\\b(frac|sqrt|partial|hbar|hat)\\b/i;
        const isUrl = /^(http|https):\\/\\/|www\\.|\\.[a-z]{2,}/i.test(val);

        if (latexPatterns.test(val)) {
          typeBadge.innerText = 'LATEX';
          typeBadge.className = 'badge latex';
          typeInput.value = 'auto'; // 讓後端再次確認
        } else if (isUrl) {
          typeBadge.innerText = 'URL';
          typeBadge.className = 'badge url';
          typeInput.value = 'auto';
        } else {
          typeBadge.innerText = 'AUTO';
          typeBadge.className = 'badge';
        }
      });

      // AJAX 提交表單
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        submitBtn.disabled = true;
        submitBtn.innerText = "Processing...";

        const formData = new FormData(form);
        
        try {
          const res = await fetch('/api/create', { method: 'POST', body: formData });
          const json = await res.json();
          
          if (json.success) {
            // 顯示結果卡片
            document.getElementById('result-url').innerText = json.fullUrl;
            document.getElementById('result-url').href = json.fullUrl;
            resultCard.style.display = 'block';
            form.style.opacity = '0.5';
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
        form.style.opacity = '1';
        resultCard.style.display = 'none';
        typeBadge.innerText = 'AUTO';
        typeBadge.className = 'badge';
      }
    </script>
  </body>
  </html>
  `;
}

// 核心渲染與 Sanitize 邏輯保持不變...
function sanitize(u) { /* ...同前... */ return u; }
function generateHTML(data) { /* ...同前 (Chromium版)... */ return `...`; }
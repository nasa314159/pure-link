/**
 * Project PureLink - Final Polish
 * Fixes: LaTeX rendering stack-effect by normalizing backslashes
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let path = decodeURIComponent(url.pathname.slice(1));
    const isPreview = path.endsWith('+');
    if (isPreview) path = path.slice(0, -1);

    if (path === "") return new Response("PureLink: Operational.");

    const linkData = await env.pure_link_db.prepare(
      "SELECT content, type, is_affiliate FROM links WHERE slug = ?"
    ).bind(path).first();

    if (!linkData) return new Response("404 - Link not found.", { status: 404 });

    if (isPreview || linkData.type === 'latex') {
      return new Response(generateHTML(linkData), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    return Response.redirect(sanitize(linkData.content), 301);
  },
};

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
      :root { --primary: #007aff; --bg: #f2f2f7; --card: #ffffff; --text: #1c1c1e; --secondary: #8e8e93; }
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
      .card { background: var(--card); width: 85%; max-width: 420px; padding: 35px 25px; border-radius: 30px; box-shadow: 0 10px 40px rgba(0,0,0,0.06); text-align: center; }
      .badge { display: inline-block; padding: 6px 14px; border-radius: 20px; font-size: 11px; font-weight: 700; background: #e5e5ea; color: var(--secondary); margin-bottom: 25px; text-transform: uppercase; letter-spacing: 1px; }
      .content { font-size: 1.15rem; margin-bottom: 30px; color: var(--text); min-height: 60px; display: flex; justify-content: center; align-items: center; }
      #math-display { font-size: 1.6rem; width: 100%; }
      .copy-group { display: flex; gap: 10px; justify-content: center; margin-top: 25px; }
      .copy-btn { flex: 1; padding: 12px; border: 1px solid #d1d1d6; border-radius: 14px; background: white; cursor: pointer; font-size: 13px; font-weight: 600; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 6px; }
      .copy-btn:active { transform: scale(0.96); background: #f2f2f7; }
      .copy-btn.success { border-color: #34c759; color: #34c759; background: #f2fff5; }
      .btn-main { display: block; background: var(--text); color: #fff; text-align: center; padding: 18px; border-radius: 18px; text-decoration: none; font-weight: 600; margin-top: 30px; }
      .footer-text { color: var(--secondary); font-size: 12px; margin-top: 25px; font-weight: 500; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="badge">${isLaTeX ? 'Scientific Formula' : 'Link Preview'}</div>
      
      <div class="content">
        ${isLaTeX ? `<div id="math-display" style="opacity: 0;">${data.content}</div>` : data.content}
      </div>
      
      ${isLaTeX ? `
        <div class="copy-group">
          <button class="copy-btn" onclick="copyAction(this, \`${data.content}\`, 'latex')">📋 LaTeX</button>
          <button class="copy-btn" onclick="copyAction(this, \`${data.content}\`, 'unicode')">🔤 Unicode</button>
        </div>
      ` : ''}

      ${!isLaTeX ? `<a href="${data.content}" class="btn-main">Continue to Site</a>` : ''}
      <div class="footer-text">PureLink Knowledge Node</div>
    </div>

    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
    <script>
      function toUnicode(latex) {
        let text = latex;
        // 處理分數 (兼容雙斜線輸入)
        text = text.replace(/\\\\frac\\{(.+?)\\}\\{(.+?)\\}/g, '($1)/($2)');
        text = text.replace(/\\frac\\{(.+?)\\}\\{(.+?)\\}/g, '($1)/($2)');
        
        const symbols = {
          '\\\\hbar': 'ℏ', '\\\\partial': '∂', '\\\\Psi': 'Ψ', '\\\\hat{H}': 'Ĥ',
          '\\\\alpha': 'α', '\\\\beta': 'β', '\\\\infty': '∞'
        };
        // 備用：處理單斜線的情況 (雖然目前是雙斜線)
        const symbolsSingle = {
          '\\hbar': 'ℏ', '\\partial': '∂', '\\Psi': 'Ψ', '\\hat{H}': 'Ĥ'
        };

        for (const [k, v] of Object.entries(symbols)) text = text.replace(new RegExp(k.replace(/\\\\/g, '\\\\\\\\'), 'g'), v);
        for (const [k, v] of Object.entries(symbolsSingle)) text = text.replace(new RegExp('\\\\' + k.slice(1), 'g'), v);

        return text.replace(/\\\\/g, '').replace(/[{}]/g, ' ').replace(/\\s+/g, ' ').trim();
      }

      window.onload = () => {
        const el = document.getElementById('math-display');
        if (${isLaTeX} && el) {
          try {
            // ★★★ 關鍵修復：將資料庫的 "Copy專用雙斜線" 轉回 "KaTeX專用單斜線" ★★★
            const rawLaTeX = el.textContent.replace(/\\\\\\\\/g, '\\\\'); 
            
            katex.render(rawLaTeX, el, { 
              throwOnError: false, 
              displayMode: true,
              trust: true
            });
            el.style.opacity = '1';
          } catch (err) {
            el.innerHTML = '<span style="color:#ff3b30">Render Error</span>';
            el.style.opacity = '1';
          }
        }
      };

      async function copyAction(btn, raw, mode) {
        const text = mode === 'unicode' ? toUnicode(raw) : raw;
        try {
          await navigator.clipboard.writeText(text);
          const old = btn.innerHTML; btn.innerHTML = "✅ Copied"; btn.classList.add('success');
          setTimeout(() => { btn.innerHTML = old; btn.classList.remove('success'); }, 2000);
        } catch (e) {}
      }
    </script>
  </body>
  </html>`;
}
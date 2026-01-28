/**
 * Project PureLink - The "Ironclad" Edition
 * 1. Base64 Data Transport (Prevents backslash corruption)
 * 2. MathJax Standalone SVG (Prevents blank images)
 * 3. Robust Sanitization
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
      return new Response(generateHTML(linkData, path), {
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

// 輔助函式：處理 Unicode 字串的 Base64 編碼
function toBase64(str) {
  try {
    return btoa(unescape(encodeURIComponent(str)));
  } catch (e) { return ""; }
}

function generateHTML(data, slug) {
  const isLaTeX = data.type === 'latex';
  const pageTitle = isLaTeX ? "Scientific Note | PureLink" : "Link Preview | PureLink";
  
  // ★ 核心修復 1: 使用 Base64 傳輸資料，避開所有反斜線轉義地獄
  const base64Content = toBase64(data.content);

  return `
  <!DOCTYPE html>
  <html lang="zh-TW">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>${pageTitle}</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
    
    <script>
      window.MathJax = {
        loader: { load: ['input/tex', 'output/svg'] },
        svg: { 
          fontCache: 'none', // ★ 核心修復 2: 禁止字體快取，強制將文字轉為純路徑，解決空白圖片問題
          scale: 1.5 
        },
        startup: { typeset: false }
      };
    </script>
    <script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js" async></script>

    <style>
      :root { --bg: #f2f2f7; --card: #ffffff; --text: #1c1c1e; --secondary: #8e8e93; }
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
      .card { background: var(--card); width: 100%; max-width: 420px; padding: 35px 25px; border-radius: 30px; box-shadow: 0 10px 40px rgba(0,0,0,0.06); text-align: center; }
      .badge { display: inline-block; padding: 6px 14px; border-radius: 20px; font-size: 11px; font-weight: 700; background: #e5e5ea; color: var(--secondary); margin-bottom: 25px; text-transform: uppercase; }
      .content { font-size: 1.15rem; margin-bottom: 30px; min-height: 80px; display: flex; justify-content: center; align-items: center; border-radius: 16px; transition: all 0.2s; position: relative; }
      .content.clickable { cursor: pointer; }
      .content.clickable:active { transform: scale(0.98); background: #f9f9f9; }
      
      #math-display { font-size: 1.6rem; width: 100%; padding: 20px; box-sizing: border-box; overflow-x: auto; }
      
      .copy-group { display: flex; gap: 8px; justify-content: center; margin-top: 25px; flex-wrap: wrap; }
      .copy-btn { flex: 1; min-width: 80px; padding: 12px; border: 1px solid #d1d1d6; border-radius: 14px; background: white; cursor: pointer; font-size: 12px; font-weight: 600; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 4px; }
      .footer-text { color: var(--secondary); font-size: 11px; margin-top: 25px; font-weight: 500; opacity: 0.8; }
      #toast { visibility: hidden; min-width: 200px; background: rgba(28,28,30,0.95); color: #fff; text-align: center; border-radius: 50px; padding: 12px; position: fixed; bottom: 40px; left: 50%; transform: translateX(-50%); font-size: 13px; z-index: 1000; opacity: 0; transition: opacity 0.3s; pointer-events: none; }
      #toast.show { visibility: visible; opacity: 1; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="badge">${isLaTeX ? 'Scientific Formula' : 'Link Preview'}</div>
      
      <div class="content ${isLaTeX ? 'clickable' : ''}" 
           ${isLaTeX ? 'onclick="handleImageCopy()"' : ''}>
        <div id="math-display" style="opacity: 0;">Loading...</div>
      </div>

      ${isLaTeX ? `
        <div class="copy-group">
          <button class="copy-btn" onclick="copyText(this, 'latex')">📋 LaTeX</button>
          <button class="copy-btn" onclick="copyText(this, 'unicode')">🔤 Uni</button>
          <button class="copy-btn" onclick="downloadImage(this)">📥 PNG</button>
        </div>
      ` : `<a href="${data.content}" style="display:block; background:#1c1c1e; color:#fff; padding:15px; border-radius:15px; text-decoration:none; font-weight:600;">Open Link</a>`}
      
      <div class="footer-text">PureLink Knowledge Node</div>
    </div>
    <div id="toast"></div>

    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
    <script>
      // 解碼後端傳來的 Base64，還原最純淨的 LaTeX 字串
      let rawFormula = "";
      try {
        rawFormula = decodeURIComponent(escape(atob("${base64Content}")));
      } catch(e) { rawFormula = "Error loading data"; }

      const isWebKit = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Safari") && !navigator.userAgent.includes("Chrome"));

      // Unicode 轉換邏輯
      function toUnicode(latex) {
        let t = latex.replace(/\\\\frac\\{(.+?)\\}\\{(.+?)\\}/g, '($1)/($2)').replace(/\\frac\\{(.+?)\\}\\{(.+?)\\}/g, '($1)/($2)');
        const m = { '\\\\hbar': 'ℏ', '\\\\partial': '∂', '\\\\Psi': 'Ψ', '\\\\hat{H}': 'Ĥ' };
        for (const [k, v] of Object.entries(m)) t = t.replace(new RegExp(k.replace(/\\\\/g, '\\\\\\\\'), 'g'), v);
        return t.replace(/\\\\/g, '').replace(/[{}]/g, ' ').trim();
      }

      window.onload = () => {
        const el = document.getElementById('math-display');
        if (el && ${isLaTeX}) {
          // 顯示用 KaTeX (因為它最美觀)
          katex.render(rawFormula, el, { throwOnError: false, displayMode: true });
          el.style.opacity = '1';
        }
      };

      async function copyText(btn, mode) {
        try {
          const text = mode === 'unicode' ? toUnicode(rawFormula) : rawFormula;
          await navigator.clipboard.writeText(text);
          showFeedback(btn, "✅ Copied");
        } catch (e) { showToast("⚠️ Copy blocked"); }
      }

      // ★★★ 向量輸出引擎 ★★★
      async function generateHighResBlob() {
        if (!window.MathJax) throw new Error("MathJax loading");
        
        // 1. 使用 MathJax 生成 SVG (fontCache: 'none' 確保所有字體都變成線條)
        const svgNode = await MathJax.tex2svgPromise(rawFormula);
        const svgElement = svgNode.querySelector('svg');
        if (!svgElement) throw new Error("SVG failed");

        // 2. 調整 SVG 尺寸 (放大 4 倍以獲得視網膜級解析度)
        const scaleFactor = 4;
        const w = parseFloat(svgElement.getAttribute('width')) || 10;
        const h = parseFloat(svgElement.getAttribute('height')) || 10;
        // ex, em 單位轉換 (粗略估計 1ex ~ 8px)
        const pixelW = w * 8 * scaleFactor; 
        const pixelH = h * 8 * scaleFactor;
        
        svgElement.setAttribute('width', pixelW + "px");
        svgElement.setAttribute('height', pixelH + "px");
        
        // 3. 繪製到 Canvas (白底)
        const canvas = document.createElement('canvas');
        canvas.width = pixelW + 60;
        canvas.height = pixelH + 60;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const xml = new XMLSerializer().serializeToString(svgElement);
        const img = new Image();
        
        return new Promise((resolve, reject) => {
          img.onload = () => {
            // 置中繪製
            ctx.drawImage(img, 30, 30, pixelW, pixelH);
            canvas.toBlob(resolve, 'image/png', 1.0);
          };
          img.onerror = reject;
          img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)));
        });
      }

      async function handleImageCopy() {
        if (isWebKit) {
          showToast("👆 iOS: Please use PNG button");
          const btn = document.querySelector('button[onclick="downloadImage(this)"]');
          if (btn) {
             btn.style.borderColor = '#007aff';
             setTimeout(() => btn.style.borderColor = '#d1d1d6', 1000);
          }
          return;
        }
        
        showToast("🎨 Rendering...");
        try {
          const blob = await generateHighResBlob();
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          showToast("✅ Image copied!");
        } catch (e) { showToast("⚠️ Use PNG button"); }
      }

      async function downloadImage(btn) {
        const old = btn.innerHTML; btn.innerHTML = "⏳";
        try {
          const blob = await generateHighResBlob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.download = 'formula_${slug}.png';
          a.href = url;
          a.click();
          URL.revokeObjectURL(url);
          showFeedback(btn, "✅ Saved");
        } catch (e) { 
          console.error(e);
          btn.innerHTML = "❌"; 
          setTimeout(() => btn.innerHTML = old, 2000);
        }
      }

      function showFeedback(btn, msg) {
        const old = btn.innerHTML; btn.innerHTML = msg; btn.classList.add('success');
        setTimeout(() => { btn.innerHTML = old; btn.classList.remove('success'); }, 2000);
      }

      function showToast(msg) {
        const t = document.getElementById("toast"); t.innerText = msg; t.className = "show";
        setTimeout(() => t.className = "", 3000);
      }
    </script>
  </body>
  </html>`;
}
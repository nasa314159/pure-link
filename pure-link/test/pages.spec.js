import { describe, expect, it } from 'vitest';
import { renderAccountPage, renderCardPage, renderFormulaPage, renderHomePage, renderLegalPage, renderManagePage, renderReportPage } from '../src/pages.js';

describe('interactive pages', () => {
  it('emits a syntactically valid creation script with its CSP nonce', () => {
    const html = renderHomePage('test-nonce');
    const script = extractScript(html);
    expect(html).toContain('nonce="test-nonce"');
    expect(html).toContain('網址');
    expect(html).toContain('公式');
    expect(html).toContain('小卡');
    expect(html).toContain('貼上 \\\\frac');
    expect(html).toContain('公式即時預覽');
    expect(html).toContain('data-formula-category="calculus"');
    expect(html).toContain('data-formula-category="matrices"');
    expect(html).toContain('data-formula-category="trigonometry"');
    expect(html).toContain('data-formula-insert="\\int ');
    expect(html).toContain('data-formula-insert="^"');
    expect(html).toContain('data-formula-insert="\\begin{bmatrix}');
    expect(html).toContain('data-formula-insert="\\operatorname{arsinh} ');
    expect(html).toContain('data-formula-insert="\\Omega"');
    expect(html).toContain('aria-label="微積分"');
    expect(html).toContain('>∂ ∫</button>');
    expect(html).toContain('>□/□</button>');
    expect(html).toContain('data-formula-insert="\\frac{a}{b}"');
    expect(html).toContain('data-formula-insert="C_{}^{}"');
    expect(html).toContain('data-formula-insert="P_{}^{}"');
    expect(html).toContain('data-formula-insert="\\Box"');
    expect(html).toContain('data-formula-insert="\\hat{H}"');
    expect(html).toContain('id="custom-formula-list"');
    expect(html).toContain('只儲存在這個瀏覽器，不會上傳到 PureLink');
    expect(html).toContain('id="formula-ai"');
    expect(html).toContain('公式生成需要登入');
    expect(html).not.toContain('>微積分</button>');
    expect(html).not.toContain('>分數</button>');
    expect(html).toContain('/assets/formula-editor.js');
    expect(html).toContain('自訂本次清理規則');
    expect(html).toContain("new URLSearchParams(location.hash.slice(1)).get('url')");
    expect(html).toContain('navigator.share');
    expect(html).toContain("document.execCommand('copy')");
    expect(html).toContain('瀏覽器不允許自動複製');
    expect(html).toContain('id="quick-open-form"');
    expect(html).toContain('id="quick-open-preview"');
    expect(html).toContain("location.assign('/' + candidate + (preview ? '+' : ''))");
    expect(html).toContain('貼上 no-no.uk/abc，或只輸入 abc');
    expect(() => new Function(script)).not.toThrow();
  });

  it('offers an optional brand mark for formula and card PNG exports', () => {
    const formula = renderFormulaPage({ slug: 'math', content: 'x²' });
    const card = renderCardPage({ slug: 'kind', content: 'hello', theme: 'paper' });
    expect(formula).toContain('data-export-brand-toggle');
    expect(card).toContain('data-export-brand-toggle');
    expect(formula).toContain('data-copy-link');
    expect(formula).toContain('data-share-link');
    expect(card).toContain('data-copy-link');
    expect(card).toContain('data-share-link');
    expect(formula).toContain('<meta name="robots" content="noindex, nofollow, noarchive">');
    expect(card).toContain('<meta name="robots" content="noindex, nofollow, noarchive">');
  });

  it('publishes descriptive homepage SEO and social preview metadata', () => {
    const html = renderHomePage('test-nonce', '', false, '', null, 'en');
    expect(html).toContain('Privacy-friendly URL shortener and formula sharing');
    expect(html).toContain('privacy-friendly URL shortener for clean short links');
    expect(html).toContain('<meta name="robots" content="index, follow">');
    expect(html).toContain('<link rel="canonical" href="https://no-no.uk/en/">');
    expect(html).toContain('hreflang="zh-Hant"');
    expect(html).toContain('hreflang="x-default"');
    expect(html).toContain('<meta property="og:image" content="https://no-no.uk/og.png?v=1">');
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg">');
    expect(html).not.toContain('name="keywords"');
  });

  it('shows a clear retry path when an OAuth attempt expires', () => {
    const html = renderHomePage('test-nonce', '', true, 'expired');
    expect(html).toContain('登入等待時間已結束');
    expect(html).toContain('href="/zh-Hant/account">重新登入');
  });

  it('keeps a sign-in entry in the top-right corner', () => {
    const signedOut = renderHomePage('test-nonce', '', true);
    const signedIn = renderHomePage('test-nonce', '', true, '', { email: 'person@example.com' });
    expect(signedOut).toContain('class="account-entry"');
    expect(signedOut).toContain('href="/auth/google?returnTo=%2Fzh-Hant%2F"');
    expect(signedOut).toContain('>登入</a>');
    expect(signedIn).toContain('href="/zh-Hant/account"');
    expect(signedIn).toContain('>我的 PureLink</a>');
    expect(signedIn).not.toContain('href="/auth/google?returnTo=%2F"');
  });

  it('shows the signed-in formula AI editor with a privacy disclosure', () => {
    const html = renderHomePage('test-nonce', '', true, '', { id: 'user-1', email: 'person@example.com' });
    expect(html).toContain('id="formula-ai-description"');
    expect(html).toContain('id="generate-formula-ai"');
    expect(html).toContain('id="use-formula-ai"');
    expect(html).toContain('Cloudflare Workers AI');
    expect(html).toContain('PureLink 不儲存描述或生成結果');
  });

  it('shows the administrator formula allowance without changing regular accounts', () => {
    const html = renderHomePage('test-nonce', '', true, '', { id: 'admin-1', email: 'owner@example.com', is_admin: 1 });
    expect(html).toContain('每日 100 次 （管理員）');
  });

  it('uses localized catalog copy for account, management, and report interfaces', () => {
    const link = { slug: 'locale-proof', content_type: 'url', owner_user_id: 'user-1' };
    const account = renderAccountPage({ id: 'user-1', email: 'person@example.com' }, [], 0, false, '', '', 'en');
    const manage = renderManagePage(link, 'test-nonce', { id: 'user-1', email: 'person@example.com' }, true, 'en');
    const englishReport = renderReportPage('locale-proof', 'test-nonce', '', 'en');
    const chineseReport = renderReportPage('locale-proof', 'test-nonce', '', 'zh-Hant');

    expect(account).toContain('Hello, person@example.com.');
    expect(manage).toContain('Signed in with Google:');
    expect(englishReport).toContain('button.textContent = "Sending…"');
    expect(chineseReport).toContain('button.textContent = "正在送出…"');
  });

  it('sends the rendered page locale with locale-sensitive API requests', () => {
    const chineseHome = renderHomePage('test-nonce', '', false, '', null, 'zh-Hant');
    const englishHome = renderHomePage('test-nonce', '', false, '', null, 'en');
    const englishReport = renderReportPage('locale-proof', 'test-nonce', '', 'en');

    expect(chineseHome).toContain("'x-purelink-locale': \"zh-Hant\"");
    expect(englishHome).toContain("'x-purelink-locale': \"en\"");
    expect(englishReport).toContain("'x-purelink-locale': \"en\"");
  });

  it('publishes review-ready AI credit information in both locales', () => {
    const credits = renderLegalPage('ai-credits', 'en');
    const chineseCredits = renderLegalPage('ai-credits', 'zh-Hant');
    const refunds = renderLegalPage('refund-policy', 'en');
    expect(credits).toContain('<html lang="en">');
    expect(credits).toContain('Last updated: September 1, 2026');
    expect(credits).toContain('PureLink AI Formula Credits');
    expect(credits).toContain('Small: 150 AI formula drafts — NT$150');
    expect(credits).toContain('Standard: 400 AI formula drafts — NT$300');
    expect(credits).toContain('Large: 1,000 AI formula drafts — NT$600');
    expect(credits).toContain('one-time purchases, not subscriptions');
    expect(credits).toContain('Checkout is completing provider approval and production integration');
    expect(credits).not.toMatch(/US\$5|US\$10|US\$20|300 AI formula generations|800 generations|2,000 generations|Creem/);
    expect(chineseCredits).toContain('<html lang="zh-Hant">');
    expect(chineseCredits).toContain('MVP 說明版本：2026-09-01');
    expect(chineseCredits).toContain('PureLink AI 公式額度');
    expect(chineseCredits).toContain('小型方案：150 次 AI 公式草稿，NT$150');
    expect(chineseCredits).toContain('標準方案：400 次 AI 公式草稿，NT$300');
    expect(chineseCredits).toContain('大型方案：1,000 次 AI 公式草稿，NT$600');
    expect(chineseCredits).toContain('一次性購買，不是訂閱');
    expect(chineseCredits).toContain('付款功能目前正在完成供應商審核與正式整合；未啟用前不會收款');
    expect(chineseCredits).toContain('href="/zh-Hant/refund-policy"');
    expect(chineseCredits).toContain('mailto:nasa3.14159@gmail.com');
    expect(chineseCredits).not.toMatch(/US\$5|US\$10|US\$20|300 次 AI 公式生成|800 次|2,000 次|Creem/);
    expect(credits).toContain('nasa3.14159@gmail.com');
    expect(refunds).toContain('<html lang="en">');
    expect(refunds).toContain('Last updated: August 14, 2026');
    expect(refunds).toContain('within 14 calendar days');
    expect(refunds).toContain('Consumed credits are generally not refundable');
  });

  it('shows purchased credits and creates checkout only when billing is configured', () => {
    const disabled = renderAccountPage({ email: 'person@example.com' }, [], 12, false);
    const enabled = renderAccountPage({ email: 'person@example.com' }, [], 12, true, 'success', 'billing-nonce');
    expect(disabled).toContain('可用購買額度：12 次');
    expect(disabled).not.toContain('id="buy-credits-300"');
    expect(enabled).toContain('id="buy-credits-300"');
    expect(enabled).toContain('付款流程已返回 PureLink');
    expect(enabled).toContain('nonce="billing-nonce"');
    expect(() => new Function(extractScript(enabled))).not.toThrow();
  });

  it('loads Turnstile as a regular deferred script', () => {
    const html = renderHomePage('test-nonce', 'site-key');
    expect(html).toContain('src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer');
    expect(html).toContain('window.turnstile?.reset();');
    expect(html).not.toContain('type="module" src="https://challenges.cloudflare.com');
  });

  it('emits a syntactically valid anonymous management script', () => {
    const html = renderManagePage({ slug: 'safe-slug', content_type: 'url', owner_user_id: null }, 'manage-nonce');
    const script = extractScript(html);
    expect(html).toContain('nonce="manage-nonce"');
    expect(() => new Function(script)).not.toThrow();
  });

  it('emits a syntactically valid report form script', () => {
    const html = renderReportPage('reported-link', 'report-nonce');
    const script = extractScript(html);
    expect(html).toContain('reported-link');
    expect(() => new Function(script)).not.toThrow();
  });
});

function extractScript(html) {
  const match = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/);
  if (!match) throw new Error('Inline script was not found.');
  return match[1];
}

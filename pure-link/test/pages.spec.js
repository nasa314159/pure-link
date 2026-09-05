import { describe, expect, it } from 'vitest';
import { renderAccountPage, renderCardPage, renderFormulaPage, renderHomePage, renderLegalPage, renderManagePage, renderReportPage, renderStartPage, renderSupportPage } from '../src/pages.js';

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

  it('uses localized GET links for language switching', () => {
    const chineseHome = renderHomePage('test-nonce', '', false, '', null, 'zh-Hant');
    const englishHome = renderHomePage('test-nonce', '', false, '', null, 'en');
    const chinesePrivacy = renderLegalPage('privacy', 'zh-Hant');
    const englishCredits = renderLegalPage('ai-credits', 'en');

    expect(chineseHome).toContain('href="/en/"');
    expect(englishHome).toContain('href="/zh-Hant/"');
    expect(chinesePrivacy).toContain('href="/en/privacy"');
    expect(englishCredits).toContain('href="/zh-Hant/ai-credits"');
    expect(chineseHome).not.toContain('<form method="post" action="/locale">');
  });

  it('localizes homepage placeholders and signed-in result recovery copy', () => {
    const english = renderHomePage('test-nonce', '', true, '', { id: 'user-1', email: 'person@example.com' }, 'en');
    const chinese = renderHomePage('test-nonce', '', true, '', null, 'zh-Hant');
    const anonymous = renderHomePage('test-nonce', '', false, '', null, 'en');
    const signedInChinese = renderHomePage('test-nonce', '', true, '', { id: 'user-1', email: 'person@example.com' }, 'zh-Hant');

    expect(english).not.toContain('例如：');
    expect(english).not.toContain('一直惦記你的我');
    expect(english).toContain('placeholder="For example: Thinking of you"');
    expect(english).toContain('placeholder="For example: campaign_id, ref_*"');
    expect(english).toContain('placeholder="For example: utm_source, ref_code"');
    expect(english).toContain('placeholder="For example: Ĥ"');
    expect(english).toContain('placeholder="For example: \\hat{H}"');
    expect(english).toContain('Saved to your PureLink account');
    expect(english).toContain('optional backup');
    expect(english).toContain('<strong id="recovery-title">Saved to your PureLink account</strong>');
    expect(english).not.toContain('<strong id="recovery-title">Save your anonymous management credential</strong>');
    expect(english).toContain('Copy backup management address');
    expect(english).toContain('Download backup recovery file');
    expect(english).toContain('Use this only as an additional recovery method. Your signed-in account remains the primary way to manage this PureLink.');
    expect(anonymous).toContain('<strong id="recovery-title">Save your anonymous management credential</strong>');
    expect(anonymous).toContain('Copy management address');
    expect(anonymous).toContain('Download recovery file');
    expect(chinese).toContain('placeholder="例如：一直惦記你的我"');
    expect(chinese).toContain('placeholder="例如：campaign_id, ref_*"');
    expect(chinese).toContain('placeholder="例如：utm_source, ref_code"');
    expect(chinese).toContain('placeholder="例如：Ĥ"');
    expect(chinese).toContain('placeholder="例如：\\hat{H}"');
    expect(signedInChinese).toContain('<strong id="recovery-title">已儲存到你的 PureLink 帳號</strong>');
    expect(signedInChinese).toContain('選用的備用管理憑證');
    expect(signedInChinese).toContain('僅作為額外復原方式。你的登入帳號仍是管理這個 PureLink 的主要方式。');
    expect(signedInChinese).toContain('複製備用管理地址');
    expect(signedInChinese).toContain('下載備用復原檔案');
    expect(signedInChinese).not.toContain('<strong id="recovery-title">請保存匿名管理憑證</strong>');
    expect(chinese).toContain('複製管理地址');
    expect(chinese).toContain('下載恢復檔案');
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
    expect(credits).toContain('No payment rail is enabled in this deployment');
    expect(credits).not.toMatch(/US\$5|US\$10|US\$20|300 AI formula generations|800 generations|2,000 generations|Creem/);
    expect(chineseCredits).toContain('<html lang="zh-Hant">');
    expect(chineseCredits).toContain('MVP 說明版本：2026-09-01');
    expect(chineseCredits).toContain('PureLink AI 公式額度');
    expect(chineseCredits).toContain('小型方案：150 次 AI 公式草稿，NT$150');
    expect(chineseCredits).toContain('標準方案：400 次 AI 公式草稿，NT$300');
    expect(chineseCredits).toContain('大型方案：1,000 次 AI 公式草稿，NT$600');
    expect(chineseCredits).toContain('一次性購買，不是訂閱');
    expect(chineseCredits).toContain('此部署尚未啟用任何付款方式；啟用前不會收款');
    expect(chineseCredits).toContain('href="/zh-Hant/refund-policy"');
    expect(chineseCredits).toContain('mailto:nasa3.14159@gmail.com');
    expect(chineseCredits).not.toMatch(/US\$5|US\$10|US\$20|300 次 AI 公式生成|800 次|2,000 次|Creem/);
    expect(credits).toContain('nasa3.14159@gmail.com');
    expect(refunds).toContain('<html lang="en">');
    expect(refunds).toContain('Last updated: August 14, 2026');
    expect(refunds).toContain('within 14 calendar days');
    expect(refunds).toContain('Consumed credits are generally not refundable');
  });

  it('exposes configured Taiwan payment methods without exposing their provider', () => {
    const englishDisabled = renderLegalPage('ai-credits', 'en');
    const englishEcpay = renderLegalPage('ai-credits', 'en', { ecpay: true });
    const chineseEcpay = renderLegalPage('ai-credits', 'zh-Hant', { ecpay: true });
    expect(englishDisabled).not.toContain('ECPay');
    expect(englishDisabled).not.toContain('legal-purchase');
    expect(englishEcpay).toContain('Credit card / Apple Pay / TWQR and more');
    expect(englishEcpay).not.toContain('ECPay');
    expect(englishEcpay).toContain('Sign in to purchase AI formula credits');
    expect(chineseEcpay).toContain('信用卡 / Apple Pay / TWQR 等');
    expect(chineseEcpay).not.toContain('ECPay');
    expect(chineseEcpay).toContain('登入購買 AI 公式額度');
    expect(englishEcpay).not.toContain('信用卡 / Apple Pay / TWQR 等');
    expect(chineseEcpay).not.toContain('Credit card / Apple Pay / TWQR and more');
  });

  it('shows canonical packs and only enabled payment rails on the account page', () => {
    const disabled = renderAccountPage({ email: 'person@example.com' }, [], 12, false);
    const enabled = renderAccountPage({ email: 'person@example.com' }, [], 12, { ecpay: true, lemon: true }, 'success', 'billing-nonce', 'en');
    expect(disabled).toContain('可用購買額度：12 次');
    expect(disabled).not.toContain('data-billing-checkout');
    expect(enabled).toContain('data-provider="ecpay" data-pack-id="small"');
    expect(enabled).toContain('data-provider="lemon" data-pack-id="large"');
    expect(enabled).toContain('Small: 150 AI formula drafts — NT$150');
    expect(enabled).toContain('The payment flow has returned to PureLink');
    expect(enabled).toContain('nonce="billing-nonce"');
    expect(() => new Function(extractScript(enabled))).not.toThrow();
  });

  it('keeps account billing copy localized when ECPay is enabled', () => {
    const english = renderAccountPage({ email: 'person@example.com' }, [], 0, { ecpay: true }, '', 'billing-nonce', 'en');
    const chinese = renderAccountPage({ email: 'person@example.com' }, [], 0, { ecpay: true }, '', 'billing-nonce', 'zh-Hant');
    expect(english).toContain('Credit card / Apple Pay / TWQR and more');
    expect(english).not.toContain('台灣一次性付款');
    expect(chinese).toContain('信用卡 / Apple Pay / TWQR 等');
    expect(chinese).not.toContain('Credit card / Apple Pay / TWQR and more');
  });

  it('explains that a returned checkout is pending verified server confirmation', () => {
    const english = renderAccountPage({ email: 'person@example.com' }, [], 0, { lemon: true }, 'pending', 'billing-nonce', 'en');
    const chinese = renderAccountPage({ email: 'person@example.com' }, [], 0, { ecpay: true }, 'pending', 'billing-nonce', 'zh-Hant');
    expect(english).toContain('Waiting for verified payment confirmation.');
    expect(english).toContain('Returning in this browser does not grant credits.');
    expect(english).toContain('refreshing or revisiting this page cannot duplicate credits');
    expect(chinese).toContain('正在等待已驗證的付款確認。');
    expect(chinese).toContain('重新整理或再次造訪這個頁面不會重複加入額度');
  });

  it('uses a Turnstile challenge for an enabled anonymous support checkout', () => {
    const html = renderSupportPage({ netTwd: 0, netUsdMinor: 0, contributionCount: 0, publicSupporters: [] }, { ecpay: true }, '', 'support-nonce', 'en', 'site-key');
    expect(html).toContain('data-action="support-checkout"');
    expect(html).toContain('data-sitekey="site-key"');
    expect(html).toContain('data-support-amount="100"');
    expect(html).toContain('data-support-amount="300"');
    expect(html).toContain('data-support-amount="500"');
    expect(html).toContain('data-support-amount="1000"');
    expect(html).toContain('class="selected"');
    expect(html).toContain('min="50" max="10000"');
    expect(html).toContain('name="publicName"');
    expect(html).toContain('name="publicMessage"');
    expect(html).toContain('name="publicAmount"');
    expect(html).toContain('src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer');
    expect(html).toContain('data.turnstileToken = window.turnstile?.getResponse() || \'\';');
    expect(html).toContain('Choose a support amount. Payment is completed securely through ECPay.');
    expect(html).toContain('id="support-ecpay-description"');
    expect(() => new Function(extractScript(html))).not.toThrow();
  });

  it('renders Chinese support page with correct ECPay copy', () => {
    const html = renderSupportPage({ netTwd: 0, netUsdMinor: 0, contributionCount: 0, publicSupporters: [] }, { ecpay: true }, '', 'support-nonce', 'zh-Hant', 'site-key');
    expect(html).toContain('選擇支持金額，付款將透過綠界安全結帳。');
    expect(html).toContain('data-support-amount="100"');
    expect(html).toContain('class="selected"');
  });

  it('ECPay-only mode uses hidden provider input and script handles it with fallback selector', () => {
    const html = renderSupportPage({ netTwd: 0, netUsdMinor: 0, contributionCount: 0, publicSupporters: [] }, { ecpay: true }, '', 'support-nonce', 'en', 'site-key');
    const script = extractScript(html);
    expect(html).toContain('type="hidden" name="provider" value="ecpay"');
    expect(script).toContain('querySelector(\'input[name="provider"]:checked\')');
    expect(html).toContain('aria-pressed="true"');
    expect(script).toContain('setAttribute(\'aria-pressed\',');
    expect(script).toContain('supportAmountControls.hidden = !ecpay');
  });

  it('renders only escaped opt-in support attribution and a server-provided staircase history', () => {
    const html = renderSupportPage({
      netTwd: 300, contributionCount: 1,
      publicSupporters: [{ name: '<name>', message: 'thank you @\u200Beveryone', amount: 300 }],
      history: [{ day: '2026-09-01', total: 500 }, { day: '2026-09-02', total: 300 }],
    }, {}, 'pending', 'support-nonce', 'en');
    expect(html).toContain('Returning in this browser does not record support.');
    expect(html).toContain('&lt;name&gt;');
    expect(html).not.toContain('<name>');
    expect(html).toContain('<polyline points="0,8 300,8 300,43"');
    expect(html).toContain('NT$300');
  });

  it('support textarea does not hard-limit paste but exposes a 2000-code-point counter', () => {
    const html = renderSupportPage({ netTwd: 0, netUsdMinor: 0, contributionCount: 0, publicSupporters: [] }, { ecpay: true }, '', 'support-nonce', 'en', 'site-key');
    expect(html).not.toContain('id="support-message" maxlength="2000"');
    expect(html).not.toMatch(/<textarea[^>]*id="support-message"[^>]*maxlength=/);
    expect(html).toContain('id="support-message-counter"');
    expect(html).toContain('data-limit="2000"');
    expect(html).toContain('id="support-message-counter-error"');
    expect(html).toContain('"messageCounter":"{count} / {limit}"');
    expect(html).toContain('"messageOverLimit":"Public messages must be 2000 Unicode code points or fewer."');
  });

  it('preserves newlines in multiline supporter messages with HTML escaping', () => {
    const html = renderSupportPage({
      netTwd: 100, contributionCount: 1,
      publicSupporters: [{ name: 'Tester', message: 'line one\nline two\nline three', amount: 100 }],
    }, { ecpay: true }, '', 'support-nonce', 'en');
    expect(html).toContain('line one');
    expect(html).toContain('line two');
    expect(html).toContain('line three');
    expect(html).toContain('white-space: pre-wrap');
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('onerror=');
  });

  it('renders supporter message collapse button with aria-expanded and localized labels', () => {
    const html = renderSupportPage({
      netTwd: 100, contributionCount: 1,
      publicSupporters: [{ name: 'Tester', message: 'A very long message that should be collapsible since it has many characters and multiple lines of text to make the overflow detection work properly', amount: 100 }],
    }, { ecpay: true }, '', 'support-nonce', 'en');
    expect(html).toContain('supporter-expand');
    expect(html).toContain('aria-expanded');
    expect(html).toContain('Show more');
    expect(html).toContain('data-show-more="Show more"');
    expect(html).toContain('data-show-less="Show less"');
  });

  it('renders Chinese supporter message collapse with localized labels', () => {
    const html = renderSupportPage({
      netTwd: 100, contributionCount: 1,
      publicSupporters: [{ name: '測試者', message: '這是一條很長的留言應該可以被折疊因為它有很多字元', amount: 100 }],
    }, { ecpay: true }, '', 'support-nonce', 'zh-Hant');
    expect(html).toContain('顯示更多');
    expect(html).toContain('data-show-more="顯示更多"');
    expect(html).toContain('data-show-less="收合"');
  });

  it('uses singular "contribution" for count of 1 in English', () => {
    const html = renderSupportPage({
      netTwd: 100, contributionCount: 1, publicSupporters: [],
    }, { ecpay: true }, '', 'support-nonce', 'en');
    expect(html).toContain('1 contribution</small>');
    expect(html).not.toContain('1 contributions</small>');
  });

  it('uses plural "contributions" for count greater than 1 in English', () => {
    const html = renderSupportPage({
      netTwd: 300, contributionCount: 2, publicSupporters: [],
    }, { ecpay: true }, '', 'support-nonce', 'en');
    expect(html).toContain('2 contributions</small>');
  });

  it('zh-Hant contribution copy uses NT$ consistently', () => {
    const html = renderSupportPage({
      netTwd: 500, contributionCount: 1, publicSupporters: [],
    }, { ecpay: true }, '', 'support-nonce', 'zh-Hant');
    expect(html).toContain('NT$500');
  });

  it('support script includes sessionStorage draft save/restore for allowed fields', () => {
    const html = renderSupportPage({ netTwd: 0, netUsdMinor: 0, contributionCount: 0, publicSupporters: [] }, { ecpay: true }, '', 'support-nonce', 'en', 'site-key');
    const script = extractScript(html);
    expect(script).toContain('purelink.supportDraft.v1');
    expect(script).toContain('loadDraft');
    expect(script).toContain('saveDraft');
    expect(script).toContain('sessionStorage.setItem');
    expect(script).toContain('sessionStorage.getItem');
    expect(script).toContain('draft.amount');
    expect(script).toContain('draft.displayName');
    expect(script).toContain('draft.message');
    expect(script).toContain('draft.publicName');
    expect(script).toContain('draft.publicMessage');
    expect(script).toContain('draft.publicAmount');
  });

  it('support script does not persist Turnstile token or payment data in sessionStorage draft', () => {
    const html = renderSupportPage({ netTwd: 0, netUsdMinor: 0, contributionCount: 0, publicSupporters: [] }, { ecpay: true }, '', 'support-nonce', 'en', 'site-key');
    const script = extractScript(html);
    const draftSaveSection = script.match(/const saveDraft[\s\S]*?setItem\(/)?.[0] || '';
    expect(draftSaveSection).not.toContain('draft.turnstile');
    expect(draftSaveSection).not.toContain('draft.provider');
    expect(draftSaveSection).not.toContain('draft.checkoutUrl');
    expect(script).toContain('DRAFT_FIELDS');
  });

  it('ECPay-only hidden provider mode still works with new draft and collapse features', () => {
    const html = renderSupportPage({ netTwd: 0, netUsdMinor: 0, contributionCount: 0, publicSupporters: [] }, { ecpay: true }, '', 'support-nonce', 'en', 'site-key');
    expect(html).toContain('type="hidden" name="provider" value="ecpay"');
    expect(html).not.toMatch(/<textarea[^>]*id="support-message"[^>]*maxlength=/);
    expect(html).toContain('data-limit="2000"');
    expect(html).toContain('Show more');
  });

  it('submit handler does NOT remove draft from sessionStorage', () => {
    const html = renderSupportPage({ netTwd: 0, netUsdMinor: 0, contributionCount: 0, publicSupporters: [] }, { ecpay: true }, '', 'support-nonce', 'en', 'site-key');
    const script = extractScript(html);
    const submitHandler = script.match(/supportForm\.addEventListener\('submit'[\s\S]*?\}\);/)?.[0] || '';
    expect(submitHandler).not.toContain('removeItem');
    expect(submitHandler).toContain('event.preventDefault');
  });

  it('expand button aria-controls targets an existing message element ID', () => {
    const html = renderSupportPage({
      netTwd: 100, contributionCount: 1,
      publicSupporters: [{ name: 'Tester', message: 'This is a very long message that should be collapsible since it has many characters and multiple lines of text', amount: 100 }],
    }, { ecpay: true }, '', 'support-nonce', 'en');
    const expandMatch = html.match(/aria-controls="(supporter-msg-[^"]+)"/);
    expect(expandMatch).toBeTruthy();
    const targetId = expandMatch[1];
    expect(html).toContain(`id="${targetId}"`);
  });

  it('expand button is hidden by default in server-rendered HTML', () => {
    const html = renderSupportPage({
      netTwd: 100, contributionCount: 1,
      publicSupporters: [{ name: 'Tester', message: 'This is a very long message that should be collapsible since it has many characters and multiple lines of text', amount: 100 }],
    }, { ecpay: true }, '', 'support-nonce', 'en');
    const buttonMatch = html.match(/<button[^>]*class="supporter-expand"[^>]*>/);
    expect(buttonMatch).toBeTruthy();
    expect(buttonMatch[0]).toContain('hidden');
    expect(buttonMatch[0]).toContain('aria-expanded="false"');
  });

  it('expand button has correct aria-labels and data attributes for zh-Hant', () => {
    const html = renderSupportPage({
      netTwd: 100, contributionCount: 1,
      publicSupporters: [{ name: '測試者', message: '這是一條很長的留言應該可以被折疊因為它有很多字元', amount: 100 }],
    }, { ecpay: true }, '', 'support-nonce', 'zh-Hant');
    expect(html).toContain('data-show-more="顯示更多"');
    expect(html).toContain('data-show-less="收合"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('hidden');
  });

  it('click handler sets aria-expanded=true and Show less on first click', () => {
    const html = renderSupportPage({
      netTwd: 100, contributionCount: 1,
      publicSupporters: [{ name: 'Tester', message: 'This is a very long message that should be collapsible since it has many characters and multiple lines of text', amount: 100 }],
    }, { ecpay: true }, '', 'support-nonce', 'en');
    const script = extractScript(html);
    const clickHandler = script.match(/const button = msg\.parentElement\?\.querySelector\('\.supporter-expand'\);[\s\S]*?button\.addEventListener\('click'[\s\S]*?\}\);/)?.[0] || '';
    expect(clickHandler).toContain("aria-expanded', String(!isCollapsed)");
    expect(clickHandler).toContain('isCollapsed ? button.dataset.showLess : button.dataset.showMore');
    expect(clickHandler).toContain('classList.toggle(\'supporter-message-collapsed\', !isCollapsed)');
  });

  it('collapses long public messages to approximately four rendered lines', () => {
    const html = renderSupportPage({
      netTwd: 100, contributionCount: 1,
      publicSupporters: [{ name: 'Tester', message: 'A long supporter message that should overflow four rendered lines so the collapse threshold must shrink from the previous five-line value to four lines.', amount: 100 }],
    }, { ecpay: true }, '', 'support-nonce', 'en');
    const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
    expect(styleMatch).toBeTruthy();
    const css = styleMatch[1];
    const collapsedRule = css.match(/\.supporter-message-collapsed\s*\{([^}]*)\}/);
    expect(collapsedRule).toBeTruthy();
    expect(collapsedRule[1]).toMatch(/max-height:\s*6\.2em/);
    expect(collapsedRule[1]).toContain('overflow: hidden');
    const messageRule = css.match(/\.supporter-message\s*\{([^}]*)\}/);
    expect(messageRule).toBeTruthy();
    expect(messageRule[1]).toContain('line-height: 1.55');
    expect(collapsedRule[1]).not.toMatch(/max-height:\s*6\.25rem/);
  });

  it('supporter-message uses a display mode that lets max-height/overflow clip in real browsers', () => {
    const html = renderSupportPage({
      netTwd: 100, contributionCount: 1,
      publicSupporters: [{ name: 'Tester', message: 'Any long supporter message that needs the collapse logic to engage.', amount: 100 }],
    }, { ecpay: true }, '', 'support-nonce', 'en');
    const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
    expect(styleMatch).toBeTruthy();
    const css = styleMatch[1];
    const messageRule = css.match(/\.supporter-message\s*\{([^}]*)\}/);
    expect(messageRule).toBeTruthy();
    // An inline (non-replaced) span does not form a height-constrained box in
    // Safari and other engines, so max-height/overflow:hidden on the collapsed
    // variant cannot clip reliably. Force the message into a display mode that
    // produces a real box while still flowing inline with the surrounding
    // name / amount / expand button.
    expect(messageRule[1]).not.toMatch(/display:\s*inline\s*;/);
    const displayMatch = messageRule[1].match(/display:\s*([a-z-]+)/);
    expect(displayMatch).toBeTruthy();
    expect(['inline-block', 'block', 'inline-flex', 'flex', 'grid', 'inline-grid']).toContain(displayMatch[1]);
    // The collapsed rule still relies on max-height + overflow:hidden to clip.
    const collapsedRule = css.match(/\.supporter-message-collapsed\s*\{([^}]*)\}/);
    expect(collapsedRule).toBeTruthy();
    expect(collapsedRule[1]).toMatch(/max-height:\s*6\.2em/);
    expect(collapsedRule[1]).toContain('overflow: hidden');
    // Pre-wrap + word-break must remain so newlines and long words still wrap.
    expect(messageRule[1]).toContain('white-space: pre-wrap');
    expect(messageRule[1]).toContain('word-break: break-word');
  });

  it('exposes a Unicode code-point counter and an over-limit error node near the message field', () => {
    const html = renderSupportPage({ netTwd: 0, netUsdMinor: 0, contributionCount: 0, publicSupporters: [] }, { ecpay: true }, '', 'support-nonce', 'en', 'site-key');
    expect(html).toContain('id="support-message-counter"');
    expect(html).toContain('data-limit="2000"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('id="support-message-counter-error"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-live="assertive"');
    expect(html).toMatch(/aria-describedby="support-message-help support-message-counter support-message-counter-error"/);
    expect(html).not.toMatch(/<textarea[^>]*id="support-message"[^>]*maxlength=/);
  });

  it('renders the counter element styling in both normal and over-limit states', () => {
    const html = renderSupportPage({ netTwd: 0, netUsdMinor: 0, contributionCount: 0, publicSupporters: [] }, { ecpay: true }, '', 'support-nonce', 'en', 'site-key');
    const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
    expect(styleMatch).toBeTruthy();
    const css = styleMatch[1];
    expect(css).toMatch(/\.field-counter\s*\{/);
    expect(css).toMatch(/\.field-counter\.is-over\s*\{/);
    expect(css).toMatch(/\.field-counter-error\s*\{/);
  });

  it('support script counts Unicode code points via Array.from and updates aria-invalid', () => {
    const html = renderSupportPage({ netTwd: 0, netUsdMinor: 0, contributionCount: 0, publicSupporters: [] }, { ecpay: true }, '', 'support-nonce', 'en', 'site-key');
    const script = extractScript(html);
    expect(script).toContain('Array.from(String(value))');
    expect(script).toContain('supportMessage.setAttribute(\'aria-invalid\'');
    expect(script).toContain('isOverLimit(supportMessage.value, limit)');
    expect(script).toContain('formatCounter(supportMessages, supportMessage.value, limit)');
    expect(script).toContain('formatOverLimitMessage(supportMessages, supportMessage.value, limit)');
    expect(script).toContain('classList.toggle(\'is-over\', over)');
    expect(script).toContain('supportMessageCounter.dataset.state = over ? \'over\' : \'ok\'');
  });

  it('submit handler blocks client-side when publicMessage is opted in and message exceeds limit', () => {
    const html = renderSupportPage({ netTwd: 0, netUsdMinor: 0, contributionCount: 0, publicSupporters: [] }, { ecpay: true }, '', 'support-nonce', 'en', 'site-key');
    const script = extractScript(html);
    const submitHandler = script.match(/supportForm\.addEventListener\('submit'[\s\S]*?\}\);/)?.[0] || '';
    expect(submitHandler).toContain('publicMessageChecked = !!supportForm.querySelector(\'input[name="publicMessage"]:checked\')');
    expect(submitHandler).toContain('messageLength = countCodePoints(supportMessage?.value || \'\')');
    expect(submitHandler).toContain('publicMessageChecked && messageLength > MESSAGE_LIMIT');
    expect(submitHandler).toContain('supportMessages.messageOverLimit');
    expect(submitHandler).toContain('return;');
  });

  it('submit handler does not block client-side when publicMessage is not opted in (over-limit allowed)', () => {
    const html = renderSupportPage({ netTwd: 0, netUsdMinor: 0, contributionCount: 0, publicSupporters: [] }, { ecpay: true }, '', 'support-nonce', 'en', 'site-key');
    const script = extractScript(html);
    const submitHandler = script.match(/supportForm\.addEventListener\('submit'[\s\S]*?\}\);/)?.[0] || '';
    // The gate is `publicMessageChecked && messageLength > MESSAGE_LIMIT` — when
    // publicMessage is unchecked, publicMessageChecked is false and the gate
    // short-circuits, leaving the existing submit flow untouched.
    const gateLine = submitHandler.match(/if\s*\(\s*publicMessageChecked\s*&&\s*messageLength\s*>\s*MESSAGE_LIMIT\s*\)/);
    expect(gateLine).toBeTruthy();
    // No unconditional over-limit check that would always block submission.
    expect(submitHandler).not.toMatch(/if\s*\(\s*messageLength\s*>\s*MESSAGE_LIMIT\s*\)/);
    expect(submitHandler).not.toMatch(/if\s*\(\s*countCodePoints[^)]*>\s*MESSAGE_LIMIT\s*\)/);
  });

  it('draft restore path recalculates the counter after restoring the textarea value', () => {
    const html = renderSupportPage({ netTwd: 0, netUsdMinor: 0, contributionCount: 0, publicSupporters: [] }, { ecpay: true }, '', 'support-nonce', 'en', 'site-key');
    const script = extractScript(html);
    // updateMessageCounter must be invoked after loadDraft so that a restored
    // over-limit draft shows the correct counter and error state.
    const loadIdx = script.indexOf('loadDraft();');
    const updateIdx = script.indexOf('updateMessageCounter();');
    expect(loadIdx).toBeGreaterThanOrEqual(0);
    expect(updateIdx).toBeGreaterThanOrEqual(0);
    expect(updateIdx).toBeGreaterThan(loadIdx);
    expect(script).toContain('supportMessage.addEventListener(\'input\', updateMessageCounter)');
  });

  it('draft save path stores the full message including over-limit text and never stores Turnstile or payment data', () => {
    const html = renderSupportPage({ netTwd: 0, netUsdMinor: 0, contributionCount: 0, publicSupporters: [] }, { ecpay: true }, '', 'support-nonce', 'en', 'site-key');
    const script = extractScript(html);
    const startIdx = script.indexOf('const saveDraft = ');
    expect(startIdx).toBeGreaterThanOrEqual(0);
    const sliceEnd = script.indexOf('};', startIdx + 100);
    expect(sliceEnd).toBeGreaterThan(startIdx);
    const saveDraft = script.slice(startIdx, sliceEnd + 2);
    expect(saveDraft).toContain('draft.message = messageInput.value');
    expect(saveDraft).not.toContain('substring(');
    expect(saveDraft).not.toContain('.slice(0, 2000)');
    expect(saveDraft).not.toContain('.slice(0,2000)');
    expect(saveDraft).not.toContain('draft.turnstile');
    expect(saveDraft).not.toContain('draft.checkoutUrl');
    expect(saveDraft).not.toContain('draft.provider');
    expect(saveDraft).not.toContain('draft.action');
    expect(saveDraft).not.toContain('draft.fields');
  });

  it('counter, over-limit error, and submit-block strings are localized for en and zh-Hant', () => {
    const en = renderSupportPage({ netTwd: 0, netUsdMinor: 0, contributionCount: 0, publicSupporters: [] }, { ecpay: true }, '', 'support-nonce', 'en', 'site-key');
    const zh = renderSupportPage({ netTwd: 0, netUsdMinor: 0, contributionCount: 0, publicSupporters: [] }, { ecpay: true }, '', 'support-nonce', 'zh-Hant', 'site-key');
    expect(en).toContain('"messageCounter":"{count} / {limit}"');
    expect(en).toContain('"messageCounterOver":"Exceeds the 2000 character limit by {count}."');
    expect(en).toContain('"messageOverLimit":"Public messages must be 2000 Unicode code points or fewer."');
    expect(zh).toContain('"messageCounter":"{count} / {limit}"');
    expect(zh).toContain('"messageCounterOver":"已超過 2000 個字元上限 {count} 個字元。"');
    expect(zh).toContain('"messageOverLimit":"公開留言不得超過 2000 個 Unicode 碼點。"');
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

  it('renders the start page with correct content and SEO metadata in both locales', () => {
    const englishStart = renderStartPage('en');
    const chineseStart = renderStartPage('zh-Hant');
    expect(englishStart).toContain('<html lang="en">');
    expect(englishStart).toContain('Understand PureLink in 20 seconds');
    expect(englishStart).toContain('PureLink is a clean sharing tool.');
    expect(englishStart).toContain('No ads. No cross-site tracking.');
    expect(englishStart).toContain('Paste what you want to share');
    expect(englishStart).toContain('Start sharing →');
    expect(englishStart).toContain('<link rel="canonical" href="https://no-no.uk/en/start">');
    expect(englishStart).toContain('hreflang="zh-Hant"');
    expect(englishStart).toContain('hreflang="x-default"');
    expect(englishStart).toContain('<meta name="robots" content="index, follow">');

    expect(chineseStart).toContain('<html lang="zh-Hant">');
    expect(chineseStart).toContain('20 秒看懂 PureLink');
    expect(chineseStart).toContain('PureLink 是一個乾淨的分享工具。');
    expect(chineseStart).toContain('沒有廣告、不做跨站追蹤');
    expect(chineseStart).toContain('把你想分享的東西貼進來');
    expect(chineseStart).toContain('開始分享 →');
    expect(chineseStart).toContain('<link rel="canonical" href="https://no-no.uk/zh-Hant/start">');
    expect(chineseStart).not.toContain('First time here?');
    expect(chineseStart).not.toContain('Understand PureLink in 20 seconds');
  });

  it('does not leak cross-language content on the start page', () => {
    const englishStart = renderStartPage('en');
    const chineseStart = renderStartPage('zh-Hant');
    expect(englishStart).not.toContain('20 秒看懂 PureLink');
    expect(englishStart).not.toContain('第一次使用');
    expect(englishStart).not.toContain('把你想分享的');
    expect(englishStart).not.toContain('安心分享');
    expect(chineseStart).not.toContain('Understand PureLink in 20 seconds');
    expect(chineseStart).not.toContain('First time here?');
    expect(chineseStart).not.toContain('Paste what you want to share');
    expect(chineseStart).not.toContain('Just share');
  });

  it('shows the homepage onboarding link in both locales', () => {
    const englishHome = renderHomePage('test-nonce', '', false, '', null, 'en');
    const chineseHome = renderHomePage('test-nonce', '', false, '', null, 'zh-Hant');
    expect(englishHome).toContain('First time here? Understand PureLink in 20 seconds →');
    expect(englishHome).toContain('href="/en/start"');
    expect(chineseHome).toContain('第一次使用嗎？20 秒看懂 PureLink →');
    expect(chineseHome).toContain('href="/zh-Hant/start"');
  });

  it('shows mode microcopy for each creation mode on the homepage', () => {
    const englishHome = renderHomePage('test-nonce', '', false, '', null, 'en');
    const chineseHome = renderHomePage('test-nonce', '', false, '', null, 'zh-Hant');
    expect(englishHome).toContain('URL: Shorten a long URL and optionally preview it before opening');
    expect(englishHome).toContain('Formula: Paste LaTeX or Unicode math and share it as a link or PNG');
    expect(englishHome).toContain('Card: Turn short text, notes, or multiple links into a simple shareable card');
    expect(chineseHome).toContain('網址：把長網址縮短，分享前也能先預覽');
    expect(chineseHome).toContain('公式：貼 LaTeX / Unicode，分享成連結或 PNG');
    expect(chineseHome).toContain('小卡：把短文、留言或多個連結整理成一張卡');
  });

  it('mode microcopy container becomes visible when data-active is set', () => {
    const html = renderHomePage('test-nonce', '', false, '', null, 'en');
    expect(html).toContain('id="mode-microcopy"');
    expect(html).toContain('data-active="url"');
    const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
    expect(styleMatch).toBeTruthy();
    const css = styleMatch[1];
    expect(css).toContain('.mode-microcopy[data-active="url"]');
    const activeRuleMatch = css.match(/\.mode-microcopy\[data-active="url"\][^{]*\{([^}]*)\}/);
    expect(activeRuleMatch).toBeTruthy();
    expect(activeRuleMatch[1]).toContain('display: flex');
    expect(activeRuleMatch[1]).not.toContain('display: none');
    expect(css).toContain('.mode-microcopy span { display: none; }');
  });

  it('homepage does not leak cross-language mode microcopy', () => {
    const englishHome = renderHomePage('test-nonce', '', false, '', null, 'en');
    const chineseHome = renderHomePage('test-nonce', '', false, '', null, 'zh-Hant');
    expect(englishHome).not.toContain('網址：');
    expect(englishHome).not.toContain('公式：');
    expect(englishHome).not.toContain('小卡：');
    expect(chineseHome).not.toContain('URL: Shorten');
    expect(chineseHome).not.toContain('Formula: Paste');
    expect(chineseHome).not.toContain('Card: Turn');
  });
});

function extractScript(html) {
  const match = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/);
  if (!match) throw new Error('Inline script was not found.');
  return match[1];
}

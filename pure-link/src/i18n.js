export const SUPPORTED_LOCALES = Object.freeze(['zh-Hant', 'en']);
export const DEFAULT_LOCALE = 'en';
export const LOCALE_COOKIE = 'purelink_locale';

export function normalizeLocale(value) {
  const locale = String(value || '').trim().replace(/_/g, '-').toLowerCase();
  if (locale === 'zh-hant' || locale.startsWith('zh-hant-') || locale === 'zh-tw' || locale.startsWith('zh-tw-') || locale === 'zh-hk' || locale.startsWith('zh-hk-') || locale === 'zh-mo' || locale.startsWith('zh-mo-')) return 'zh-Hant';
  if (locale === 'en' || locale.startsWith('en-')) return 'en';
  return null;
}

export function localeFromAcceptLanguage(header) {
  const candidates = String(header || '').split(',').map((item, index) => {
    const [languageRange, ...parameters] = item.trim().split(';');
    const qualityParameter = parameters.find((parameter) => /^\s*q\s*=/i.test(parameter));
    const quality = qualityParameter ? Number(qualityParameter.split('=').slice(1).join('=').trim()) : 1;
    return {
      locale: normalizeLocale(languageRange),
      quality: Number.isFinite(quality) && quality >= 0 && quality <= 1 ? quality : 0,
      index,
    };
  }).filter(({ locale, quality }) => locale && quality > 0);

  candidates.sort((a, b) => b.quality - a.quality || a.index - b.index);
  return candidates[0]?.locale || null;
}

export function getCookieLocale(request) {
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]+)`));
  return normalizeLocale(match?.[1]);
}

export function resolveLocale(request, routeLocale = null) {
  return normalizeLocale(routeLocale) || getCookieLocale(request) || localeFromAcceptLanguage(request.headers.get('accept-language')) || DEFAULT_LOCALE;
}

// This header carries the active locale of a rendered page to its same-origin API
// request. It is deliberately limited to response copy, never access decisions.
export function resolveResponseLocale(request, routeLocale = null) {
  return normalizeLocale(routeLocale) || normalizeLocale(request.headers.get('x-purelink-locale')) || resolveLocale(request);
}

export function parseLocaleRoute(path) {
  const [prefix, ...rest] = String(path || '').split('/');
  if (!SUPPORTED_LOCALES.includes(prefix)) return null;
  return { locale: prefix, path: rest.join('/') };
}

export function localizedPath(locale, path = '') {
  const suffix = String(path || '').replace(/^\/+|\/+$/g, '');
  return `/${normalizeLocale(locale) || DEFAULT_LOCALE}/${suffix}`.replace(/\/$/, suffix ? '' : '/');
}

export function localeCookie(locale) {
  return `${LOCALE_COOKIE}=${normalizeLocale(locale) || DEFAULT_LOCALE}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax; Secure`;
}

export const messages = Object.freeze({
  en: {
    localeName: 'English', otherLocaleName: '繁體中文',
    nav: { account: 'My PureLinks', signIn: 'Sign in', language: 'Language', github: 'GitHub source' },
    billing: { packs: 'One-time AI formula draft packs', packNames: { small: 'Small', standard: 'Standard', large: 'Large' }, pack: '{name}: {credits} AI formula drafts — NT${price}', providerEcpay: 'Credit card / Apple Pay / TWQR and more', providerLemon: 'International payment — Lemon Squeezy', providerChoice: 'Choose a payment method', paymentEnabled: 'Available payment methods: {providers}.', paymentUnavailable: 'No payment rail is enabled in this deployment. No payment is accepted until it is enabled.', purchase: 'Sign in to purchase AI formula credits', buy: 'Buy this pack', opening: 'Opening a secure checkout…', failed: 'Checkout cannot be opened right now.', billingUnavailable: 'AI credit checkout is not available yet.', billingPackInvalid: 'This AI credit pack is not available.', billingProviderInvalid: 'Choose an available payment provider.', billingProviderUnavailable: 'The checkout provider could not be reached. Please try again.', billingProviderFailed: 'The checkout provider could not create a checkout. Please try again.', supportUnavailable: 'Support checkout is not available yet.', signInRequired: 'Sign in before purchasing AI formula credits.', checkoutRateLimited: 'Too many checkout attempts. Please wait a little before trying again.', returned: 'The payment flow has returned to PureLink.', returnedHelp: 'Only a verified provider notification adds credits. If they are not visible yet, wait a moment and refresh.', pending: 'Waiting for verified payment confirmation.', pendingHelp: 'Returning in this browser does not grant credits. PureLink will add them automatically after its verified callback or webhook arrives; refreshing or revisiting this page cannot duplicate credits.' },
    support: { title: 'Support PureLink', description: 'Optional, one-time support for PureLink’s open-source development, hosting, maintenance, and service costs.', eyebrow: 'SUPPORT PURELINK', intro: 'PureLink is free and open source. It has no ads, and support is entirely optional.', boundary: 'Support provides no AI credits, premium features, subscription, priority treatment, or other product benefit.', totals: 'Verified support received', contributions: '{count} contribution', contributionsPlural: '{count} contributions', supporters: 'Recent public supporters', limitedTotals: 'The USD figure includes only verified international contributions with a provider-reported USD total.', optionalName: 'Optional public display name', optionalNameHelp: 'Use a nickname, GitHub username, or name only if you choose to publish it. Your Google profile, billing name, and email are never published.', attribute: 'Publish this name after verified payment', optionalMessage: 'Optional public message', optionalMessageHelp: 'Up to 2000 Unicode code points. It is published only if you opt in below.', publicName: 'Publish this name after verified payment', publicMessage: 'Publish this message after verified payment', publicAmount: 'Publish this amount after verified payment', amount: 'Support amount (NT$)', customAmount: 'Enter an integer from NT$50 to NT$10,000.', amountPresets: 'Suggested amounts', ecpayMethod: 'Taiwan payment (NTD)', ecpayDescription: 'Choose a support amount. Payment is completed securely through ECPay.', lemonMethod: 'International payment', internationalAmount: 'International checkout chooses its amount securely.', pending: 'We are waiting for verified payment confirmation. Returning in this browser does not record support.', history: 'Support history', emptyHistory: 'Verified support will appear here after the first completed contribution.', button: 'Support PureLink', unavailable: 'Support checkout is not available yet.', opening: 'Opening secure support checkout…', failed: 'Support checkout cannot be opened right now.', thanks: 'Thank you for supporting PureLink. Support is recorded only after a verified provider callback.', aiCredits: 'AI credits', showMore: 'Show more', showLess: 'Show less', supportAmountInvalid: 'Enter a whole-number support amount from NT$50 to NT$10,000.', supportAttributionInvalid: 'Keep the public name within 60 characters and the public message within 2000 characters.', messageCounter: '{count} / {limit}', messageCounterOver: 'Exceeds the 2000 character limit by {count}.', messageOverLimit: 'Public messages must be 2000 Unicode code points or fewer.' },
    api: { invalidRequest: 'Invalid request origin.', customLinkTaken: 'This custom link is already in use.', uniqueLinkFailed: 'Could not allocate a unique link. Please try again.', nativeTokenInvalid: 'This native Card verification is no longer valid. Return to PureLink and try again.', nativeRequestInvalid: 'This endpoint accepts only Card content and a native creation token.', formulaSignIn: 'Sign in before using formula generation.', formulaUnavailable: 'Formula generation is unavailable right now. Please try again.', formulaProviderFailed: 'Cloudflare Workers AI could not complete this generation. This attempt still counts toward your daily allowance.', formulaInvalidDraft: 'AI did not return one safely editable LaTeX formula. Try a different description.', formulaDescriptionRequired: 'Describe the formula in one sentence first.', formulaDescriptionTooLong: 'Formula descriptions must be 500 characters or fewer.', reportNotFound: 'This PureLink could not be found.', reportInvalidSlug: 'Choose a valid PureLink to report.', reportInvalidCategory: 'Choose a reason for the report.', reportDetailsTooLong: 'Report details must be 1000 characters or fewer.' },
    nativeVerify: { title: 'Verify Card creation', description: 'Confirming this Card creation…', loading: 'Checking this creation…', failed: 'Verification could not finish. Return to PureLink and try again.', cancel: 'Return to PureLink' },
    page: {
      aiGuestLimit: '5 per day for regular accounts', aiLimit: '{count} per day', aiCreditsLink: 'AI credits, delivery and pricing', aiCreditsNav: 'AI credits', refundPolicyNav: 'Refund policy', policyNav: 'PureLink policies', quickOpenEyebrow: 'OPEN', createEyebrow: 'CREATE', readyEyebrow: 'READY', reportEyebrow: 'REPORT', managementEyebrow: 'PRIVATE MANAGEMENT', customShortcutsLabel: 'Custom formula shortcuts',
      shortcutCategories: 'Math shortcut categories', shortcutGroups: { common: 'Common math', algebra: 'Algebra', calculus: 'Calculus', matrices: 'Vectors and matrices', trigonometry: 'Trigonometry', symbols: 'Greek and symbols' }, insert: 'insert',
      previewDescription: 'Review a PureLink destination before continuing.', formulaDescription: 'A formula shared with PureLink.', cardTitle: 'A small card', cardDescription: 'A small card shared with PureLink.', copyText: 'Copy text',
      reportBefore: 'You are reporting ', reportAfter: '. A report does not automatically remove content; we review it against content, safety, and applicable rules.', reportChoose: 'Choose one', reportPhishing: 'Phishing or fraud', reportMalware: 'Malware or dangerous download', reportImpersonation: 'Impersonation', reportCopyright: 'Copyright or other rights issue', reportPrivacy: 'Personal data disclosed without consent', reportOther: 'Other', reportDetailsPlaceholder: 'Provide only the minimum information needed for review; do not include passwords, identity documents, or other sensitive data.', reportSending: 'Sending…', reportFailed: 'The report could not be sent.',
      signedIn: 'Signed in with Google', alreadyLinked: 'This PureLink is already saved to your account.', crossDevice: 'Manage across devices?', crossDeviceHelp: 'Your anonymous credential still works directly; you can also voluntarily link Google and sign in from another device later.', continueGoogle: 'Continue with Google', viewAccount: 'View my PureLinks',
      accountEyebrow: 'YOUR PURELINKS', creditsEyebrow: 'AI FORMULA CREDITS', greeting: 'Hello, {name}.', shareText: 'Just share.', labelSeparator: ': ', notFoundTitle: 'Not found', notFoundDescription: 'This PureLink could not be found.', notFoundHeading: 'This PureLink is not here.', notFoundBody: 'It may have been removed, expired, or typed incorrectly.', returnHome: 'Return home',
    },
    common: { url: 'URL', formula: 'Formula', card: 'Card', content: 'Content', view: 'View', manage: 'Manage', report: 'Report this PureLink', copy: 'Copied', copyFailed: 'Could not copy', share: 'Share' },
    start: {
      title: 'Understand PureLink in 20 seconds — PureLink',
      description: 'PureLink is a clean sharing tool. No ads, no cross-site tracking, and no account needed to share content.',
      onboardingLink: 'First time here? Understand PureLink in 20 seconds →',
      intro: 'PureLink is a clean sharing tool.',
      noAccount: 'No ads. No cross-site tracking. No account needed to share content.',
      youCanShare: 'You can share:',
      shareExamples: 'a long URL, LaTeX or Unicode formulas, a short text or note',
      pureLinkOrganizes: 'PureLink organizes it into:',
      organizeExamples: 'a short URL, a formula PNG with copyable source, a card with a shareable link and copyable text',
      examples: {
        url: 'Long URL → short URL',
        formula: 'Formula → share link / PNG / source',
        card: 'Short text or note → card / original text',
      },
      closing: 'Paste what you want to share, pick a format, and PureLink turns it into a clean shareable result.',
      cta: 'Start sharing →',
    },
    home: {
      title: 'PureLink — Privacy-friendly URL shortener and formula sharing', description: 'Shorten links without ads or needless tracking, share readable LaTeX formulas, and create quiet note cards with PureLink.', heroTitle: 'Just share.', heroLead: 'No ads. No needless data.', heroSummary: 'A privacy-friendly URL shortener for clean short links, readable LaTeX formula sharing, and quiet note cards.', onboardingLink: 'First time here? Understand PureLink in 20 seconds →', modeMicrocopy: { url: 'URL: Shorten a long URL and optionally preview it before opening', formula: 'Formula: Paste LaTeX or Unicode math and share it as a link or PNG', card: 'Card: Turn short text, notes, or multiple links into a simple shareable card' }, authExpiredTitle: 'Sign-in time expired.', authExpiredBody: 'For account protection, this one-time sign-in expired. Start again from My PureLinks.', authFailedTitle: 'Sign-in did not finish.', authFailedBody: 'No account session was created. Please try again.', authRetry: 'Sign in again',
      quickOpen: 'Quick open a PureLink', preview: 'Preview first', previewTitle: 'Review the full destination before continuing', quickLabel: 'A PureLink short URL or slug', quickPlaceholder: 'Paste no-no.uk/abc, or enter abc', go: 'Go →',
      create: 'What would you like to share?', contentTypes: 'Content type', urlHelp: 'We add HTTPS when needed, but never rewrite a URL invisibly.', formulaHelp: 'Use a formula alone, or mix prose and math with $...$ and $$...$$.', cardHelp: 'One short message, an optional signature, and three quiet themes.',
      formulaPlaceholder: 'For example: Energy is $E=mc^2$, or paste \\frac{a}{b}', cardPlaceholder: 'Write something you want to send with care…', formulaPreview: 'Live formula preview', formulaEmpty: 'Enter LaTeX or Unicode math and it will be typeset here.',
      mathShortcuts: 'Math shortcuts', mathShortcutsHelp: 'Each key inserts LaTeX only; the preview updates immediately.', customShortcuts: 'Custom formula shortcuts', localOnly: 'Stored only in this browser and never uploaded to PureLink. Up to 24.', buttonLabel: 'Button label', insertLatex: 'LaTeX to insert', add: 'Add',
      cleanTracking: 'Remove common tracking parameters', cleanTrackingHelp: 'Remove known parameters such as utm and fbclid before creating.', customRules: 'Custom cleanup rules for this link', customRulesHelp: 'Applied only to this creation and never saved to your browser or account; keep rules take priority.', removeAlso: 'Also remove (comma or space separated)', alwaysKeep: 'Always keep (comma or space separated)', affiliate: 'This may be a referral or affiliate link', affiliateHelp: 'Recipients will be told honestly on the + preview.',
      signature: 'Signature (optional)', quietThemes: 'Quiet themes', paper: 'Paper', mist: 'Mist', night: 'Night', customLink: 'Custom short link', customLinkPlaceholder: 'Leave blank to generate one securely', createButton: 'Create PureLink', privacy: 'No sign-up required. Creation only processes the minimum data needed to run the service and prevent abuse.',
      ready: 'Your PureLink is ready.', sharedUrl: 'Share URL (opens directly)', copyShare: 'Copy share link', saveCredential: 'Save your anonymous management credential', saveCredentialHelp: 'PureLink does not know who you are. If this browser and your backup are lost, we cannot restore deletion access.', copyManagement: 'Copy management address', downloadRecovery: 'Download recovery file', createAnother: 'Create another',
      footer: 'Content is supplied by its creator and does not represent PureLink’s views, recommendation, or security guarantee.', privacyLink: 'Privacy', termsLink: 'Terms & content', transparencyLink: 'Transparency',
      aiTitle: 'Generate a formula from one sentence', aiSignedIn: 'per day', aiAdmin: '(administrator)', aiPrivacy: 'Your description is sent to Cloudflare Workers AI. PureLink does not store descriptions or results. AI produces one editable LaTeX draft; review it before use.', aiLabel: 'Describe the formula in natural language', aiPlaceholder: 'For example: the mass–energy equivalence of mass m and energy E', aiGenerate: 'Generate draft', aiResult: 'AI formula draft', aiUse: 'Insert into formula input', aiSignedOut: 'Formula generation requires sign-in to limit daily use and control public-service costs. Anonymous creation, manual formula entry, and preview remain available without an account.', aiSignIn: 'Continue with Google', aiUnavailable: 'Formula generation is not available yet.',
      client: { invalidQuickOpen: 'Enter a complete no-no.uk short URL, or a 1–30 character slug.', suggestion: 'Suggested: {type} · click to use', creating: 'Creating…', createFailed: 'Could not create this PureLink. Please try again.', viewShared: 'View shared content', copied: 'Copied', copyFailed: 'Copy failed', browserCopy: 'Your browser did not allow automatic copying. Select the full URL above and copy it manually.', copiedUrl: 'Copied: {url}', copiedShare: 'Copied share link', copyShare: 'Copy share link', systemShare: 'The system share menu is open: {url}', shareFailed: 'Could not open the share menu; you can still copy the URL above.', previewUrl: 'View + preview', previewFormula: 'View formula', previewCard: 'View card', recoveryTitle: 'PureLink anonymous management and sharing information', recoveryType: 'Content type', recoveryContent: 'Shared/viewable content', recoveryPrivate: 'Private management address (do not share)', recoveryHelp: 'Share the content URL with recipients; keep the management address only for the creator. PureLink cannot restore a lost anonymous management credential.' },
    },
    content: { preview: 'Destination preview', connection: 'Connection', shared: 'Shared', referral: 'Referral', insecure: 'HTTP — not encrypted', affiliate: 'Creator says this may provide referral or affiliate benefit.', noAffiliate: 'Creator did not declare an affiliate relationship.', continue: 'Continue to destination', platformNotice: 'Content and external websites shared through PureLink are supplied by their creators and do not represent PureLink’s views, recommendation, endorsement, or security guarantee.', previewNotice: 'This preview is informational and is not a security certification.', addBrandFormula: 'Add “PURELINK · FORMULA” to PNG', addBrandCard: 'Add “PURELINK · CARD” to PNG', brandHelp: 'You can turn this off at any time; the shared content is unchanged.', copySource: 'Copy source', downloadPng: 'Download PNG', copyLink: 'Copy link', sourceInput: 'Show original input (LaTeX / Unicode)', report: 'Report this PureLink' },
    report: { title: 'Help keep this space clean.', intro: 'Reports do not collect your name or email. Please describe the concern only as much as is needed for review.', category: 'What is the concern?', details: 'Optional details', submit: 'Send report', received: 'Report received. Thank you for helping protect other people.' },
    manage: { title: 'Manage your PureLink', intro: 'An anonymous credential is itself management access; signing in is never required. Do not share this management address.', view: 'View shared content', checking: 'Checking management access…', accountAccess: 'You have management access through your Google account.', anonymousAccess: 'This device has anonymous management access.', missingCredential: 'No anonymous management credential was found. If you linked a Google account, sign in first; an unlinked anonymous credential cannot be recovered.', delete: 'Delete this PureLink', deleteAgain: 'Press again to delete permanently', deleted: 'This PureLink was deleted permanently.', deleteFailed: 'Deletion failed. Check the management address or account access.', claim: 'Add this PureLink to my account', claimed: 'Added to your account.', claimNext: 'You can manage it on any device by signing in with Google.', claimMissing: 'Open this page with the original anonymous management address before linking an account.', claimFailed: 'Account linking failed. Reopen the complete management address and try again.' },
    account: { title: 'My PureLinks', intro: 'Only content you deliberately linked, or created after signing in, appears here. Anonymous creation remains fully available without signing in.', empty: 'No PureLinks are linked to this account yet.', credits: 'Available purchased credits: {count}', creditsHelp: 'Your five free daily generations are used first; purchased credits are a one-time product, not a subscription.', buy: 'Buy AI formula credits', billingDisabled: 'Payment checkout is not enabled in this deployment; you will not be charged.', checkout: 'Opening a secure checkout…', checkoutFailed: 'Checkout cannot be opened right now.', returned: 'The payment flow has returned to PureLink.', returnedHelp: 'After payment is confirmed, the payment provider notification adds credits automatically. If they are not visible yet, wait a moment and refresh.', logOut: 'Log out', productInfo: 'Product and delivery details', refund: 'Refund policy' },
    client: { formula: { describe: 'Describe the formula in one sentence first.', generating: 'Generating an editable LaTeX draft…', generate: 'Generate draft', failed: 'Formula generation failed. Please try again.', inserted: 'Inserted into the formula input; review the preview before creating.', generated: 'Draft generated. {allowance}; it was not published automatically.', purchased: '{count} purchased credits remaining', free: '{count} free generations remaining today', customRequired: 'Enter both a button label and LaTeX.', customLimit: 'You can save up to {count} shortcuts.', customSaved: 'Saved only in this browser.', customRemoved: 'Removed from this browser.', customReadFailed: 'This browser cannot read custom shortcuts right now.', customWriteFailed: 'This browser does not allow custom shortcuts to be saved.', remove: 'Remove {label}' }, content: { copied: 'Copied', cannotCopy: 'Could not copy', copiedLink: 'Copied link', cannotShare: 'Could not share', working: 'Preparing…', saved: 'Saved', failed: 'Could not create PNG' } },
  },
  'zh-Hant': {
    localeName: '繁體中文', otherLocaleName: 'English',
    nav: { account: '我的 PureLink', signIn: '登入', language: '語言', github: 'GitHub 原始碼' },
    billing: { packs: '一次性 AI 公式草稿組合', packNames: { small: '小型方案', standard: '標準方案', large: '大型方案' }, pack: '{name}：{credits} 次 AI 公式草稿，NT${price}', providerEcpay: '信用卡 / Apple Pay / TWQR 等', providerLemon: '國際付款 — Lemon Squeezy', providerChoice: '選擇付款方式', paymentEnabled: '可用付款方式：{providers}。', paymentUnavailable: '此部署尚未啟用任何付款方式；啟用前不會收款。', purchase: '登入購買 AI 公式額度', buy: '購買此方案', opening: '正在開啟安全結帳頁…', failed: '目前無法開啟付款頁。', billingUnavailable: 'AI 額度結帳目前尚未開放。', billingPackInvalid: '這個 AI 額度方案目前無法購買。', billingProviderInvalid: '請選擇可用的付款供應商。', billingProviderUnavailable: '目前無法連線至付款供應商，請稍後再試。', billingProviderFailed: '付款供應商目前無法建立結帳頁，請稍後再試。', supportUnavailable: '支持結帳目前尚未開放。', signInRequired: '請先登入再購買 AI 公式額度。', checkoutRateLimited: '結帳嘗試次數過多，請稍候再試。', returned: '結帳流程已返回 PureLink。', returnedHelp: '只有付款供應商驗證通知才會加入額度；若尚未顯示，請稍候重新整理。', pending: '正在等待已驗證的付款確認。', pendingHelp: '瀏覽器返回本身不會加入額度。PureLink 會在收到已驗證的回呼或 webhook 後自動加入；重新整理或再次造訪這個頁面不會重複加入額度。' },
    support: { title: '支持 PureLink', description: '可選的一次性支持，用於 PureLink 的開源開發、主機、維護與服務成本。', eyebrow: '支持 PURELINK', intro: 'PureLink 免費且開源，沒有廣告；是否支持完全由你決定。', boundary: '支持不提供 AI 額度、進階功能、訂閱、優先處理或任何其他產品權益。', totals: '已驗證收到的支持', contributions: '{count} 筆支持', contributionsPlural: '{count} 筆支持', supporters: '近期公開支持者', limitedTotals: '美元金額只包含付款供應商提供可靠美元金額的已驗證國際支持。', optionalName: '選填公開顯示名稱', optionalNameHelp: '只有選擇公開時才填寫暱稱、GitHub 帳號或姓名。絕不會公開你的 Google 個人資料、帳單姓名或電子郵件。', attribute: '付款經驗證後公開這個名稱', optionalMessage: '選填公開留言', optionalMessageHelp: '最多 2000 個 Unicode 碼點；只有在下方明確同意後才會公開。', publicName: '付款經驗證後公開這個名稱', publicMessage: '付款經驗證後公開這段留言', publicAmount: '付款經驗證後公開這個金額', amount: '支持金額（NT$）', customAmount: '請輸入 NT$50 至 NT$10,000 的整數。', amountPresets: '建議金額', ecpayMethod: '台灣付款（NTD）', ecpayDescription: '選擇支持金額，付款將透過綠界安全結帳。', lemonMethod: '國際付款', internationalAmount: '國際結帳會在安全付款頁選擇金額。', pending: '正在等待已驗證的付款確認。瀏覽器返回本身不會記錄支持。', history: '支持歷程', emptyHistory: '第一筆已完成的驗證支持後，這裡會顯示歷程。', button: '支持 PureLink', unavailable: '支持結帳目前尚未開放。', opening: '正在開啟安全支持結帳…', failed: '目前無法開啟支持結帳。', thanks: '感謝你支持 PureLink。只有已驗證的付款供應商回呼才會記錄這筆支持。', aiCredits: 'AI 額度', showMore: '顯示更多', showLess: '收合', supportAmountInvalid: '請輸入 NT$50 至 NT$10,000 的整數支持金額。', supportAttributionInvalid: '公開名稱不得超過 60 個字元，公開留言不得超過 2000 個字元。', messageCounter: '{count} / {limit}', messageCounterOver: '已超過 2000 個字元上限 {count} 個字元。', messageOverLimit: '公開留言不得超過 2000 個 Unicode 碼點。' },
    api: { invalidRequest: '無效的請求來源。', customLinkTaken: '這個自訂短連結已被使用。', uniqueLinkFailed: '目前無法建立唯一短連結，請稍後再試。', nativeTokenInvalid: '這次原生小卡驗證已失效，請回到 PureLink 後重試。', nativeRequestInvalid: '這個端點只接受小卡內容與原生建立憑證。', formulaSignIn: '請先登入再使用公式生成。', formulaUnavailable: '公式生成目前無法使用，請稍後再試。', formulaProviderFailed: 'Cloudflare Workers AI 暫時沒有完成這次生成，這次嘗試仍計入每日額度。', formulaInvalidDraft: 'AI 沒有回傳可安全編輯的單一 LaTeX 公式，請換一種描述再試。', formulaDescriptionRequired: '請先用一句話描述要產生的公式。', formulaDescriptionTooLong: '公式描述不得超過 500 個字元。', reportNotFound: '找不到這個 PureLink。', reportInvalidSlug: '請選擇要回報的有效 PureLink。', reportInvalidCategory: '請選擇回報原因。', reportDetailsTooLong: '回報說明不得超過 1000 個字元。' },
    nativeVerify: { title: '確認建立小卡', description: '正在確認這次建立動作…', loading: '正在確認這次建立動作…', failed: '驗證沒有完成。請回到 PureLink 後重試。', cancel: '回到 PureLink' },
    page: {
      aiGuestLimit: '一般帳號每日 5 次', aiLimit: '每日 {count} 次', aiCreditsLink: 'AI 額度、交付與價格', aiCreditsNav: 'AI 額度', refundPolicyNav: '退款政策', policyNav: 'PureLink 政策', quickOpenEyebrow: '開啟', createEyebrow: '建立', readyEyebrow: '完成', reportEyebrow: '回報', managementEyebrow: '私人管理', customShortcutsLabel: '自訂公式快捷鍵',
      shortcutCategories: '數學快捷分類', shortcutGroups: { common: '常用數學', algebra: '代數', calculus: '微積分', matrices: '向量與矩陣', trigonometry: '三角函數', symbols: '希臘字母與符號' }, insert: '插入',
      previewDescription: '在前往前查看 PureLink 的完整目的地。', formulaDescription: '透過 PureLink 分享的公式。', cardTitle: '一張小卡', cardDescription: '透過 PureLink 分享的一張小卡。', copyText: '複製文字',
      reportBefore: '你正在回報 ', reportAfter: '。回報不會自動下架；我們會依內容、安全風險與適用規範進行審查。', reportChoose: '請選擇', reportPhishing: '釣魚或詐騙', reportMalware: '惡意程式或危險下載', reportImpersonation: '冒用身分', reportCopyright: '著作權或其他權利問題', reportPrivacy: '未經同意揭露個人資料', reportOther: '其他', reportDetailsPlaceholder: '請提供判斷所需的最少資訊；不要填入密碼、證件或其他敏感資料。', reportSending: '正在送出…', reportFailed: '回報未能送出。',
      signedIn: '已使用 Google 登入', alreadyLinked: '這個 PureLink 已保存在你的帳號。', crossDevice: '想跨裝置管理？', crossDeviceHelp: '匿名憑證仍可直接使用；也可以自願連結 Google 帳號，之後從其他裝置登入找回。', continueGoogle: '使用 Google 繼續', viewAccount: '查看我的 PureLink',
      accountEyebrow: '我的 PURELINK', creditsEyebrow: 'AI 公式額度', greeting: '你好，{name}。', shareText: '安心分享。', labelSeparator: '：', notFoundTitle: '找不到內容', notFoundDescription: '找不到這個 PureLink。', notFoundHeading: '這個 PureLink 不在這裡。', notFoundBody: '它可能已被刪除、過期，或輸入有誤。', returnHome: '返回首頁',
    },
    common: { url: '網址', formula: '公式', card: '小卡', content: '內容', view: '查看', manage: '管理', report: '回報這個 PureLink', copy: '已複製', copyFailed: '複製失敗', share: '分享' },
    start: {
      title: '20 秒看懂 PureLink — PureLink',
      description: 'PureLink 是一個乾淨的分享工具。沒有廣告、不做跨站追蹤，也不需要為了分享內容先建立帳號。',
      onboardingLink: '第一次使用嗎？20 秒看懂 PureLink →',
      intro: 'PureLink 是一個乾淨的分享工具。',
      noAccount: '沒有廣告、不做跨站追蹤，也不需要為了分享內容先建立帳號。',
      youCanShare: '你可以分享：',
      shareExamples: '一段很長的網址、LaTeX / Unicode 公式、一小段文字、筆記或留言',
      pureLinkOrganizes: 'PureLink 可以幫你整理成：',
      organizeExamples: '短網址、公式 PNG 圖片、可複製的公式原始碼、小卡分享連結、可複製的小卡原文',
      examples: {
        url: '長網址 → 短網址',
        formula: '公式 → 分享連結 / PNG / 原始碼',
        card: '短文或筆記 → 小卡 / 原文',
      },
      closing: '把你想分享的東西貼進來，選一種格式，PureLink 幫你整理成乾淨的分享結果。',
      cta: '開始分享 →',
    },
    home: {
      title: 'PureLink — 不追蹤的短網址、公式與小卡分享', description: '用 PureLink 建立不含廣告與不必要追蹤的短網址，分享清楚的 LaTeX 公式與安靜的小卡。', heroTitle: '安心分享。', heroLead: '沒有廣告，沒有不必要的資料。', heroSummary: '不追蹤的短網址、清楚的 LaTeX 公式分享，以及安靜的小卡。', onboardingLink: '第一次使用嗎？20 秒看懂 PureLink →', modeMicrocopy: { url: '網址：把長網址縮短，分享前也能先預覽', formula: '公式：貼 LaTeX / Unicode，分享成連結或 PNG', card: '小卡：把短文、留言或多個連結整理成一張卡' }, authExpiredTitle: '登入等待時間已結束。', authExpiredBody: '為了保護帳戶，這次的一次性登入已失效；請從「我的 PureLink」重新開始。', authFailedTitle: '這次登入沒有完成。', authFailedBody: '沒有建立任何帳戶工作階段，請重新嘗試。', authRetry: '重新登入',
      quickOpen: '快速開啟 PureLink', preview: '先預覽', previewTitle: '先查看完整目的地再決定是否前往', quickLabel: 'PureLink 短網址或後綴', quickPlaceholder: '貼上 no-no.uk/abc，或只輸入 abc', go: '前往 →',
      create: '你想分享什麼？', contentTypes: '內容類型', urlHelp: '我們會補上 HTTPS，但不會暗中改寫網址。', formulaHelp: '支援純公式，以及使用 $...$、$$...$$ 混合文字與公式。', cardHelp: '一段話、可選署名、三種安靜主題。', formulaPlaceholder: '例如：能量是 $E=mc^2$，或直接貼上 \\frac{a}{b}', cardPlaceholder: '寫下一段想好好送出去的話…', formulaPreview: '公式即時預覽', formulaEmpty: '輸入 LaTeX 或 Unicode 數學符號後，這裡會立即排版。', mathShortcuts: '數學快捷輸入', mathShortcutsHelp: '每個按鍵只插入 LaTeX；右側會立即預覽。', customShortcuts: '自訂公式快捷鍵', localOnly: '只儲存在這個瀏覽器，不會上傳到 PureLink。最多 24 個。', buttonLabel: '按鍵名稱', insertLatex: '插入的 LaTeX', add: '加入', cleanTracking: '清理常見追蹤參數', cleanTrackingHelp: '建立前移除 utm、fbclid 等已知參數。', customRules: '自訂本次清理規則', customRulesHelp: '只套用於這次建立，不會保存到瀏覽器或帳號；保留名單優先於移除名單。', removeAlso: '另外移除（逗號或空格分隔）', alwaysKeep: '始終保留（逗號或空格分隔）', affiliate: '這可能是推薦或分潤連結', affiliateHelp: '會在 + 預覽頁誠實告知接收者。', signature: '署名（選填）', quietThemes: '安靜主題', paper: '紙白', mist: '薄霧', night: '夜色', customLink: '自訂短連結', customLinkPlaceholder: '留白就會安全地自動產生', createButton: '建立 PureLink', privacy: '不用先註冊。建立時只處理維持服務與防止濫用所需的最低限度資料。', ready: '你的 PureLink 準備好了。', sharedUrl: '分享網址（可直接開啟）', copyShare: '複製分享連結', saveCredential: '請保存匿名管理憑證', saveCredentialHelp: 'PureLink 不知道你是誰。若這個瀏覽器與你的備份都遺失，我們無法替你找回刪除權限。', copyManagement: '複製管理地址', downloadRecovery: '下載恢復檔案', createAnother: '再建立一個', footer: '內容由建立者提供，不代表 PureLink 的立場、推薦或安全保證。', privacyLink: '隱私說明', termsLink: '使用與內容規範', transparencyLink: '透明度', aiTitle: '用一句話生成公式', aiSignedIn: '每日', aiAdmin: '（管理員）', aiPrivacy: '你的描述會傳送給 Cloudflare Workers AI；PureLink 不儲存描述或生成結果。AI 只會產生一個可編輯的 LaTeX 草稿，使用前請自行檢查。', aiLabel: '用自然語言描述公式', aiPlaceholder: '例如：質量 m 與能量 E 的質能等價關係', aiGenerate: '生成草稿', aiResult: 'AI 公式草稿', aiUse: '插入公式輸入框', aiSignedOut: '公式生成需要登入，以限制每人每日使用次數與控制公共服務成本。匿名建立、手動公式輸入與預覽仍完全免登入。', aiSignIn: '使用 Google 登入後繼續', aiUnavailable: '公式生成目前尚未開放。', client: { invalidQuickOpen: '請輸入 no-no.uk 的完整短網址，或 1–30 字元的短網址後綴。', suggestion: '建議：{type} · 點一下採用', creating: '正在建立…', createFailed: '建立失敗，請稍後再試。', viewShared: '查看分享內容', copied: '已複製', copyFailed: '複製失敗', browserCopy: '瀏覽器不允許自動複製，請手動選取上方完整網址。', copiedUrl: '已複製：{url}', copiedShare: '複製分享連結', copyShare: '複製分享連結', systemShare: '已開啟系統分享選單：{url}', shareFailed: '無法開啟分享選單，仍可複製上方網址。', previewUrl: '查看 + 預覽', previewFormula: '查看公式', previewCard: '查看小卡', recoveryTitle: 'PureLink 匿名管理與分享資訊', recoveryType: '內容類型', recoveryContent: '分享／查看內容', recoveryPrivate: '私人管理地址（請勿分享）', recoveryHelp: '分享連結可交給接收者；管理地址只留給建立者。PureLink 無法恢復遺失的匿名管理憑證。' },
    },
    content: { preview: '目的地預覽', connection: '連線', shared: '分享時間', referral: '推薦／分潤', insecure: 'HTTP — 未加密', affiliate: '建立者表示這可能提供推薦或分潤利益。', noAffiliate: '建立者未宣告推薦或分潤關係。', continue: '前往目的地', platformNotice: '透過 PureLink 分享的內容與外部網站由建立者提供，不代表 PureLink 的立場、推薦、背書或安全保證。', previewNotice: '此預覽僅供參考，不是安全認證。', addBrandFormula: 'PNG 加入「PURELINK · FORMULA」', addBrandCard: 'PNG 加入「PURELINK · CARD」', brandHelp: '可隨時取消；分享內容本身不受影響。', copySource: '複製原始內容', downloadPng: '下載 PNG', copyLink: '複製連結', sourceInput: '查看原始輸入（LaTeX／Unicode）', report: '回報這個 PureLink' },
    report: { title: '協助我們保持這裡乾淨。', intro: '回報不會收集你的姓名或電子郵件；請只提供審查所需的說明。', category: '發生什麼問題？', details: '補充說明（選填）', submit: '送出回報', received: '回報已收到。謝謝你協助保護其他使用者。' },
    manage: { title: '管理你的 PureLink', intro: '匿名憑證本身就是管理權限，不需要強迫登入；請不要把這個管理地址交給別人。', view: '查看分享內容', checking: '正在確認管理權限…', accountAccess: '已透過你的 Google 帳號取得管理權限。', anonymousAccess: '此裝置已有匿名管理權限。', missingCredential: '找不到匿名管理憑證。若曾連結 Google 帳號，請先登入；未連結的匿名憑證無法恢復。', delete: '刪除這個 PureLink', deleteAgain: '再按一次，永久刪除', deleted: '這個 PureLink 已永久刪除。', deleteFailed: '刪除失敗，請確認管理地址或帳號權限。', claim: '把這個 PureLink 加入我的帳號', claimed: '已加入你的帳號。', claimNext: '之後可在任何裝置使用 Google 登入管理。', claimMissing: '需要先用原本的匿名管理地址開啟此頁，才能綁定帳號。', claimFailed: '帳號連結失敗，請重新開啟完整管理地址後再試。' },
    account: { title: '我的 PureLink', intro: '只有你主動連結或登入後建立的內容會出現在這裡。匿名建立仍然可以完全不登入。', empty: '還沒有連結到這個帳號的 PureLink。', credits: '可用購買額度：{count} 次', creditsHelp: '每天 5 次免費生成會優先使用；購買額度是一次性商品，不是訂閱。', buy: '購買 AI 公式額度', billingDisabled: '此部署尚未啟用付款結帳；目前不會向你收費。', checkout: '正在建立安全結帳頁…', checkoutFailed: '目前無法開啟付款頁。', returned: '付款流程已返回 PureLink。', returnedHelp: '付款確認後，付款供應商通知會自動加入額度；若尚未顯示，請稍候再重新整理。', logOut: '登出', productInfo: '商品與交付說明', refund: '退款政策' },
    client: { formula: { describe: '請先用一句話描述要產生的公式。', generating: '正在產生可編輯的 LaTeX 草稿…', generate: '生成草稿', failed: '公式生成失敗，請稍後再試。', inserted: '已插入主公式輸入框；請在右側預覽檢查後再建立。', generated: '草稿已生成。{allowance}；不會自動發布。', purchased: '購買額度剩餘 {count} 次', free: '今日免費額度剩餘 {count} 次', customRequired: '請同時填寫按鍵名稱與 LaTeX。', customLimit: '最多保存 {count} 個快捷鍵。', customSaved: '已只在這個瀏覽器保存。', customRemoved: '已從這個瀏覽器移除。', customReadFailed: '這個瀏覽器目前無法讀取自訂快捷鍵。', customWriteFailed: '這個瀏覽器目前不允許保存自訂快捷鍵。', remove: '移除 {label}' }, content: { copied: '已複製', cannotCopy: '無法複製', copiedLink: '已複製連結', cannotShare: '無法分享', working: '正在製作…', saved: '已儲存', failed: '製作失敗' } },
  },
});

const homepageMessages = Object.freeze({
  en: Object.freeze({
    signaturePlaceholder: 'For example: Thinking of you',
    trackingRemovePlaceholder: 'For example: campaign_id, ref_*',
    trackingKeepPlaceholder: 'For example: utm_source, ref_code',
    customFormulaLabelPlaceholder: 'For example: Ĥ',
    customFormulaLatexPlaceholder: 'For example: \\hat{H}',
    accountSaved: 'Saved to your PureLink account',
    accountSavedHelp: 'This PureLink is linked to your signed-in account and can be managed from My PureLinks on other devices. The generated management credential remains an optional backup.',
    backupCredential: 'Optional backup management credential',
    backupCredentialHelp: 'Use this only as an additional recovery method. Your signed-in account remains the primary way to manage this PureLink.',
    copyBackupManagement: 'Copy backup management address',
    downloadBackupRecovery: 'Download backup recovery file',
  }),
  'zh-Hant': Object.freeze({
    signaturePlaceholder: '例如：一直惦記你的我',
    trackingRemovePlaceholder: '例如：campaign_id, ref_*',
    trackingKeepPlaceholder: '例如：utm_source, ref_code',
    customFormulaLabelPlaceholder: '例如：Ĥ',
    customFormulaLatexPlaceholder: '例如：\\hat{H}',
    accountSaved: '已儲存到你的 PureLink 帳號',
    accountSavedHelp: '這個 PureLink 已連結到你的登入帳號，也可以在其他裝置從「我的 PureLink」管理。產生的管理憑證仍可作為選用的備份。',
    backupCredential: '選用的備用管理憑證',
    backupCredentialHelp: '僅作為額外復原方式。你的登入帳號仍是管理這個 PureLink 的主要方式。',
    copyBackupManagement: '複製備用管理地址',
    downloadBackupRecovery: '下載備用復原檔案',
  }),
});

export function getMessages(locale) {
  const selected = normalizeLocale(locale) || DEFAULT_LOCALE;
  return { ...messages[selected], home: { ...messages[selected].home, ...homepageMessages[selected] } };
}

export function interpolate(message, values = {}) {
  return String(message).replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''));
}

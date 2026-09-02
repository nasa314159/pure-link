import { escapeHtml } from './http.js';
import { listAiCreditPacks } from './credit-products.js';
import { renderFormulaContent } from './formula.js';
import { getMessages, localizedPath } from './i18n.js';

const PLATFORM_NOTICE = '透過 PureLink 分享的內容與外部網站由建立者提供，不代表 PureLink 的立場、推薦、背書或安全保證。';

function clientMessagesMarkup(locale) {
  return `<script id="purelink-client-messages" type="application/json">${JSON.stringify(getMessages(locale).client).replaceAll('<', '\\u003c')}</script>`;
}

function localizedHref(locale, path = '') {
  return localizedPath(locale, path);
}

function creditPackSummary(locale) {
  const billing = getMessages(locale).billing;
  return listAiCreditPacks().map((pack) => billing.pack
    .replace('{name}', billing.packNames[pack.id])
    .replace('{credits}', Number(pack.credits).toLocaleString('en-US'))
    .replace('{price}', Number(pack.priceTwd).toLocaleString('en-US'))).join(locale === 'en' ? '. ' : '。');
}

function languageSwitcher(locale, page = '') {
  const messages = getMessages(locale);
  const choices = ['zh-Hant', 'en'].map((choice) => {
    const destination = String(page).startsWith('/') ? page : localizedHref(choice, page);
    return `<a href="${escapeHtml(destination)}"${choice === locale ? ' aria-current="true"' : ''}>${escapeHtml(getMessages(choice).localeName)}</a>`;
  }).join('');
  return `<nav class="language-switcher" aria-label="${escapeHtml(messages.nav.language)}">${choices}</nav>`;
}

const FORMULA_SHORTCUT_GROUPS = [
  {
    id: 'common',
    label: '★',
    ariaLabel: 'Common math',
    shortcuts: [
      ['□/□', '\\frac{}{}', 3, 'fraction template'], ['a/b', '\\frac{a}{b}', 0, 'example fraction'], ['x²', '^2', 0, 'square'], ['xⁿ', '^', 0, 'power'], ['√x', '\\sqrt{}', 1, 'square root'], ['∛x', '\\sqrt[3]{}', 1, 'cube root'], ['ⁿ√x', '\\sqrt[n]{}', 1, 'nth root'],
      ['Cₙʳ', 'C_{}^{}', 4, 'combination with subscript and superscript'], ['Pₙʳ', 'P_{}^{}', 4, 'permutation with subscript and superscript'],
      ['d⁄dx', '\\frac{d}{dx}', 0, 'derivative'], ['d²⁄dx²', '\\frac{d^2}{dx^2}', 0, 'second derivative'], ['∫', '\\int ', 0, 'indefinite integral'], ['∫ₐᵇ', '\\int_{}^{}', 4, 'definite integral'],
      ['Σ', '\\sum_{}^{}', 4, 'sum'], ['lim', '\\lim_{}', 1, 'limit'], ['[x;y]', '\\begin{bmatrix}  \\\\  \\end{bmatrix}', 16, 'column vector'], ['[a b;c d]', '\\begin{bmatrix}  &  \\\\  &  \\end{bmatrix}', 21, 'two by two matrix'],
    ],
  },
  {
    id: 'algebra',
    label: '√',
    ariaLabel: 'Algebra',
    shortcuts: [
      ['a⁄b', '\\frac{}{}', 3, 'fraction'], ['x²', '^2', 0, 'square'], ['xⁿ', '^', 0, 'power'], ['√x', '\\sqrt{}', 1, 'square root'], ['∛x', '\\sqrt[3]{}', 1, 'cube root'], ['ⁿ√x', '\\sqrt[n]{}', 1, 'nth root'],
      ['∞', '\\infty'], ['−∞', '-\\infty'], ['π', '\\pi'], ['e', 'e'], ['eˣ', 'e^', 0, 'exponential'], ['ln', '\\ln '],
      ['logₐ', '\\log_{}', 1, 'logarithm'], ['log₁₀', '\\log_{10}'], ['|x|', '\\left|  \\right|', 8, 'absolute value'], ['≤', '\\le'], ['≥', '\\ge'], ['≠', '\\ne'],
      ['±', '\\pm'], ['≈', '\\approx'], ['×', '\\times'], ['÷', '\\div'], ['→', '\\to'], ['↔', '\\leftrightarrow'],
    ],
  },
  {
    id: 'calculus',
    label: '∂ ∫',
    ariaLabel: 'Calculus',
    shortcuts: [
      ['d⁄dx', '\\frac{d}{dx}', 0, 'derivative'], ['d²⁄dx²', '\\frac{d^2}{dx^2}', 0, 'second derivative'], ['∂⁄∂x', '\\frac{\\partial}{\\partial x}', 0, 'partial derivative'], ['∂²⁄∂x²', '\\frac{\\partial^2}{\\partial x^2}', 0, 'second partial derivative'], ['∂²⁄∂x∂y', '\\frac{\\partial^2}{\\partial x\\partial y}', 0, 'mixed partial derivative'],
      ['∫', '\\int '], ['∬', '\\iint '], ['∭', '\\iiint '], ['∫ₐᵇ', '\\int_{}^{}', 4, 'definite integral'], ['∬ₐᵇ', '\\int_{}^{}\\int_{}^{}', 14, 'double definite integral'], ['∭ₐᵇ', '\\int_{}^{}\\int_{}^{}\\int_{}^{}', 24, 'triple definite integral'],
      ['Σ', '\\sum_{}^{}', 4, 'sum'], ['Π', '\\prod_{}^{}', 4, 'product'], ['lim', '\\lim_{}', 1, 'limit'], ['lim₋', '\\lim_{x\\to a^-}', 0, 'left limit'], ['lim₊', '\\lim_{x\\to a^+}', 0, 'right limit'], ['lim∞', '\\lim_{x\\to\\infty}', 0, 'limit at infinity'],
      ['∇', '\\nabla'], ['∂', '\\partial'], ['δ', '\\delta'], ['□', '\\Box', 0, 'd Alembert operator'], ['Ĥ', '\\hat{H}', 0, 'Hamiltonian operator'], ['ℒ', '\\mathcal{L}\\{  \\}', 3, 'Laplace transform'], ['ℒ⁻¹', '\\mathcal{L}^{-1}\\{  \\}', 3, 'inverse Laplace transform'], ['ℱ', '\\mathcal{F}\\{  \\}', 3, 'Fourier transform'], ['ℱ⁻¹', '\\mathcal{F}^{-1}\\{  \\}', 3, 'inverse Fourier transform'],
    ],
  },
  {
    id: 'matrices',
    label: '[ ]',
    ariaLabel: 'Vectors and matrices',
    shortcuts: [
      ['(x,y)', '( , )', 3, 'pair'], ['(x,y,z)', '( , , )', 5, 'triple'], ['(w,x,y,z)', '( , , , )', 7, 'quadruple'], ['[x;y]', '\\begin{bmatrix}  \\\\  \\end{bmatrix}', 16, 'two dimensional column vector'], ['[x;y;z]', '\\begin{bmatrix}  \\\\  \\\\  \\end{bmatrix}', 21, 'three dimensional column vector'],
      ['[x y]', '\\begin{bmatrix}  &  \\end{bmatrix}', 15, 'two dimensional row vector'], ['[x y z]', '\\begin{bmatrix}  &  &  \\end{bmatrix}', 18, 'three dimensional row vector'],
      ['[2×2]', '\\begin{bmatrix}  &  \\\\  &  \\end{bmatrix}', 21, 'two by two matrix'], ['[2×3]', '\\begin{bmatrix}  &  &  \\\\  &  &  \\end{bmatrix}', 27, 'two by three matrix'], ['[3×2]', '\\begin{bmatrix}  &  \\\\  &  \\\\  &  \\end{bmatrix}', 27, 'three by two matrix'], ['[3×3]', '\\begin{bmatrix}  &  &  \\\\  &  &  \\\\  &  &  \\end{bmatrix}', 36, 'three by three matrix'],
      ['|2×2|', '\\begin{vmatrix}  &  \\\\  &  \\end{vmatrix}', 21, 'determinant'], ['(2×2)', '\\begin{pmatrix}  &  \\\\  &  \\end{pmatrix}', 21, 'parenthesized matrix'], ['Iₙ', 'I_n', 0, 'identity matrix'], ['Aᵀ', '^{\\mathsf T}', 0, 'transpose'], ['A⁻¹', '^{-1}', 0, 'inverse matrix'],
    ],
  },
  {
    id: 'trigonometry',
    label: 'sin',
    ariaLabel: 'Trigonometry',
    shortcuts: [
      ['π', '\\pi'], ['°', '^{\\circ}', 0, 'degrees'], ['rad', '\\operatorname{rad}'], ['sin', '\\sin '], ['cos', '\\cos '], ['tan', '\\tan '], ['sec', '\\sec '], ['csc', '\\csc '], ['cot', '\\cot '],
      ['sin⁻¹', '\\sin^{-1}'], ['cos⁻¹', '\\cos^{-1}'], ['tan⁻¹', '\\tan^{-1}'], ['sinh', '\\sinh '], ['cosh', '\\cosh '], ['tanh', '\\tanh '], ['sech', '\\operatorname{sech} '], ['csch', '\\operatorname{csch} '], ['coth', '\\coth '],
      ['arsinh', '\\operatorname{arsinh} '], ['arcosh', '\\operatorname{arcosh} '], ['artanh', '\\operatorname{artanh} '],
    ],
  },
  {
    id: 'symbols',
    label: 'α ω',
    ariaLabel: 'Greek and symbols',
    shortcuts: [
      ['α', '\\alpha'], ['β', '\\beta'], ['γ', '\\gamma'], ['δ', '\\delta'], ['ε', '\\epsilon'], ['ζ', '\\zeta'], ['η', '\\eta'], ['θ', '\\theta'], ['κ', '\\kappa'], ['λ', '\\lambda'], ['μ', '\\mu'], ['ν', '\\nu'], ['ξ', '\\xi'], ['ρ', '\\rho'], ['σ', '\\sigma'], ['τ', '\\tau'], ['φ', '\\phi'], ['χ', '\\chi'], ['ψ', '\\psi'], ['ω', '\\omega'],
      ['Γ', '\\Gamma'], ['Δ', '\\Delta'], ['Θ', '\\Theta'], ['Λ', '\\Lambda'], ['Ξ', '\\Xi'], ['Π', '\\Pi'], ['Σ', '\\Sigma'], ['Φ', '\\Phi'], ['Ψ', '\\Psi'], ['Ω', '\\Omega'],
      ['∀', '\\forall'], ['∃', '\\exists'], ['∪', '\\cup'], ['∩', '\\cap'], ['∈', '\\in'], ['∉', '\\notin'], ['∅', '\\varnothing'], ['∴', '\\therefore'], ['∵', '\\because'], ['∥', '\\parallel'], ['⊥', '\\perp'], ['≅', '\\cong'], ['∝', '\\propto'], ['⊆', '\\subseteq'], ['⊇', '\\supseteq'], ['⊕', '\\oplus'], ['⊗', '\\otimes'],
    ],
  },
];

function renderFormulaShortcutPalette(m) {
  const tabs = FORMULA_SHORTCUT_GROUPS.map((group, index) => `<button type="button" role="tab" id="formula-tab-${group.id}" aria-label="${escapeHtml(m.page.shortcutGroups[group.id])}" aria-controls="formula-panel-${group.id}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}" data-formula-category="${group.id}">${escapeHtml(group.label)}</button>`).join('');
  const panels = FORMULA_SHORTCUT_GROUPS.map((group, index) => {
    const buttons = group.shortcuts.map(([label, insert, cursorBack = 0]) => `<button type="button" title="${escapeHtml(insert)}" aria-label="${escapeHtml(label)}; ${escapeHtml(m.page.insert)} ${escapeHtml(insert)}" data-formula-insert="${escapeHtml(insert)}"${cursorBack ? ` data-cursor-back="${cursorBack}"` : ''}>${escapeHtml(label)}</button>`).join('');
    return `<div class="symbol-group" role="tabpanel" id="formula-panel-${group.id}" aria-labelledby="formula-tab-${group.id}" data-formula-panel="${group.id}"${index === 0 ? '' : ' hidden'}>${buttons}</div>`;
  }).join('');
  return `<div class="formula-category-tabs" role="tablist" aria-label="${escapeHtml(m.page.shortcutCategories)}">${tabs}</div><div class="symbol-groups">${panels}</div>`;
}

export function renderHomePage(nonce, turnstileSiteKey = '', googleAuthConfigured = false, authStatus = '', user = null, locale = 'zh-Hant') {
  const m = getMessages(locale);
  const recoveryCopy = user
    ? { title: m.home.accountSaved, help: m.home.accountSavedHelp, backupTitle: m.home.backupCredential, backupHelp: m.home.backupCredentialHelp, copy: m.home.copyBackupManagement, download: m.home.downloadBackupRecovery }
    : { title: m.home.saveCredential, help: m.home.saveCredentialHelp, backupTitle: '', backupHelp: '', copy: m.home.copyManagement, download: m.home.downloadRecovery };
  const turnstileWidget = turnstileSiteKey
    ? `<div class="turnstile-wrap"><div class="cf-turnstile" data-sitekey="${escapeHtml(turnstileSiteKey)}" data-action="create"></div></div>`
    : '';
  const authNotice = authStatus === 'expired'
    ? `<div class="auth-notice" role="status"><strong>${m.home.authExpiredTitle}</strong><span>${m.home.authExpiredBody}</span><a href="${localizedHref(locale, 'account')}">${m.home.authRetry}</a></div>`
    : authStatus
      ? `<div class="auth-notice" role="status"><strong>${m.home.authFailedTitle}</strong><span>${m.home.authFailedBody}</span><a href="${localizedHref(locale, 'account')}">${m.home.authRetry}</a></div>`
      : '';
  const accountEntry = googleAuthConfigured
    ? `<nav class="account-entry" aria-label="${escapeHtml(m.nav.account)}"><a href="${user ? localizedHref(locale, 'account') : `/auth/google?returnTo=${encodeURIComponent(localizedHref(locale))}`}"${user ? '' : ` aria-label="${escapeHtml(m.nav.signIn)}"`}>${user ? m.nav.account : m.nav.signIn}</a></nav>`
    : '';
  const formulaAiLimit = Number(user?.is_admin) === 1 ? 100 : 5;
  const formulaAiPanel = user
    ? `<details class="formula-ai" id="formula-ai">
        <summary>✦ ${m.home.aiTitle} <span>${m.page.aiLimit.replace('{count}', formulaAiLimit)} ${formulaAiLimit === 100 ? m.home.aiAdmin : ''}</span></summary>
        <p>${m.home.aiPrivacy}</p>
        <p><a href="${localizedHref(locale, 'ai-credits')}">${m.page.aiCreditsLink}</a></p>
        <label class="field-label" for="formula-ai-description">${m.home.aiLabel}</label>
        <div class="formula-ai-compose">
          <textarea id="formula-ai-description" maxlength="500" rows="3" placeholder="${escapeHtml(m.home.aiPlaceholder)}"></textarea>
          <button type="button" id="generate-formula-ai">${m.home.aiGenerate}</button>
        </div>
        <p class="formula-ai-status" id="formula-ai-status" role="status" hidden></p>
        <section class="formula-ai-result" id="formula-ai-result" aria-label="${escapeHtml(m.home.aiResult)}" hidden>
          <div id="formula-ai-preview" class="formula-ai-preview"></div>
          <code id="formula-ai-source"></code>
          <button type="button" class="secondary-button" id="use-formula-ai">${m.home.aiUse}</button>
        </section>
      </details>`
    : `<details class="formula-ai" id="formula-ai">
        <summary>✦ ${m.home.aiTitle} <span>${m.page.aiGuestLimit}</span></summary>
        <p>${m.home.aiSignedOut}</p>
        <p><a href="${localizedHref(locale, 'ai-credits')}">${m.page.aiCreditsLink}</a></p>
        ${googleAuthConfigured ? `<a class="google-link" href="/auth/google?returnTo=${encodeURIComponent(`${localizedHref(locale)}#formula-ai`)}">${m.home.aiSignIn}</a>` : `<p>${m.home.aiUnavailable}</p>`}
      </details>`;
  return documentShell({
    title: m.home.title,
    description: m.home.description,
    robots: 'index, follow',
    canonicalPath: localizedHref(locale),
    locale,
    body: `
      ${accountEntry}
      <main class="home creator-home">
        <header class="hero">
          <p class="eyebrow">PURELINK</p>
          <h1>${m.home.heroTitle}</h1>
          <p class="lede">${m.home.heroLead}</p>
          <p class="hero-summary">${m.home.heroSummary}</p>
          <a class="onboarding-link" href="${localizedHref(locale, 'start')}">${m.home.onboardingLink}</a>
        </header>

        <section class="quick-open" aria-labelledby="quick-open-title">
          <div class="quick-open-heading">
            <p class="eyebrow">${m.page.quickOpenEyebrow}</p>
          <h2 id="quick-open-title">${m.home.quickOpen}</h2>
          </div>
          <form class="quick-open-form" id="quick-open-form" novalidate>
            <label class="quick-preview-toggle" title="${escapeHtml(m.home.previewTitle)}">
              <input type="checkbox" id="quick-open-preview">
              <span aria-hidden="true">+</span>
              <small>${m.home.preview}</small>
            </label>
            <label class="visually-hidden" for="quick-open-input">${m.home.quickLabel}</label>
            <input id="quick-open-input" maxlength="128" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${escapeHtml(m.home.quickPlaceholder)}">
            <button type="submit" aria-label="${escapeHtml(m.home.quickOpen)}">${m.home.go}</button>
          </form>
          <p class="quick-open-status" id="quick-open-status" role="alert" hidden></p>
        </section>

        ${authNotice}

        <section class="creator-panel panel" id="creator-panel" aria-labelledby="creator-title">
          <div class="creator-heading">
            <div>
              <p class="eyebrow">${m.page.createEyebrow}</p>
              <h2 id="creator-title">${m.home.create}</h2>
            </div>
            <button class="suggestion" id="suggestion" type="button" hidden></button>
          </div>

          <form id="create-form" novalidate>
            <input type="hidden" id="content-type" name="contentType" value="url">
            <div class="type-tabs" role="group" aria-label="${escapeHtml(m.home.contentTypes)}">
              <button class="type-tab active" type="button" data-type="url" aria-pressed="true"><span>↗</span>${m.common.url}</button>
              <button class="type-tab" type="button" data-type="formula" aria-pressed="false"><span>∑</span>${m.common.formula}</button>
              <button class="type-tab" type="button" data-type="card" aria-pressed="false"><span>✦</span>${m.common.card}</button>
            </div>
            <div class="mode-microcopy" id="mode-microcopy">
              <span class="microcopy-url">${m.home.modeMicrocopy.url}</span>
              <span class="microcopy-formula">${m.home.modeMicrocopy.formula}</span>
              <span class="microcopy-card">${m.home.modeMicrocopy.card}</span>
            </div>

            <div class="content-workspace" id="content-workspace">
              <div class="content-input-pane">
                <label class="field-label" for="content">${m.common.content}</label>
                <textarea id="content" name="content" maxlength="4096" placeholder="example.com" required></textarea>
                <div class="field-meta"><span id="content-help">${m.home.urlHelp}</span><span id="character-count">0 / 4096</span></div>
              </div>
              <aside class="formula-preview" id="formula-live-preview" aria-label="${escapeHtml(m.home.formulaPreview)}" hidden>
                <span class="preview-label">${m.home.formulaPreview}</span>
                <p id="formula-preview-empty">${m.home.formulaEmpty}</p>
                <div id="formula-preview-rendered" class="formula-preview-rendered" hidden></div>
              </aside>
            </div>

            <div class="formula-tools" id="formula-tools" hidden>
              <div class="formula-tool-heading"><strong>${m.home.mathShortcuts}</strong><span>${m.home.mathShortcutsHelp}</span></div>
              ${formulaAiPanel}
              ${renderFormulaShortcutPalette(m)}
              <details class="custom-formula-shortcuts">
                <summary>＋ ${m.home.customShortcuts}</summary>
                <p>${m.home.localOnly}</p>
                <div class="custom-formula-fields">
                  <label><span>${m.home.buttonLabel}</span><input id="custom-formula-label" maxlength="12" placeholder="${escapeHtml(m.home.customFormulaLabelPlaceholder)}"></label>
                  <label><span>${m.home.insertLatex}</span><input id="custom-formula-latex" maxlength="200" placeholder="${escapeHtml(m.home.customFormulaLatexPlaceholder)}"></label>
                  <button type="button" id="add-custom-formula">${m.home.add}</button>
                </div>
                <p class="custom-formula-status" id="custom-formula-status" role="status" hidden></p>
                <div class="custom-formula-list" id="custom-formula-list" aria-label="${escapeHtml(m.page.customShortcutsLabel)}"></div>
              </details>
            </div>

            <div class="conditional-options" id="url-options">
              <label class="check-row"><input type="checkbox" name="cleanTracking" value="true"><span><strong>${m.home.cleanTracking}</strong><small>${m.home.cleanTrackingHelp}</small></span></label>
              <details class="tracking-rules">
                <summary>${m.home.customRules}</summary>
                <p>${m.home.customRulesHelp}</p>
                <label class="field-label" for="tracking-remove">${m.home.removeAlso}</label>
                <input id="tracking-remove" name="trackingRemove" maxlength="512" placeholder="${escapeHtml(m.home.trackingRemovePlaceholder)}">
                <label class="field-label" for="tracking-keep">${m.home.alwaysKeep}</label>
                <input id="tracking-keep" name="trackingKeep" maxlength="512" placeholder="${escapeHtml(m.home.trackingKeepPlaceholder)}">
              </details>
              <label class="check-row"><input type="checkbox" name="isAffiliate" value="true"><span><strong>${m.home.affiliate}</strong><small>${m.home.affiliateHelp}</small></span></label>
            </div>

            <div class="conditional-options" id="card-options" hidden>
              <label class="field-label" for="signature">${m.home.signature}</label>
              <input id="signature" name="signature" maxlength="60" placeholder="${escapeHtml(m.home.signaturePlaceholder)}">
              <fieldset class="theme-picker">
                <legend>${m.home.quietThemes}</legend>
                <label><input type="radio" name="theme" value="paper" checked><span class="theme-swatch paper-swatch">${m.home.paper}</span></label>
                <label><input type="radio" name="theme" value="mist"><span class="theme-swatch mist-swatch">${m.home.mist}</span></label>
                <label><input type="radio" name="theme" value="night"><span class="theme-swatch night-swatch">${m.home.night}</span></label>
              </fieldset>
            </div>

            <details class="advanced-options">
              <summary>${m.home.customLink}</summary>
              <label class="field-label" for="slug">no-no.uk/</label>
              <input id="slug" name="slug" maxlength="30" pattern="[A-Za-z0-9_-]+" placeholder="${escapeHtml(m.home.customLinkPlaceholder)}">
            </details>

            <p class="form-error" id="form-error" role="alert" hidden></p>
            ${turnstileWidget}
            <button class="create-button" id="create-button" type="submit">${m.home.createButton}</button>
            <p class="privacy-note">${m.home.privacy}</p>
          </form>

          <section class="result-panel" id="result-panel" aria-live="polite" hidden>
            <p class="eyebrow">${m.page.readyEyebrow}</p>
            <h2>${m.home.ready}</h2>
            <span class="result-label">${m.home.sharedUrl}</span>
            <a class="result-url" id="result-url" href=""></a>
            <div class="result-actions">
              <button class="create-button" type="button" data-copy-target="result-url">${m.home.copyShare}</button>
              <a class="secondary-link" id="preview-link" href="" hidden></a>
              <button class="secondary-button" id="share-result" type="button" hidden>${m.common.share}</button>
            </div>
            <p class="copy-status" id="result-status" role="status"></p>
            <div class="recovery-box">
              <strong id="recovery-title">${recoveryCopy.title}</strong>
              <p id="recovery-help">${recoveryCopy.help}</p>
              <div id="recovery-backup"${recoveryCopy.backupTitle ? '' : ' hidden'}>
                <strong>${recoveryCopy.backupTitle}</strong>
                <p>${recoveryCopy.backupHelp}</p>
              </div>
              <div class="recovery-actions">
                <button class="secondary-button" id="copy-management" type="button">${recoveryCopy.copy}</button>
                <button class="secondary-button" id="download-recovery" type="button">${recoveryCopy.download}</button>
              </div>
            </div>
            <button class="quiet-button" id="create-another" type="button">${m.home.createAnother}</button>
          </section>
        </section>

        <footer class="home-footer">
          <p>${m.home.footer}</p>
          <nav aria-label="${escapeHtml(m.nav.language)}">${googleAuthConfigured ? `<a href="${localizedHref(locale, 'account')}">${m.nav.account}</a>` : ''}<a href="${localizedHref(locale, 'ai-credits')}">${m.page.aiCreditsNav}</a><a href="${localizedHref(locale, 'support')}">${m.support.button}</a><a href="${localizedHref(locale, 'refund-policy')}">${m.page.refundPolicyNav}</a><a href="${localizedHref(locale, 'privacy')}">${m.home.privacyLink}</a><a href="${localizedHref(locale, 'terms')}">${m.home.termsLink}</a><a href="${localizedHref(locale, 'transparency')}">${m.home.transparencyLink}</a><a href="https://github.com/nasa314159/pure-link" rel="noreferrer">${m.nav.github}</a></nav>
          ${languageSwitcher(locale)}
        </footer>
      </main>
    `,
    script: `
      const messages = ${JSON.stringify(m.home.client).replaceAll('<', '\\u003c')};
      const typeNames = ${JSON.stringify({ url: m.common.url, formula: m.common.formula, card: m.common.card }).replaceAll('<', '\\u003c')};
      const form = document.getElementById('create-form');
      const quickOpenForm = document.getElementById('quick-open-form');
      const quickOpenInput = document.getElementById('quick-open-input');
      const quickOpenPreview = document.getElementById('quick-open-preview');
      const quickOpenStatus = document.getElementById('quick-open-status');
      const content = document.getElementById('content');
      const contentType = document.getElementById('content-type');
      const contentHelp = document.getElementById('content-help');
      const characterCount = document.getElementById('character-count');
      const suggestion = document.getElementById('suggestion');
      const urlOptions = document.getElementById('url-options');
      const cardOptions = document.getElementById('card-options');
      const formulaTools = document.getElementById('formula-tools');
      const contentWorkspace = document.getElementById('content-workspace');
      const errorBox = document.getElementById('form-error');
      const submitButton = document.getElementById('create-button');
      const resultPanel = document.getElementById('result-panel');
      const resultStatus = document.getElementById('result-status');
      const shareResult = document.getElementById('share-result');
      let latestResult = null;
      const recoveryMessages = {
        anonymous: { title: ${JSON.stringify(m.home.saveCredential)}, help: ${JSON.stringify(m.home.saveCredentialHelp)}, backupTitle: '', backupHelp: '', copy: ${JSON.stringify(m.home.copyManagement)}, download: ${JSON.stringify(m.home.downloadRecovery)} },
        account: { title: ${JSON.stringify(m.home.accountSaved)}, help: ${JSON.stringify(m.home.accountSavedHelp)}, backupTitle: ${JSON.stringify(m.home.backupCredential)}, backupHelp: ${JSON.stringify(m.home.backupCredentialHelp)}, copy: ${JSON.stringify(m.home.copyBackupManagement)}, download: ${JSON.stringify(m.home.downloadBackupRecovery)} },
      };

      quickOpenForm.addEventListener('submit', (event) => {
        event.preventDefault();
        quickOpenStatus.hidden = true;
        let candidate = quickOpenInput.value.trim();
        let preview = quickOpenPreview.checked;
        try {
          if (/^https?:\\/\\//i.test(candidate)) {
            const pasted = new URL(candidate);
            if (pasted.hostname.toLowerCase() !== location.hostname.toLowerCase() || pasted.search || pasted.hash) throw new Error();
            candidate = pasted.pathname;
          } else {
            candidate = candidate.replace(/^(?:www\\.)?no-no\\.uk\\//i, '');
          }
          candidate = candidate.replace(/^\\/+|\\/+$/g, '');
          if (candidate.endsWith('+')) {
            preview = true;
            candidate = candidate.slice(0, -1);
          }
          if (!/^[A-Za-z0-9_-]{1,30}$/.test(candidate)) throw new Error();
          location.assign('/' + candidate + (preview ? '+' : ''));
        } catch {
          quickOpenStatus.textContent = messages.invalidQuickOpen;
          quickOpenStatus.hidden = false;
          quickOpenInput.focus();
        }
      });

      const typeCopy = {
        url: { placeholder: 'example.com', help: ${JSON.stringify(m.home.urlHelp)}, limit: 4096 },
        formula: { placeholder: ${JSON.stringify(m.home.formulaPlaceholder)}, help: ${JSON.stringify(m.home.formulaHelp)}, limit: 5000 },
        card: { placeholder: ${JSON.stringify(m.home.cardPlaceholder)}, help: ${JSON.stringify(m.home.cardHelp)}, limit: 1000 },
      };

      function selectType(type) {
        contentType.value = type;
        document.querySelectorAll('.type-tab').forEach((tab) => {
          const active = tab.dataset.type === type;
          tab.classList.toggle('active', active);
          tab.setAttribute('aria-pressed', String(active));
        });
        const copy = typeCopy[type];
        content.placeholder = copy.placeholder;
        content.maxLength = copy.limit;
        contentHelp.textContent = copy.help;
        urlOptions.hidden = type !== 'url';
        cardOptions.hidden = type !== 'card';
        formulaTools.hidden = type !== 'formula';
        contentWorkspace.classList.toggle('formula-mode', type === 'formula');
        const microcopy = document.getElementById('mode-microcopy');
        if (microcopy) microcopy.dataset.active = type;
        updateCount();
        updateSuggestion();
        document.dispatchEvent(new CustomEvent('purelink:typechange', { detail: { type } }));
      }

      function suggestedType(value) {
        const trimmed = value.trim();
        if (!trimmed) return null;
        if (/^(?:https?:\\/\\/)?[^\\s/]+\\.[^\\s/]{2,}(?:\\/[^\\s]*)?$/i.test(trimmed)) return 'url';
        if (/\\\\(?:begin|end|frac|sqrt|sum|int|lim|left|right|text|mathrm|mathbf|mathbb|partial|nabla)\\b|[_^](?:\\{[^}]*\\}|[A-Za-z0-9])|[∂∫∑√∞≈≠≤≥±×÷∇]|\\$[^$]+\\$/.test(trimmed)) return 'formula';
        return 'card';
      }

      function updateSuggestion() {
        const type = suggestedType(content.value);
        if (!type || type === contentType.value) {
          suggestion.hidden = true;
          return;
        }
        suggestion.dataset.type = type;
        suggestion.textContent = messages.suggestion.replace('{type}', typeNames[type]);
        suggestion.hidden = false;
      }

      function updateCount() {
        characterCount.textContent = content.value.length + ' / ' + content.maxLength;
      }

      document.querySelectorAll('.type-tab').forEach((tab) => tab.addEventListener('click', () => selectType(tab.dataset.type)));
      suggestion.addEventListener('click', () => selectType(suggestion.dataset.type));
      content.addEventListener('input', () => { updateCount(); updateSuggestion(); });

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        errorBox.hidden = true;
        submitButton.disabled = true;
        submitButton.textContent = messages.creating;
        const data = Object.fromEntries(new FormData(form));
        data.cleanTracking = data.cleanTracking === 'true';
        data.isAffiliate = data.isAffiliate === 'true';

        try {
          const response = await fetch('/api/links', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-purelink-locale': ${JSON.stringify(locale)} },
            body: JSON.stringify(data),
          });
          const result = await response.json();
          if (!response.ok) {
            window.turnstile?.reset();
            throw new Error(result.error || messages.createFailed);
          }
          latestResult = result;
          const recovery = result.ownerLinked === true ? recoveryMessages.account : recoveryMessages.anonymous;
          document.getElementById('recovery-title').textContent = recovery.title;
          document.getElementById('recovery-help').textContent = recovery.help;
          const recoveryBackup = document.getElementById('recovery-backup');
          recoveryBackup.hidden = !recovery.backupTitle;
          recoveryBackup.querySelector('strong').textContent = recovery.backupTitle;
          recoveryBackup.querySelector('p').textContent = recovery.backupHelp;
          document.getElementById('copy-management').textContent = recovery.copy;
          document.getElementById('download-recovery').textContent = recovery.download;
          localStorage.setItem('purelink:management:' + result.slug, result.managementToken);
          document.getElementById('result-url').textContent = result.url;
          document.getElementById('result-url').href = result.url;
          const previewLink = document.getElementById('preview-link');
          previewLink.hidden = !result.previewUrl;
          previewLink.href = result.previewUrl || '';
          previewLink.textContent = result.previewLabel || messages.viewShared;
          shareResult.hidden = !navigator.share;
          resultStatus.textContent = '';
          form.hidden = true;
          resultPanel.hidden = false;
          resultPanel.focus();
        } catch (error) {
          errorBox.textContent = error.message;
          errorBox.hidden = false;
        } finally {
          submitButton.disabled = false;
          submitButton.textContent = ${JSON.stringify(m.home.createButton)};
        }
      });

      document.querySelector('[data-copy-target="result-url"]').addEventListener('click', async (event) => {
        const button = event.currentTarget;
        const copied = await copyText(latestResult.url);
        button.textContent = copied ? messages.copied : messages.copyFailed;
        resultStatus.textContent = copied ? messages.copiedUrl.replace('{url}', latestResult.url) : messages.browserCopy;
        setTimeout(() => { button.textContent = messages.copyShare; }, 1600);
      });

      shareResult.addEventListener('click', async () => {
        try {
          await navigator.share({ title: 'PureLink', text: ${JSON.stringify(m.page.shareText)}, url: latestResult.url });
          resultStatus.textContent = messages.systemShare.replace('{url}', latestResult.url);
        } catch (error) {
          if (error.name !== 'AbortError') resultStatus.textContent = messages.shareFailed;
        }
      });

      document.getElementById('copy-management').addEventListener('click', async (event) => {
        const button = event.currentTarget;
        const copied = await copyText(latestResult.managementUrl);
        button.textContent = copied ? messages.copied : messages.copyFailed;
        setTimeout(() => { button.textContent = ${JSON.stringify(m.home.copyManagement)}; }, 1600);
      });

      async function copyText(value) {
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(value);
            return true;
          }
        } catch {}
        const fallback = document.createElement('textarea');
        fallback.value = value;
        fallback.setAttribute('readonly', '');
        fallback.style.position = 'fixed';
        fallback.style.opacity = '0';
        document.body.append(fallback);
        fallback.select();
        const copied = document.execCommand('copy');
        fallback.remove();
        return copied;
      }

      document.getElementById('download-recovery').addEventListener('click', () => {
        const typeName = typeNames[latestResult.contentType] || ${JSON.stringify(m.common.content)};
        const text = messages.recoveryTitle + '\\n\\n' + messages.recoveryType + ${JSON.stringify(m.page.labelSeparator)} + typeName + '\\n' + messages.recoveryContent + ${JSON.stringify(m.page.labelSeparator)} + '\\n' + latestResult.url + '\\n\\n' + messages.recoveryPrivate + ${JSON.stringify(m.page.labelSeparator)} + '\\n' + latestResult.managementUrl + '\\n\\n' + messages.recoveryHelp + '\\n';
        const anchor = document.createElement('a');
        anchor.download = 'purelink-' + latestResult.slug + '-recovery.txt';
        anchor.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(text);
        anchor.click();
      });

      document.getElementById('create-another').addEventListener('click', () => {
        latestResult = null;
        form.reset();
        window.turnstile?.reset();
        selectType('url');
        form.hidden = false;
        resultPanel.hidden = true;
        content.focus();
      });

      const shortcutInput = new URLSearchParams(location.hash.slice(1)).get('url');
      const openFormulaAi = location.hash === '#formula-ai';
      selectType('url');
      if (shortcutInput) {
        content.value = shortcutInput;
        updateCount();
        updateSuggestion();
        history.replaceState(null, '', location.pathname + location.search);
        content.focus();
      } else if (openFormulaAi) {
        selectType('formula');
        const formulaAi = document.getElementById('formula-ai');
        if (formulaAi) formulaAi.open = true;
        document.getElementById('formula-ai-description')?.focus();
      }
    `,
    nonce,
    externalScripts: [
      '/assets/formula-editor.js',
      turnstileSiteKey ? 'https://challenges.cloudflare.com/turnstile/v0/api.js' : '',
    ],
  });
}

export function renderStartPage(locale = 'zh-Hant') {
  const m = getMessages(locale);
  return documentShell({
    title: m.start.title,
    description: m.start.description,
    robots: 'index, follow',
    canonicalPath: localizedHref(locale, 'start'),
    locale,
    body: `
      <main class="page start-page">
        <a class="wordmark" href="${localizedHref(locale)}">PureLink</a>
        <article class="panel start-panel">
          <p class="eyebrow">PURELINK</p>
          <h1 class="start-intro">${m.start.intro}</h1>
          <p class="start-no-account">${m.start.noAccount}</p>

          <section class="start-section">
            <h2>${m.start.youCanShare}</h2>
            <ul class="start-examples">
              <li>${m.start.shareExamples}</li>
            </ul>
          </section>

          <section class="start-section">
            <h2>${m.start.pureLinkOrganizes}</h2>
            <ul class="start-examples">
              <li><span class="example-url">${m.start.examples.url}</span></li>
              <li><span class="example-formula">${m.start.examples.formula}</span></li>
              <li><span class="example-card">${m.start.examples.card}</span></li>
            </ul>
          </section>

          <p class="start-closing">${m.start.closing}</p>
          <a class="primary-link" href="${localizedHref(locale)}">${m.start.cta}</a>
        </article>
        ${languageSwitcher(locale, 'start')}
      </main>
    `,
  });
}

export function renderUrlPreview(link, locale = 'zh-Hant') {
  const m = getMessages(locale);
  const destination = new URL(link.content);
  const affiliate = Number(link.is_affiliate) === 1;
  return documentShell({
    title: `${m.content.preview}: ${destination.hostname} — PureLink`,
    description: m.page.previewDescription,
    robots: 'noindex, nofollow, noarchive',
    locale,
    body: `
      <main class="page">
        <a class="wordmark" href="${localizedHref(locale)}">PureLink</a>
        <article class="panel preview-panel">
          <p class="eyebrow">${m.content.preview.toUpperCase()}</p>
          <h1 class="destination-host">${escapeHtml(destination.hostname)}</h1>
          <p class="destination-url">${escapeHtml(destination.toString())}</p>
          <div class="facts">
            <p><strong>${m.content.connection}</strong><span>${destination.protocol === 'https:' ? 'HTTPS' : m.content.insecure}</span></p>
            <p><strong>${m.content.shared}</strong><span>${escapeHtml(formatDate(link.created_at, locale))}</span></p>
            <p><strong>${m.content.referral}</strong><span>${affiliate ? m.content.affiliate : m.content.noAffiliate}</span></p>
          </div>
          <a class="primary-link" href="${escapeHtml(destination.toString())}" rel="noreferrer">${m.content.continue}</a>
          <a class="report-link" href="${localizedHref(locale, `report/${link.slug}`)}">${m.content.report}</a>
          <p class="notice">${escapeHtml(m.content.platformNotice)} ${m.content.previewNotice}</p>
          ${languageSwitcher(locale, `/${link.slug}+`)}
        </article>
      </main>
    `,
  });
}

export function renderFormulaPage(link, locale = 'zh-Hant') {
  const m = getMessages(locale);
  return documentShell({
    title: `${m.common.formula} — PureLink`,
    description: m.page.formulaDescription,
    robots: 'noindex, nofollow, noarchive',
    canonicalPath: `/${link.slug}`,
    locale,
    body: `
      <main class="page">
        <a class="wordmark" href="${localizedHref(locale)}">PureLink</a>
        <article class="panel content-panel">
          <div class="share-export formula-export" id="share-export">
            <p class="eyebrow" data-export-brand>PURELINK · FORMULA</p>
            <div class="shared-content formula-rendered">${renderFormulaContent(link.content)}</div>
          </div>
          <label class="export-brand-option"><input type="checkbox" data-export-brand-toggle checked><span><strong>${m.content.addBrandFormula}</strong><small>${m.content.brandHelp}</small></span></label>
          <div class="content-actions">
            <button class="secondary-button" type="button" data-copy-content>${m.content.copySource}</button>
            <button class="secondary-button" type="button" data-download-png data-filename="purelink-${escapeHtml(link.slug)}-formula.png">${m.content.downloadPng}</button>
            <button class="secondary-button" type="button" data-copy-link>${m.content.copyLink}</button>
            <button class="secondary-button" type="button" data-share-link>${m.common.share}</button>
          </div>
          <details class="source-details">
            <summary>${m.content.sourceInput}</summary>
            <pre class="formula-source">${escapeHtml(link.content)}</pre>
          </details>
          <textarea id="raw-content" hidden>${escapeHtml(link.content)}</textarea>
          <p class="notice">${escapeHtml(m.content.platformNotice)}</p>
          <a class="report-link" href="${localizedHref(locale, `report/${link.slug}`)}">${m.content.report}</a>
          ${languageSwitcher(locale, `/${link.slug}`)}
        </article>
      </main>
    `,
    externalScript: '/assets/content-actions.js',
  });
}

export function renderCardPage(link, locale = 'zh-Hant') {
  const m = getMessages(locale);
  const signature = link.signature ? `<p class="signature">— ${escapeHtml(link.signature)}</p>` : '';
  return documentShell({
    title: `${m.page.cardTitle} — PureLink`,
    description: m.page.cardDescription,
    robots: 'noindex, nofollow, noarchive',
    canonicalPath: `/${link.slug}`,
    locale,
    body: `
      <main class="page card-page theme-${escapeHtml(link.theme || 'paper')}">
        <a class="wordmark" href="${localizedHref(locale)}">PureLink</a>
        <article class="panel content-panel card-panel">
          <div class="share-export card-export" id="share-export">
            <p class="eyebrow" data-export-brand>PURELINK · A SMALL CARD</p>
            <p class="shared-content card-copy">${escapeHtml(link.content)}</p>
            ${signature}
          </div>
          <label class="export-brand-option"><input type="checkbox" data-export-brand-toggle checked><span><strong>${m.content.addBrandCard}</strong><small>${m.content.brandHelp}</small></span></label>
          <div class="content-actions">
            <button class="secondary-button" type="button" data-copy-content>${m.page.copyText}</button>
            <button class="secondary-button" type="button" data-download-png data-filename="purelink-${escapeHtml(link.slug)}-card.png">${m.content.downloadPng}</button>
            <button class="secondary-button" type="button" data-copy-link>${m.content.copyLink}</button>
            <button class="secondary-button" type="button" data-share-link>${m.common.share}</button>
          </div>
          <textarea id="raw-content" hidden>${escapeHtml(link.content)}</textarea>
          <p class="notice">${escapeHtml(m.content.platformNotice)}</p>
          <a class="report-link" href="${localizedHref(locale, `report/${link.slug}`)}">${m.content.report}</a>
          ${languageSwitcher(locale, `/${link.slug}`)}
        </article>
      </main>
    `,
    externalScript: '/assets/content-actions.js',
  });
}

export function renderReportPage(slug, nonce, turnstileSiteKey = '', locale = 'zh-Hant') {
  const m = getMessages(locale);
  const safeSlugScript = JSON.stringify(slug).replaceAll('<', '\\u003c');
  const turnstileWidget = turnstileSiteKey
    ? `<div class="turnstile-wrap"><div class="cf-turnstile" data-sitekey="${escapeHtml(turnstileSiteKey)}" data-action="report"></div></div>`
    : '';
  return documentShell({
    title: `${m.common.report} — PureLink`,
    description: m.report.intro,
    robots: 'noindex, nofollow, noarchive',
    locale,
    body: `
      <main class="page">
        <a class="wordmark" href="${localizedHref(locale)}">PureLink</a>
        <article class="panel report-panel">
          <p class="eyebrow">${m.page.reportEyebrow}</p>
          <h1 class="manage-title">${m.report.title}</h1>
          <p class="lede manage-lede">${m.page.reportBefore}<strong>/${escapeHtml(slug)}</strong>${m.page.reportAfter}</p>
          <form id="report-form">
            <label class="field-label" for="category">${m.report.category}</label>
            <select id="category" name="category" required>
              <option value="">${m.page.reportChoose}</option>
              <option value="phishing">${m.page.reportPhishing}</option>
              <option value="malware">${m.page.reportMalware}</option>
              <option value="impersonation">${m.page.reportImpersonation}</option>
              <option value="copyright">${m.page.reportCopyright}</option>
              <option value="privacy">${m.page.reportPrivacy}</option>
              <option value="other">${m.page.reportOther}</option>
            </select>
            <label class="field-label" for="details">${m.report.details}</label>
            <textarea id="details" name="details" maxlength="1000" placeholder="${escapeHtml(m.page.reportDetailsPlaceholder)}"></textarea>
            ${turnstileWidget}
            <p class="form-error" id="report-error" role="alert" hidden></p>
            <button class="create-button" id="report-button" type="submit">${m.report.submit}</button>
          </form>
          <p class="notice" id="report-status" role="status">${escapeHtml(m.content.platformNotice)}</p>
          ${languageSwitcher(locale, `report/${slug}`)}
        </article>
      </main>
    `,
    script: `
      const reportMessages = ${JSON.stringify(m.report).replaceAll('<', '\\u003c')};
      const slug = ${safeSlugScript};
      const form = document.getElementById('report-form');
      const button = document.getElementById('report-button');
      const errorBox = document.getElementById('report-error');
      const status = document.getElementById('report-status');
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        errorBox.hidden = true;
        button.disabled = true;
        button.textContent = ${JSON.stringify(m.page.reportSending)};
        const data = Object.fromEntries(new FormData(form));
        data.slug = slug;
        try {
          const response = await fetch('/api/reports', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-purelink-locale': ${JSON.stringify(locale)} },
            body: JSON.stringify(data),
          });
          const result = await response.json();
          if (!response.ok) {
            window.turnstile?.reset();
            throw new Error(result.error || ${JSON.stringify(m.page.reportFailed)});
          }
          form.hidden = true;
          status.textContent = reportMessages.received;
        } catch (error) {
          errorBox.textContent = error.message;
          errorBox.hidden = false;
          button.disabled = false;
          button.textContent = reportMessages.submit;
        }
      });
    `,
    nonce,
    externalScript: turnstileSiteKey ? 'https://challenges.cloudflare.com/turnstile/v0/api.js' : '',
  });
}

export function renderLegalPage(page, locale = 'zh-Hant', providers = {}) {
  const pages = {
    privacy: {
      eyebrow: 'PRIVACY',
      title: '只留下服務真正需要的資料。',
      intro: 'PureLink 不以廣告、跨站追蹤或建立個人檔案為目的。這份說明用一般人看得懂的方式，列出服務會處理什麼。',
      sections: [
        ['我們保存的內容', '你主動建立的網址、公式或小卡，以及必要的設定、建立時間、狀態與不可逆的匿名管理憑證雜湊。管理憑證本身只交給建立者，PureLink 無法替匿名使用者找回。'],
        ['最低限度統計', '只按日期、功能類型與國家或地區代碼累加總數，用來估計人數、成本與服務狀況；不保存原始 IP，也不建立個人瀏覽歷程。未知地區統一記為 ZZ。'],
        ['防止濫用', '公開寫入會使用 Turnstile 驗證，並以原始 IP、時間窗與伺服器密鑰產生不可逆的短期速率限制代碼。代碼只用於限制惡意大量請求，逾期後清除。'],
        ['自願登入', '完全不登入仍可建立與管理匿名內容。若你自願使用 Google 登入，PureLink 會保存 Google 提供的穩定帳號識別碼、電子郵件、顯示名稱，以及登入工作階段的不可逆雜湊，用來跨裝置顯示你主動連結的內容；不保存 Google 密碼或長期存取權杖。'],
        ['可選的 AI 公式生成', '一般登入使用者可每日最多使用 5 次公式生成；維運管理員的測試上限為 100 次。你輸入的描述會傳送給 Cloudflare Workers AI，用來產生一個 LaTeX 草稿；PureLink 只在資料庫保存帳號、日期與當日次數，不保存描述或生成結果。AI 結果可能有誤，使用者必須先檢查與編輯。'],
        ['我們刻意不做的事', '不販售資料、不投放行為廣告、不做跨站追蹤、不建立個人興趣檔案，也不把使用內容拿去訓練模型。瀏覽器與網路供應商仍會在傳輸請求時接觸必要的網路資料。'],
        ['刪除與聯絡', '匿名建立者可用管理地址永久刪除內容；遺失管理憑證時無法驗證建立者身分。若內容涉及安全、隱私或權利問題，可從內容頁使用回報功能。'],
      ],
    },
    terms: {
      eyebrow: 'TERMS & CONTENT',
      title: '自由分享，不等於沒有邊界。',
      intro: PLATFORM_NOTICE,
      sections: [
        ['使用者的責任', '請只分享你有權分享的內容，並自行確認外部網址、公式與文字的正確性。不得利用 PureLink 從事釣魚、詐騙、散布惡意程式、冒用身分、侵害隱私或其他違法行為。'],
        ['預覽不是安全認證', '網址後加上 + 會完整顯示目的地與建立者是否宣告推薦或分潤關係，幫助接收者自行判斷；這不是惡意網站掃描、法律審核或安全保證。'],
        ['處理與下架', '收到回報後，PureLink 可依風險、內容規範與適用法律限制存取或移除內容。回報本身不代表內容必然違規，也不會自動下架。'],
        ['服務狀態', 'PureLink 以盡力而為方式提供，可能因維護、成本、安全事件或不可抗力暫停。重要內容不應只保存在 PureLink。'],
        ['支持與付費功能', '基本成果希望任何人都能使用。自願支持不附帶商品、AI 額度或平台特權，並與商品付款分開處理。AI 公式額度是清楚標價的一次性數位商品；價格、交付與退款條件公開於 AI credits 與 Refund policy 頁面。'],
      ],
    },
    transparency: {
      eyebrow: 'TRANSPARENCY',
      title: '能被檢查，才配得上「不追蹤」。',
      intro: 'PureLink 的承諾不只是一句文案：產品設計、資料欄位與防濫用方式都以可公開檢視為方向。',
      sections: [
        ['目前的資料邊界', '內容資料庫保存分享內容、設定與匿名管理雜湊；自願登入者另保存最低限度 Google 帳號資料與工作階段雜湊；統計資料庫只保存每日聚合數字；速率限制只保存短期不可逆代碼；檢舉不要求姓名或電子郵件。'],
        ['人類驗證的定位', 'Turnstile 只保護建立與檢舉等公開寫入，不阻擋一般人閱讀內容。它是防止機器大量濫用的安全措施，不是建立會員身分或追蹤閱讀者。'],
        ['AI 公式生成的邊界', '公式描述只在使用者主動按下生成時送往 Cloudflare Workers AI。PureLink 不儲存提示或回覆，只保存每日使用次數；草稿不會自動發布，必須由使用者插入、檢查後再建立 PureLink。'],
        ['開源與驗證', '正式發布時將公開程式、資料結構、部署說明與製作歷程，讓任何人能檢查承諾、提出問題或自行部署。版本與政策有實質變更時，也應在公開紀錄中留下痕跡。'],
        ['目前限制', '這是仍在驗證中的 MVP。自訂網域、正式監控、事件處理流程與定期透明度報告，會在正式上線前或依服務規模逐步完成。'],
      ],
    },
    'ai-credits': {
      lang: 'en',
      eyebrow: 'AI FORMULA CREDITS',
      title: 'PureLink AI Formula Credits',
      intro: 'PureLink is free to use. These one-time purchases add AI formula drafts only; they are not subscriptions and do not make the core URL, manual formula, or card tools paid services.',
      sections: [
        ['What the product does', 'A signed-in customer can describe a mathematical expression in natural language and receive an editable LaTeX draft with an immediate visual preview. The result is never published automatically, may contain mistakes, and must be reviewed by the customer before use.'],
        ['One-time plans', ''],
        ['Delivery and use', 'After payment is confirmed, credits are added to the PureLink account that started the purchase. Customers must be signed in before purchasing. The regular five free daily credits are used first. Purchased credits are only for the AI formula draft feature and are not shared between accounts.'],
        ['Payment status', 'Checkout is completing provider approval and production integration. No payment is accepted until it is enabled.'],
        ['Support', 'For purchase, delivery, or account questions, contact nasa3.14159@gmail.com. Include the email address used for your PureLink account and the order number, but never send a password, full card number, or Google credential.'],
      ],
    },
    'refund-policy': {
      lang: 'en',
      eyebrow: 'REFUND POLICY',
      title: 'A clear path when a purchase goes wrong.',
      intro: 'This policy applies to one-time purchases of PureLink AI formula credits. It does not limit any mandatory consumer rights that apply in the customer’s country or region.',
      sections: [
        ['Unused credits', 'A customer may request a refund within 14 calendar days of purchase if none of the purchased credits have been used. Approved refunds are returned to the original payment method.'],
        ['Delivery or technical failure', 'If a confirmed payment is not credited to the correct PureLink account, contact support so the order can be verified and delivered. If PureLink cannot deliver the purchased credits or the feature has a material unresolved defect, the customer may receive a full or proportionate refund as appropriate.'],
        ['Credits already used', 'Consumed credits are generally not refundable because the digital service is delivered immediately when a generation is requested. Exceptions are made where required by law or where PureLink confirms that a charged generation failed because of the service.'],
        ['How to request help', 'Email nasa3.14159@gmail.com with the order number, purchase date, PureLink account email, and a short description of the issue. Do not include card details or account passwords. PureLink aims to acknowledge requests within five business days.'],
        ['Processing and abuse', 'Refunds are processed through the original payment provider and may take additional time to appear. Fraudulent use, resale, automation intended to bypass limits, or repeated abuse may result in credits being suspended while the transaction is reviewed.'],
      ],
    },
  };
  const baseContent = localizedLegalContent(page, locale, pages) || pages.transparency;
  const m = getMessages(locale);
  const paymentProviders = [providers.ecpay ? m.billing.providerEcpay : '', providers.lemon ? m.billing.providerLemon : ''].filter(Boolean);
  const paymentStatus = paymentProviders.length
    ? m.billing.paymentEnabled.replace('{providers}', paymentProviders.join(locale === 'en' ? ' · ' : '、'))
    : m.billing.paymentUnavailable;
  const content = page === 'ai-credits'
    ? {
      ...baseContent,
      sections: baseContent.sections.map(([heading, copy]) => {
        if (heading === 'One-time plans' || heading === '一次性方案') return [heading, `${creditPackSummary(locale)}${locale === 'en' ? '. These are one-time purchases, not subscriptions.' : '。這些都是一次性購買，不是訂閱。'}`];
        if (heading === 'Payment status' || heading === '付款狀態') return [heading, paymentStatus];
        return [heading, copy];
      }),
    }
    : baseContent;
  const updated = page === 'ai-credits'
    ? (locale === 'en' ? 'Last updated: September 1, 2026' : 'MVP 說明版本：2026-09-01')
    : (locale === 'en' ? 'Last updated: August 14, 2026' : 'MVP 說明版本：2026-08-14');
  return documentShell({
    title: `${content.title} — PureLink`,
    description: content.intro,
    robots: 'index, follow',
    canonicalPath: localizedHref(locale, page),
    locale,
    body: `
      <main class="page legal-page">
        <a class="wordmark" href="${localizedHref(locale)}">PureLink</a>
        <article class="panel legal-panel">
          <p class="eyebrow">${content.eyebrow}</p>
          <h1 class="legal-title">${escapeHtml(content.title)}</h1>
          <p class="lede legal-intro">${escapeHtml(content.intro)}</p>
          <div class="legal-sections">${content.sections.map(([heading, copy]) => `<section><h2>${escapeHtml(heading)}</h2><p>${escapeHtml(copy)}</p></section>`).join('')}</div>
          ${page === 'ai-credits' ? `<p class="legal-contact"><a href="${localizedHref(locale, 'refund-policy')}">${locale === 'en' ? 'Refund policy' : '退款政策'}</a> · <a href="mailto:nasa3.14159@gmail.com">${locale === 'en' ? 'Support: nasa3.14159@gmail.com' : '支援：nasa3.14159@gmail.com'}</a></p>` : ''}
          <nav class="legal-nav" aria-label="${escapeHtml(m.page.policyNav)}"><a href="${localizedHref(locale)}">PureLink</a><a href="${localizedHref(locale, 'ai-credits')}">${m.page.aiCreditsNav}</a><a href="${localizedHref(locale, 'support')}">${m.support.button}</a><a href="${localizedHref(locale, 'refund-policy')}">${m.page.refundPolicyNav}</a><a href="${localizedHref(locale, 'privacy')}">${m.home.privacyLink}</a><a href="${localizedHref(locale, 'terms')}">${m.home.termsLink}</a><a href="${localizedHref(locale, 'transparency')}">${m.home.transparencyLink}</a></nav>
          ${languageSwitcher(locale, page)}
          <p class="legal-updated">${updated}</p>
        </article>
      </main>
    `,
  });
}

function localizedLegalContent(page, locale, defaults) {
  if (locale === 'zh-Hant' && !['ai-credits', 'refund-policy'].includes(page)) return defaults[page];
  const content = {
    en: {
      privacy: ['PRIVACY', 'Keep only the data the service actually needs.', 'PureLink is not built for advertising, cross-site tracking, or personal profiles.', [
        ['What we store', 'The URLs, formulas, or cards you create, their necessary settings, timestamps, status, and a one-way hash of the anonymous management credential. The credential itself is given only to its creator and cannot be recovered by PureLink.'],
        ['Minimal analytics', 'We add daily totals by feature type and country or region code to estimate usage, cost, and service health. We do not retain raw IP addresses or individual browsing histories; unknown regions are recorded as ZZ.'],
        ['Abuse prevention', 'Public writes use Turnstile and a short-lived, one-way rate-limit identifier derived from IP address, time window, and a server secret. It is used only to limit automated abuse and expires.'],
        ['Optional sign-in', 'You can create and manage anonymous content without signing in. If you choose Google sign-in, PureLink stores the stable Google account identifier, email, display name, and a one-way session hash to show content you deliberately link across devices. It does not store Google passwords or long-lived access tokens.'],
        ['Optional AI formula generation', 'Regular signed-in users can generate up to five formula drafts each day; the operator test limit is 100. A description is sent to Cloudflare Workers AI to create one LaTeX draft. PureLink stores only account, date, and count—not descriptions or results. Results can be wrong and must be reviewed.'],
        ['What we deliberately do not do', 'PureLink does not sell data, serve behavioural ads, track people across sites, build interest profiles, or train models on shared content. Browsers and network providers still necessarily handle network data while requests are transmitted.'],
        ['Deletion and contact', 'Anonymous creators can permanently delete content with the management address. A lost credential cannot verify ownership. Use the report option on a content page for safety, privacy, or rights concerns.'],
      ]],
      terms: ['TERMS & CONTENT', 'Sharing freely does not mean sharing without boundaries.', 'Content and external websites shared through PureLink are supplied by their creators and do not represent PureLink’s views, recommendation, endorsement, or security guarantee.', [
        ['Your responsibility', 'Share only material you have a right to share and check external URLs, formulas, and text yourself. Do not use PureLink for phishing, fraud, malware, impersonation, privacy infringement, or other unlawful activity.'],
        ['A preview is not a security certification', 'Adding + to a URL shows the complete destination and the creator’s affiliate disclosure so recipients can decide for themselves. It is not a malicious-site scan, legal review, or security guarantee.'],
        ['Review and removal', 'After a report, PureLink may restrict access to or remove content based on risk, these rules, and applicable law. A report alone does not establish a violation or trigger automatic removal.'],
        ['Service availability', 'PureLink is provided on a best-effort basis and may be paused for maintenance, cost, security incidents, or events outside our control. Do not store important material only in PureLink.'],
        ['Support and paid features', 'The core service is intended to remain available to everyone. Voluntary support does not provide goods, AI credits, or platform privileges and is separate from product payments. AI formula credits are clearly priced one-time digital goods; pricing, delivery, and refunds are described on the AI credits and refund policy pages.'],
      ]],
      transparency: ['TRANSPARENCY', 'A promise not to track should be inspectable.', 'PureLink’s product design, data fields, and abuse controls are intended to be publicly reviewable rather than merely asserted.', [
        ['Current data boundary', 'The content database holds shared content, settings, and anonymous management hashes. Optional sign-in adds minimal Google account data and session hashes. Analytics stores only daily aggregates, rate limiting stores short-lived one-way identifiers, and reports do not require a name or email.'],
        ['Human verification', 'Turnstile protects public writes such as creation and reporting. It does not block ordinary reading and is an anti-automation measure, not membership or reader tracking.'],
        ['AI formula boundary', 'A formula description is sent to Cloudflare Workers AI only after the user requests generation. PureLink does not retain prompts or responses; it records only daily usage. Drafts are never published automatically.'],
        ['Open source and verification', 'Source, data structures, deployment notes, and project history are public so people can inspect the promises, raise questions, or self-host. Material changes to versions or policies should leave a public record.'],
        ['Current limits', 'This is an MVP under validation. Custom domains, formal monitoring, incident processes, and regular transparency reports will mature before launch or as the service grows.'],
      ]],
    },
    'zh-Hant': {
      'ai-credits': ['PureLink AI 公式額度', '需要時才購買更多公式草稿。', 'PureLink 核心功能免費使用；可選的一次性額度只延伸 AI 公式功能，不會把網址、公式或小卡變成付費服務。', [
        ['商品內容', '已登入的使用者可用自然語言描述數學式，取得可編輯、可立即預覽的 LaTeX 草稿。結果不會自動發布，可能有錯，使用前必須自行檢查。'],
        ['一次性方案', ''],
        ['交付與使用', '付款確認後，額度會加入發起購買的 PureLink 帳號。購買前必須登入。一般登入帳號每日免費額度仍優先使用。購買額度只用於 AI 公式草稿功能，且不在帳號間共用。'],
        ['付款狀態', '付款功能目前正在完成供應商審核與正式整合；未啟用前不會收款。'],
        ['核心功能', '網址縮短、手動公式建立、小卡等核心功能不因購買額度而成為付費服務。AI 產生的公式可能有錯，使用前必須自行檢查。'],
        ['支援', '若有購買、交付或帳號問題，請聯絡 nasa3.14159@gmail.com。請提供 PureLink 帳號電子郵件與訂單編號，但不要傳送密碼、完整卡號或 Google 憑證。'],
      ]],
      'refund-policy': ['退款政策', '購買出錯時的清楚處理方式。', '本政策適用於 PureLink AI 公式額度的一次性購買，不限制使用者所在地區適用的任何強制消費者權利。', [
        ['未使用額度', '若已購額度尚未使用，使用者可在購買後 14 個日曆日內申請退款。核准的退款會退回原付款方式。'],
        ['交付或技術失敗', '若確認付款沒有加到正確的 PureLink 帳號，請聯絡支援以驗證並交付訂單。若 PureLink 無法交付已購額度，或功能有重大且未解決的缺陷，使用者可視情況獲得全額或相稱退款。'],
        ['已使用額度', '已消耗的額度通常不退款，因為數位服務在請求生成時立即交付；法律要求或 PureLink 確認付費生成因服務失敗時則例外。'],
        ['如何申請協助', '請以訂單編號、購買日期、PureLink 帳號電子郵件與簡短問題描述寄信至 nasa3.14159@gmail.com。不要包含卡片資料或帳號密碼。PureLink 目標在五個工作天內確認收到請求。'],
        ['處理與濫用', '退款由原付款供應商處理，入帳可能需要額外時間。詐欺使用、轉售、試圖繞過限制的自動化，或反覆濫用，可能使額度在交易審查期間暫停。'],
      ]],
    },
  }[locale]?.[page];
  if (!content) return defaults[page];
  const [eyebrow, title, intro, sections] = content;
  return { eyebrow, title, intro, sections, lang: locale };
}

export function renderManagePage(link, nonce, user = null, googleAuthConfigured = false, locale = 'zh-Hant') {
  const m = getMessages(locale);
  const slug = link.slug;
  const safeSlugScript = JSON.stringify(slug).replaceAll('<', '\\u003c');
  const accountAccess = Boolean(user && link.owner_user_id === user.id);
  const contentTypeName = ({ url: m.common.url, formula: m.common.formula, card: m.common.card })[link.content_type] || m.common.content;
  const accountPanel = user
    ? `<div class="account-connect"><p>${m.page.signedIn}${m.page.labelSeparator}<strong>${escapeHtml(user.email)}</strong></p>${accountAccess ? `<p>${m.page.alreadyLinked}</p>` : `<button class="secondary-button" id="claim-link" type="button">${m.manage.claim}</button>`}<a href="${localizedHref(locale, 'account')}">${m.page.viewAccount}</a></div>`
    : googleAuthConfigured
      ? `<div class="account-connect"><strong>${m.page.crossDevice}</strong><p>${m.page.crossDeviceHelp}</p><a class="google-link" href="/auth/google?returnTo=${encodeURIComponent(localizedHref(locale, `manage/${slug}`))}">${m.page.continueGoogle}</a></div>`
      : '';
  return documentShell({
    title: m.manage.title,
    description: m.manage.intro,
    robots: 'noindex, nofollow, noarchive',
    locale,
    body: `
      <main class="page">
        <a class="wordmark" href="${localizedHref(locale)}">PureLink</a>
        <article class="panel manage-panel">
          <p class="eyebrow">${m.page.managementEyebrow}</p>
          <h1 class="manage-title">${m.manage.title}</h1>
          <p class="lede manage-lede">${m.manage.intro}</p>
          <div class="managed-content-card">
            <span>${escapeHtml(contentTypeName)}</span>
            <strong>/${escapeHtml(slug)}</strong>
            <a class="primary-link" href="/${escapeHtml(slug)}">${m.manage.view}</a>
          </div>
          ${accountPanel}
          <div class="manage-actions" id="manage-actions" hidden>
            <button class="secondary-button" id="copy-management" type="button">${m.home.copyManagement}</button>
            <button class="secondary-button" id="download-recovery" type="button">${m.home.downloadRecovery}</button>
            <button class="danger-button" id="delete-link" type="button">${m.manage.delete}</button>
          </div>
          <p class="notice" id="management-status" role="status">${m.manage.checking}</p>
          ${languageSwitcher(locale, `manage/${slug}`)}
        </article>
      </main>
    `,
    script: `
      const manageMessages = ${JSON.stringify(m.manage).replaceAll('<', '\\u003c')};
      const homeMessages = ${JSON.stringify(m.home).replaceAll('<', '\\u003c')};
      const pageMessages = ${JSON.stringify(m.page).replaceAll('<', '\\u003c')};
      const slug = ${safeSlugScript};
      const contentTypeName = ${JSON.stringify(contentTypeName).replaceAll('<', '\\u003c')};
      const storageKey = 'purelink:management:' + slug;
      const fragmentToken = location.hash.slice(1);
      if (fragmentToken) localStorage.setItem(storageKey, fragmentToken);
      const token = fragmentToken || localStorage.getItem(storageKey) || '';
      const accountAccess = ${accountAccess};
      const actions = document.getElementById('manage-actions');
      const status = document.getElementById('management-status');
      const copyManagement = document.getElementById('copy-management');
      const downloadRecovery = document.getElementById('download-recovery');
      const canonicalAddress = location.origin + '/manage/' + encodeURIComponent(slug) + '#' + token;

      copyManagement.hidden = !token;
      downloadRecovery.hidden = !token;

      if (token || accountAccess) {
        actions.hidden = false;
        status.textContent = accountAccess ? manageMessages.accountAccess : manageMessages.anonymousAccess;
      } else {
        status.textContent = manageMessages.missingCredential;
      }

      copyManagement.addEventListener('click', async (event) => {
        await navigator.clipboard.writeText(canonicalAddress);
        const button = event.currentTarget;
        button.textContent = ${JSON.stringify(m.common.copy)};
        setTimeout(() => { button.textContent = homeMessages.copyManagement; }, 1600);
      });

      downloadRecovery.addEventListener('click', () => {
        const recoveryText = homeMessages.client.recoveryTitle + '\\n\\n' + homeMessages.client.recoveryType + pageMessages.labelSeparator + contentTypeName + '\\n' + homeMessages.client.recoveryContent + pageMessages.labelSeparator + '\\n' + location.origin + '/' + encodeURIComponent(slug) + '\\n\\n' + homeMessages.client.recoveryPrivate + pageMessages.labelSeparator + '\\n' + canonicalAddress + '\\n\\n' + homeMessages.client.recoveryHelp + '\\n';
        const anchor = document.createElement('a');
        anchor.download = 'purelink-' + slug + '-recovery.txt';
        anchor.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(recoveryText);
        anchor.click();
      });

      document.getElementById('claim-link')?.addEventListener('click', async (event) => {
        const button = event.currentTarget;
        if (!token) {
          status.textContent = manageMessages.claimMissing;
          return;
        }
        button.disabled = true;
        const response = await fetch('/api/links/' + encodeURIComponent(slug) + '/claim', {
          method: 'POST',
          headers: { authorization: 'Bearer ' + token },
        });
        if (response.ok) {
          button.replaceWith(document.createTextNode(manageMessages.claimed));
          status.textContent = manageMessages.claimNext;
        } else {
          button.disabled = false;
          status.textContent = manageMessages.claimFailed;
        }
      });

      let deleteArmed = false;
      document.getElementById('delete-link').addEventListener('click', async (event) => {
        const button = event.currentTarget;
        if (!deleteArmed) {
          deleteArmed = true;
          button.textContent = manageMessages.deleteAgain;
          setTimeout(() => { deleteArmed = false; button.textContent = manageMessages.delete; }, 5000);
          return;
        }

        button.disabled = true;
        const response = await fetch('/api/links/' + encodeURIComponent(slug), {
          method: 'DELETE',
          headers: token ? { authorization: 'Bearer ' + token } : {},
        });
        if (response.ok) {
          localStorage.removeItem(storageKey);
          actions.hidden = true;
          history.replaceState(null, '', location.pathname);
          status.textContent = manageMessages.deleted;
        } else {
          button.disabled = false;
          deleteArmed = false;
          button.textContent = manageMessages.delete;
          status.textContent = manageMessages.deleteFailed;
        }
      });
    `,
    nonce,
  });
}

export function renderAccountPage(user, links, creditBalance = 0, providers = {}, purchaseStatus = '', nonce = '', locale = 'zh-Hant') {
  const m = getMessages(locale);
  const enabledProviders = [providers.ecpay ? ['ecpay', m.billing.providerEcpay] : null, providers.lemon ? ['lemon', m.billing.providerLemon] : null].filter(Boolean);
  const rows = links.length
    ? links.map((link) => `<li><div><span>${escapeHtml(({ url: m.common.url, formula: m.common.formula, card: m.common.card })[link.content_type] || m.common.content)}</span><strong>/${escapeHtml(link.slug)}</strong></div><a href="/${escapeHtml(link.slug)}">${m.common.view}</a><a href="${localizedHref(locale, `manage/${link.slug}`)}">${m.common.manage}</a></li>`).join('')
    : `<li class="empty-account">${m.account.empty}</li>`;
  const purchaseNotice = purchaseStatus === 'success'
    ? `<p class="auth-notice" role="status"><strong>${m.billing.returned}</strong><span>${m.billing.returnedHelp}</span></p>`
    : purchaseStatus === 'pending'
      ? `<p class="auth-notice" role="status"><strong>${m.billing.pending}</strong><span>${m.billing.pendingHelp}</span></p>`
      : '';
  const packActions = enabledProviders.length
    ? `<div class="credit-pack-list">${listAiCreditPacks().map((pack) => `<section class="credit-pack"><strong>${escapeHtml(m.billing.packNames[pack.id])}</strong><span>${escapeHtml(m.billing.pack.replace('{name}', m.billing.packNames[pack.id]).replace('{credits}', Number(pack.credits).toLocaleString('en-US')).replace('{price}', Number(pack.priceTwd).toLocaleString('en-US')))}</span>${enabledProviders.length > 1 ? `<small>${m.billing.providerChoice}</small>` : ''}<div class="provider-choices">${enabledProviders.map(([provider, name]) => `<button type="button" data-billing-checkout data-provider="${provider}" data-pack-id="${pack.id}">${escapeHtml(enabledProviders.length > 1 ? name : m.billing.buy)}</button>`).join('')}</div></section>`).join('')}</div><p class="billing-status" id="billing-status" role="status" hidden></p>`
    : `<p class="billing-status">${m.account.billingDisabled}</p>`;
  return documentShell({
    title: m.account.title,
    description: m.account.intro,
    robots: 'noindex, nofollow, noarchive',
    locale,
    body: `
      <main class="page account-page">
        <a class="wordmark" href="${localizedHref(locale)}">PureLink</a>
        <article class="panel account-panel">
          <p class="eyebrow">${m.page.accountEyebrow}</p>
          <h1 class="manage-title">${m.page.greeting.replace('{name}', escapeHtml(user.display_name || user.email))}</h1>
          <p class="lede manage-lede">${m.account.intro}</p>
          ${purchaseNotice}
          <section class="account-credits" aria-labelledby="account-credits-title">
            <p class="eyebrow">${m.page.creditsEyebrow}</p>
            <h2 id="account-credits-title">${m.account.credits.replace('{count}', Math.max(0, Number(creditBalance || 0)))}</h2>
            <p>${m.account.creditsHelp}</p>
            <p><strong>${m.billing.packs}</strong></p>
            ${packActions}
            <p><a href="${localizedHref(locale, 'ai-credits')}">${m.account.productInfo}</a> · <a href="${localizedHref(locale, 'support')}">${m.support.button}</a> · <a href="${localizedHref(locale, 'refund-policy')}">${m.account.refund}</a></p>
          </section>
          <ul class="account-links">${rows}</ul>
          <form action="/auth/logout" method="post"><button class="secondary-button" type="submit">${m.account.logOut}</button></form>
          ${languageSwitcher(locale, 'account')}
        </article>
      </main>
    `,
    script: enabledProviders.length ? `
      const billingMessages = ${JSON.stringify(m.billing).replaceAll('<', '\\u003c')};
      const billingStatus = document.getElementById('billing-status');
      document.querySelectorAll('[data-billing-checkout]').forEach((buyButton) => buyButton.addEventListener('click', async () => {
        const allButtons = document.querySelectorAll('[data-billing-checkout]');
        allButtons.forEach((button) => { button.disabled = true; });
        billingStatus.hidden = false;
        billingStatus.textContent = billingMessages.opening;
        try {
          const response = await fetch('/api/billing/checkout', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-purelink-locale': ${JSON.stringify(locale)} },
            body: JSON.stringify({ provider: buyButton.dataset.provider, packId: buyButton.dataset.packId }),
          });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || billingMessages.failed);
          if (payload.checkoutUrl) location.assign(payload.checkoutUrl);
          else if (payload.action && payload.fields) {
            const form = document.createElement('form');
            form.method = 'post';
            form.action = payload.action;
            Object.entries(payload.fields).forEach(([name, value]) => {
              const input = document.createElement('input'); input.type = 'hidden'; input.name = name; input.value = value; form.append(input);
            });
            document.body.append(form);
            form.submit();
          } else throw new Error(billingMessages.failed);
        } catch (error) {
          billingStatus.textContent = error.message;
          billingStatus.dataset.error = 'true';
          allButtons.forEach((button) => { button.disabled = false; });
        }
      }));
    ` : '',
    nonce,
  });
}

export function renderSupportPage(totals, checkoutConfigured = false, thanks = false, nonce = '', locale = 'zh-Hant', turnstileSiteKey = '') {
  const m = getMessages(locale);
  const publicSupporters = (totals?.publicSupporters || []).map(escapeHtml).filter(Boolean);
  const turnstileWidget = checkoutConfigured && turnstileSiteKey
    ? `<div class="turnstile-wrap"><div class="cf-turnstile" data-sitekey="${escapeHtml(turnstileSiteKey)}" data-action="support-checkout"></div></div>`
    : '';
  const checkout = checkoutConfigured
    ? `<form id="support-form"><label class="field-label" for="support-display-name">${m.support.optionalName}</label><input id="support-display-name" name="displayName" maxlength="60" autocomplete="nickname"><p class="field-help">${m.support.optionalNameHelp}</p><label class="check-row"><input id="support-public-attribution" type="checkbox" name="publicAttribution" value="true"><span><strong>${m.support.attribute}</strong></span></label>${turnstileWidget}<button class="create-button" id="support-button" type="submit">${m.support.button}</button><p class="billing-status" id="support-status" role="status" hidden></p></form>`
    : `<p class="billing-status">${m.support.unavailable}</p>`;
  return documentShell({
    title: `${m.support.title} — PureLink`, description: m.support.description, robots: 'index, follow', canonicalPath: localizedHref(locale, 'support'), locale,
    body: `<main class="page support-page"><a class="wordmark" href="${localizedHref(locale)}">PureLink</a><article class="panel support-panel"><p class="eyebrow">${m.support.eyebrow}</p><h1 class="manage-title">${m.support.title}</h1><p class="lede manage-lede">${m.support.intro}</p>${thanks ? `<p class="auth-notice" role="status">${m.support.thanks}</p>` : ''}<section class="support-totals" aria-label="${escapeHtml(m.support.totals)}"><span>${m.support.totals}</span><strong>${formatUsd(totals?.netUsdMinor || 0, locale)}</strong><small>${m.support.contributions.replace('{count}', Math.max(0, Number(totals?.contributionCount || 0)))}</small>${totals?.hasUnconvertedContributions ? `<p>${m.support.limitedTotals}</p>` : ''}</section>${publicSupporters.length ? `<p class="supporters"><strong>${m.support.supporters}</strong>: ${publicSupporters.join(', ')}</p>` : ''}<p class="notice">${m.support.boundary}</p>${checkout}<p><a href="${localizedHref(locale, 'ai-credits')}">${m.support.aiCredits}</a></p>${languageSwitcher(locale, 'support')}</article></main>`,
    script: checkoutConfigured ? `
      const supportMessages = ${JSON.stringify(m.support).replaceAll('<', '\\u003c')};
      const supportForm = document.getElementById('support-form');
      const supportButton = document.getElementById('support-button');
      const supportStatus = document.getElementById('support-status');
      supportForm.addEventListener('submit', async (event) => {
        event.preventDefault(); supportButton.disabled = true; supportStatus.hidden = false; supportStatus.textContent = supportMessages.opening;
        try {
          const data = Object.fromEntries(new FormData(supportForm));
          data.turnstileToken = window.turnstile?.getResponse() || '';
          const response = await fetch('/api/support/checkout', { method: 'POST', headers: { 'content-type': 'application/json', 'x-purelink-locale': ${JSON.stringify(locale)} }, body: JSON.stringify(data) });
          const payload = await response.json();
          if (!response.ok || !payload.checkoutUrl) throw new Error(payload.error || supportMessages.failed);
          location.assign(payload.checkoutUrl);
        } catch (error) { window.turnstile?.reset(); supportStatus.textContent = error.message; supportStatus.dataset.error = 'true'; supportButton.disabled = false; }
      });
    ` : '',
    nonce,
    externalScript: turnstileSiteKey ? 'https://challenges.cloudflare.com/turnstile/v0/api.js' : '',
  });
}

function formatUsd(minor, locale) {
  return new Intl.NumberFormat(locale === 'zh-Hant' ? 'zh-TW' : 'en-US', { style: 'currency', currency: 'USD' }).format(Math.max(0, Number(minor || 0)) / 100);
}

export function renderNotFoundPage(locale = 'zh-Hant') {
  const m = getMessages(locale);
  return documentShell({
    title: `${m.page.notFoundTitle} — PureLink`,
    description: m.page.notFoundDescription,
    robots: 'noindex, nofollow',
    locale,
    body: `
      <main class="home">
        <p class="eyebrow">404</p>
        <h1>${m.page.notFoundHeading}</h1>
        <p class="lede">${m.page.notFoundBody}</p>
        <a class="primary-link compact" href="${localizedHref(locale)}">${m.page.returnHome}</a>
      </main>
    `,
  });
}

/** A deliberately tiny, noindex Turnstile surface used only by the Android verification WebView. */
export function renderNativeVerificationPage(nonce, turnstileSiteKey, locale = 'en') {
  const m = getMessages(locale).nativeVerify;
  const clientCopy = JSON.stringify(m).replaceAll('<', '\\u003c');
  const siteKey = JSON.stringify(String(turnstileSiteKey || '')).replaceAll('<', '\\u003c');
  return documentShell({
    title: `PureLink — ${m.title}`,
    description: m.description,
    robots: 'noindex, nofollow, noarchive',
    locale,
    body: `<main class="home"><p class="eyebrow">PURELINK</p><h1>${escapeHtml(m.title)}</h1><p class="lede">${escapeHtml(m.description)}</p><div id="native-turnstile" class="turnstile-wrap"></div><p class="status" id="native-status" role="status"><span class="status-dot"></span><span>${escapeHtml(m.loading)}</span></p><button class="secondary-button" type="button" id="native-cancel">${escapeHtml(m.cancel)}</button></main>`,
    nonce,
    externalScript: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
    script: `(() => {
      const copy = ${clientCopy};
      const siteKey = ${siteKey};
      const status = document.getElementById('native-status');
      const setStatus = (value) => { status.lastElementChild.textContent = value; };
      const fail = () => setStatus(copy.failed);
      document.getElementById('native-cancel').addEventListener('click', () => location.replace('purelink-native://cancel'));
      const complete = async (turnstileToken) => {
        try {
          const response = await fetch('/api/native/challenge/complete', {
            method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ turnstileToken }),
          });
          const payload = await response.json();
          if (!response.ok || !/^[A-Za-z0-9_-]{43}$/.test(payload.nativeCreateToken || '')) throw new Error('verification failed');
          location.replace('purelink-native://verified?token=' + encodeURIComponent(payload.nativeCreateToken));
        } catch { fail(); }
      };
      window.addEventListener('load', () => {
        if (!siteKey || !window.turnstile) { fail(); return; }
        window.turnstile.render('#native-turnstile', {
          sitekey: siteKey, action: 'native-card-create', callback: complete,
          'error-callback': fail, 'expired-callback': fail,
        });
      });
    })();`,
  });
}

function documentShell({ title, description, body, robots = 'noindex, nofollow', locale = 'zh-Hant', canonicalPath = '', script = '', nonce = '', externalScript = '', externalScripts = [] }) {
  const scriptMarkup = script ? `<script nonce="${escapeHtml(nonce)}">${script}</script>` : '';
  const scripts = [externalScript, ...externalScripts].filter(Boolean);
  const canonicalUrl = canonicalPath ? `https://no-no.uk${canonicalPath}` : '';
  const canonicalMarkup = canonicalUrl ? `<link rel="canonical" href="${escapeHtml(canonicalUrl)}">` : '';
  const alternatePath = canonicalPath.replace(/^\/(?:zh-Hant|en)(?:\/|$)/, '/').replace(/^\/$/, '');
  const hreflangMarkup = canonicalUrl && !robots.includes('noindex') ? ['zh-Hant', 'en'].map((candidate) => `<link rel="alternate" hreflang="${candidate}" href="https://no-no.uk${localizedHref(candidate, alternatePath)}">`).join('') + `<link rel="alternate" hreflang="x-default" href="https://no-no.uk${localizedHref('en', alternatePath)}">` : '';
  const externalScriptMarkup = scripts.map((source) => source.startsWith('https://challenges.cloudflare.com/')
    ? `<script src="${escapeHtml(source)}" async defer></script>`
    : `<script type="module" src="${escapeHtml(source)}"></script>`).join('');
  return `<!doctype html>
<html lang="${escapeHtml(locale)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="${escapeHtml(robots)}">
  <meta name="theme-color" content="#e9f3eb">
  <meta property="og:site_name" content="PureLink">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="https://no-no.uk/og.png?v=1">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  ${canonicalUrl ? `<meta property="og:url" content="${escapeHtml(canonicalUrl)}">` : ''}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="https://no-no.uk/og.png?v=1">
  <title>${escapeHtml(title)}</title>
  ${canonicalMarkup}
  ${hreflangMarkup}
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="stylesheet" href="/assets/katex/katex.min.css">
  <style>
    :root { color-scheme: light; --ink: #17231f; --muted: #65716b; --line: #dce3df; --paper: #f7f8f5; --surface: rgba(255,255,255,.88); --green: #235c48; }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    body { margin: 0; min-height: 100vh; color: var(--ink); background: radial-gradient(circle at 15% 5%, #e4f0e8 0, transparent 28rem), var(--paper); font-family: ui-rounded, "SF Pro Rounded", "Avenir Next", system-ui, sans-serif; }
    a { color: inherit; }
    .home, .page { width: min(calc(100% - 2rem), 58rem); min-height: 100vh; margin: 0 auto; display: flex; flex-direction: column; justify-content: center; }
    .home { align-items: flex-start; padding: 5rem 0; }
    .page { padding: 3rem 0; }
    .eyebrow { margin: 0 0 1rem; color: var(--green); font-size: .75rem; font-weight: 750; letter-spacing: .18em; }
    h1 { max-width: 13ch; margin: 0; font-size: clamp(3rem, 9vw, 6.6rem); font-weight: 680; letter-spacing: -.06em; line-height: .94; }
    .lede { max-width: 35rem; margin: 1.75rem 0 0; color: var(--muted); font-size: clamp(1.05rem, 2.5vw, 1.35rem); line-height: 1.65; }
    .status { display: inline-flex; align-items: center; gap: .65rem; margin-top: 3rem; padding: .7rem 1rem; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); color: var(--muted); font-size: .86rem; }
    .status-dot { width: .55rem; height: .55rem; border-radius: 50%; background: #37a875; box-shadow: 0 0 0 .25rem #dff3e9; }
    .creator-home { width: min(calc(100% - 2rem), 68rem); gap: 4rem; }
    .account-entry { position: fixed; z-index: 20; top: max(1rem, env(safe-area-inset-top)); right: max(1rem, env(safe-area-inset-right)); }
    .account-entry a { display: inline-flex; align-items: center; justify-content: center; min-height: 2.7rem; padding: .7rem 1rem; border: 1px solid var(--line); border-radius: 999px; background: rgba(255,255,255,.9); box-shadow: 0 .65rem 2rem rgba(35,62,50,.1); color: var(--ink); text-decoration: none; font-size: .82rem; font-weight: 750; backdrop-filter: blur(18px); }
    .account-entry a:hover, .account-entry a:focus-visible { border-color: var(--green); background: white; }
    .language-switcher { display: flex; gap: .35rem; flex-wrap: wrap; margin-top: 1.2rem; }
    .language-switcher form { margin: 0; }
    .language-switcher button { width: auto; min-height: 2rem; padding: .35rem .6rem; border: 1px solid var(--line); background: transparent; color: var(--muted); font-size: .72rem; }
    .language-switcher button[aria-current="true"] { border-color: var(--green); color: var(--green); background: #edf7f1; }
    .hero { padding-top: 3rem; }
    .hero-summary { max-width: 42rem; margin: 1rem 0 0; color: var(--muted); font-size: .88rem; line-height: 1.65; }
    .onboarding-link { display: inline-block; margin-top: 1.2rem; color: var(--green); font-size: .82rem; text-decoration: none; }
    .onboarding-link:hover, .onboarding-link:focus-visible { text-decoration: underline; }
    .quick-open { width: 100%; padding: 1.1rem; border: 1px solid rgba(35,92,72,.2); border-radius: 1.45rem; background: rgba(255,255,255,.72); box-shadow: 0 1rem 3rem rgba(35,62,50,.07); backdrop-filter: blur(18px); }
    .quick-open-heading { display: flex; align-items: baseline; gap: .9rem; margin-bottom: .75rem; }
    .quick-open-heading .eyebrow { margin: 0; }
    .quick-open-heading h2 { font-size: 1rem; letter-spacing: -.02em; }
    .quick-open-form { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: stretch; gap: .55rem; }
    .quick-open-form input:not([type="checkbox"]) { min-height: 3.2rem; border-radius: 1rem; }
    .quick-open-form > button { width: auto; min-height: 3.2rem; padding: .7rem 1.15rem; border-color: var(--ink); background: var(--ink); color: white; white-space: nowrap; }
    .quick-preview-toggle { position: relative; min-width: 5.4rem; min-height: 3.2rem; display: grid; grid-template-columns: auto 1fr; grid-template-rows: 1fr 1fr; column-gap: .4rem; align-items: center; padding: .45rem .7rem; border: 1px solid var(--line); border-radius: 1rem; background: white; cursor: pointer; }
    .quick-preview-toggle input { grid-row: 1 / 3; margin: 0; }
    .quick-preview-toggle span { align-self: end; font-size: .95rem; font-weight: 850; line-height: 1; }
    .quick-preview-toggle small { align-self: start; color: var(--muted); font-size: .64rem; line-height: 1.2; white-space: nowrap; }
    .quick-preview-toggle:has(input:checked) { border-color: var(--green); background: #edf7f1; }
    .quick-open-status { margin: .65rem .2rem 0; color: #8f2f2a; font-size: .76rem; }
    .visually-hidden { position: absolute !important; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
    .creator-panel { width: 100%; }
    .auth-notice { width: 100%; display: flex; align-items: center; gap: .7rem 1rem; flex-wrap: wrap; padding: .9rem 1rem; border: 1px solid #d8ceb0; border-radius: 1rem; background: #fffaf0; color: #6d654f; font-size: .8rem; line-height: 1.5; }
    .auth-notice strong { color: var(--ink); }
    .auth-notice a { margin-left: auto; font-weight: 700; }
    .creator-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1.5rem; }
    h2 { margin: 0; font-size: clamp(1.7rem, 4vw, 2.5rem); letter-spacing: -.04em; }
    .suggestion { width: auto; padding: .55rem .8rem; border: 1px solid #bed8ca; background: #edf7f1; color: var(--green); font-size: .75rem; }
    .type-tabs { display: grid; grid-template-columns: repeat(3, 1fr); gap: .65rem; margin-bottom: 1.6rem; }
    .mode-microcopy { display: none; flex-wrap: wrap; gap: .5rem 1.5rem; margin-bottom: 1.4rem; color: var(--muted); font-size: .78rem; line-height: 1.5; }
    .mode-microcopy span { display: none; }
    .mode-microcopy[data-active="url"],
    .mode-microcopy[data-active="formula"],
    .mode-microcopy[data-active="card"] { display: flex; }
    .mode-microcopy[data-active="url"] .microcopy-url,
    .mode-microcopy[data-active="formula"] .microcopy-formula,
    .mode-microcopy[data-active="card"] .microcopy-card { display: block; }
    .type-tab { display: flex; align-items: center; justify-content: center; gap: .5rem; border: 1px solid var(--line); background: transparent; color: var(--muted); }
    .type-tab span { font-size: 1.2rem; }
    .type-tab.active { border-color: var(--ink); background: var(--ink); color: white; }
    .field-label, legend { display: block; margin: 1rem 0 .55rem; color: var(--ink); font-size: .85rem; font-weight: 700; }
    textarea, input:not([type="checkbox"]):not([type="radio"]) { width: 100%; border: 1px solid var(--line); border-radius: 1.15rem; background: rgba(249,251,249,.9); color: var(--ink); font: inherit; outline: none; }
    select { width: 100%; padding: .9rem 1rem; border: 1px solid var(--line); border-radius: 1.15rem; background: rgba(249,251,249,.9); color: var(--ink); font: inherit; }
    textarea { min-height: 10rem; padding: 1.1rem; resize: vertical; line-height: 1.6; }
    input:not([type="checkbox"]):not([type="radio"]) { padding: .9rem 1rem; }
    textarea:focus, input:focus { border-color: var(--green); box-shadow: 0 0 0 .2rem rgba(35,92,72,.1); }
    .field-meta { display: flex; justify-content: space-between; gap: 1rem; margin-top: .5rem; color: var(--muted); font-size: .74rem; line-height: 1.45; }
    .field-meta span:first-child { max-width: 38rem; }
    .field-meta span:last-child { white-space: nowrap; }
    .content-workspace.formula-mode { display: grid; grid-template-columns: minmax(0, 1fr) minmax(16rem, .85fr); gap: 1rem; align-items: stretch; }
    .content-input-pane { min-width: 0; }
    .formula-preview { min-height: 11rem; margin-top: 1.75rem; padding: 1rem; border: 1px solid var(--line); border-radius: 1.2rem; background: #f8fbf9; overflow: auto; }
    .preview-label { display: block; margin-bottom: .75rem; color: var(--green); font-size: .7rem; font-weight: 750; letter-spacing: .12em; }
    .formula-preview p { margin: 1.5rem 0; color: var(--muted); font-size: .82rem; line-height: 1.6; }
    .formula-preview-rendered { min-height: 7rem; display: flex; flex-direction: column; justify-content: center; overflow: auto; line-height: 1.8; }
    .formula-tools { margin: .4rem 0 1.2rem; padding: 1rem; border: 1px solid var(--line); border-radius: 1.2rem; background: #f8fbf9; }
    .formula-tool-heading { display: flex; justify-content: space-between; gap: 1rem; margin-bottom: .8rem; font-size: .78rem; }
    .formula-tool-heading span { color: var(--muted); }
    .formula-ai { margin: 0 0 .9rem; padding: .85rem; border: 1px solid #bdd7cb; border-radius: 1rem; background: #edf5f1; }
    .formula-ai summary { display: flex; justify-content: space-between; gap: 1rem; cursor: pointer; font-weight: 800; }
    .formula-ai summary span { color: var(--green); font-size: .72rem; white-space: nowrap; }
    .formula-ai > p { margin: .65rem 0; color: var(--muted); font-size: .75rem; line-height: 1.6; }
    .formula-ai-compose { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .6rem; align-items: stretch; }
    .formula-ai-compose textarea { min-height: 5.4rem; }
    .formula-ai-compose button { width: auto; min-width: 8rem; border: 0; background: var(--ink); color: white; }
    .formula-ai-status { margin: .65rem 0 0; color: var(--green); font-size: .76rem; }
    .formula-ai-status[data-error="true"] { color: #8f2f2a; }
    .formula-ai-result { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .65rem; align-items: center; margin-top: .75rem; padding: .85rem; border: 1px solid var(--line); border-radius: .9rem; background: white; }
    .formula-ai-preview { grid-column: 1 / -1; min-height: 4rem; display: grid; place-items: center; overflow-x: auto; }
    .formula-ai-result code { min-width: 0; padding: .65rem; border-radius: .6rem; background: #f5f7f6; overflow-wrap: anywhere; white-space: pre-wrap; }
    .formula-ai-result button { width: auto; white-space: nowrap; }
    .formula-category-tabs { display: flex; gap: .4rem; margin: 0 -.1rem .75rem; padding: .1rem; overflow-x: auto; scrollbar-width: thin; }
    .formula-category-tabs button { width: auto; flex: 0 0 auto; min-height: 2.35rem; padding: .48rem .78rem; border: 1px solid var(--line); border-radius: 999px; background: white; color: var(--muted); font-size: .75rem; }
    .formula-category-tabs button[aria-selected="true"] { border-color: var(--ink); background: var(--ink); color: white; }
    .custom-formula-shortcuts { margin-top: .9rem; padding-top: .8rem; border-top: 1px solid var(--line); }
    .custom-formula-shortcuts summary { cursor: pointer; font-weight: 800; }
    .custom-formula-shortcuts > p { margin: .45rem 0 .75rem; color: var(--muted); font-size: .76rem; }
    .custom-formula-fields { display: grid; grid-template-columns: minmax(7rem, .55fr) minmax(12rem, 1.45fr) auto; gap: .55rem; align-items: end; }
    .custom-formula-fields label { display: grid; gap: .3rem; color: var(--muted); font-size: .72rem; }
    .custom-formula-fields input { min-height: 2.65rem; }
    .custom-formula-fields button { width: auto; min-height: 2.65rem; padding: .55rem 1rem; }
    .custom-formula-list { display: flex; flex-wrap: wrap; gap: .45rem; margin-top: .75rem; }
    .custom-formula-item { display: inline-flex; align-items: stretch; border: 1px solid var(--line); border-radius: .8rem; overflow: hidden; background: white; }
    .custom-formula-item button { width: auto; min-height: 2.5rem; border: 0; border-radius: 0; background: white; }
    .custom-formula-item [data-custom-formula-insert] { padding: .5rem .8rem; font-family: Georgia, serif; font-weight: 800; }
    .custom-formula-item [data-custom-formula-remove] { padding: .5rem .65rem; border-left: 1px solid var(--line); color: var(--muted); }
    .custom-formula-status[data-error="true"] { color: #8f2f2a; }
    .symbol-groups { display: grid; gap: .55rem; }
    .symbol-group { display: flex; flex-wrap: wrap; gap: .4rem; }
    .symbol-group button { width: auto; min-width: 2.55rem; padding: .55rem .7rem; border: 1px solid var(--line); border-radius: .7rem; background: white; color: var(--ink); font-family: ui-serif, Georgia, serif; font-size: .88rem; }
    .symbol-group button:hover, .symbol-group button:focus-visible { border-color: var(--green); background: #edf5f1; }
    .conditional-options { margin-top: 1.25rem; padding: .25rem 1rem; border: 1px solid var(--line); border-radius: 1.15rem; }
    .tracking-rules { padding: .85rem 0; border-bottom: 1px solid var(--line); color: var(--muted); }
    .tracking-rules summary { cursor: pointer; color: var(--ink); font-size: .8rem; font-weight: 700; }
    .tracking-rules p { margin: .65rem 0; font-size: .74rem; line-height: 1.55; }
    .tracking-rules .field-label { margin-top: .75rem; }
    .check-row { display: flex; align-items: flex-start; gap: .8rem; padding: .9rem 0; border-bottom: 1px solid var(--line); cursor: pointer; }
    .check-row:last-child { border-bottom: 0; }
    .check-row input { margin-top: .2rem; accent-color: var(--green); }
    .check-row span { display: grid; gap: .2rem; }
    .check-row small { color: var(--muted); line-height: 1.45; }
    .theme-picker { margin: 1rem 0; padding: 0; border: 0; }
    .theme-picker div { display: flex; }
    .theme-picker label { display: inline-block; margin-right: .5rem; cursor: pointer; }
    .theme-picker input { position: absolute; opacity: 0; pointer-events: none; }
    .theme-swatch { display: inline-block; padding: .65rem .85rem; border: 2px solid transparent; border-radius: 999px; font-size: .8rem; }
    .theme-picker input:checked + .theme-swatch { border-color: var(--green); }
    .paper-swatch { background: #f7f5ee; color: #38372f; }
    .mist-swatch { background: #dfece8; color: #345b53; }
    .night-swatch { background: #1b252b; color: #edf4f0; }
    .advanced-options { margin: 1rem 0; padding: .85rem 0; color: var(--muted); }
    .advanced-options summary { cursor: pointer; font-size: .85rem; font-weight: 650; }
    .create-button { border: 1px solid var(--ink); background: var(--ink); color: white; }
    .privacy-note { margin: .85rem 0 0; color: var(--muted); font-size: .72rem; line-height: 1.5; text-align: center; }
    .turnstile-wrap { display: flex; justify-content: center; margin: 1rem 0; }
    .form-error { padding: .85rem 1rem; border-radius: 1rem; background: #fff0ee; color: #8a322c; font-size: .85rem; }
    .result-panel h2 { margin-bottom: 1.25rem; }
    .result-label { display: block; margin-bottom: .45rem; color: var(--muted); font-size: .72rem; font-weight: 700; }
    .result-url { display: block; padding: 1rem; border-radius: 1rem; background: #edf2ef; font-family: ui-monospace, "SFMono-Regular", monospace; overflow-wrap: anywhere; }
    .result-actions { display: grid; grid-template-columns: repeat(3, 1fr); gap: .75rem; margin-top: .8rem; }
    .recovery-actions { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem; margin-top: .8rem; }
    .copy-status { min-height: 1.2rem; margin: .55rem 0 0; color: var(--muted); font-size: .72rem; overflow-wrap: anywhere; }
    .secondary-link { display: flex; align-items: center; justify-content: center; padding: .95rem 1.1rem; border: 1px solid var(--line); border-radius: 999px; text-decoration: none; font-weight: 700; }
    .recovery-box { margin-top: 2rem; padding: 1.2rem; border: 1px solid #d8ceb0; border-radius: 1.2rem; background: #fffaf0; }
    .recovery-box p { margin: .5rem 0; color: #6d654f; font-size: .82rem; line-height: 1.55; }
    .quiet-button { margin-top: 1.25rem; border: 0; background: transparent; color: var(--muted); }
    .home-footer { padding-bottom: 3rem; color: var(--muted); font-size: .75rem; line-height: 1.6; }
    .home-footer nav { display: flex; flex-wrap: wrap; gap: 1rem; }
    .legal-nav { display: flex; flex-wrap: wrap; gap: .6rem 1rem; margin-top: 2rem; padding-top: 1.25rem; border-top: 1px solid var(--line); color: var(--muted); font-size: .78rem; }
    .wordmark { width: fit-content; margin-bottom: 1.2rem; text-decoration: none; font-weight: 750; }
    .panel { padding: clamp(1.4rem, 5vw, 3.5rem); border: 1px solid var(--line); border-radius: 2rem; background: var(--surface); box-shadow: 0 1.5rem 5rem rgba(35, 62, 50, .08); backdrop-filter: blur(18px); }
    .preview-panel h1 { max-width: none; font-size: clamp(2rem, 6vw, 4.5rem); overflow-wrap: anywhere; }
    .destination-url { margin: 1.5rem 0; padding: 1rem; border-radius: 1rem; background: #edf2ef; color: #435149; font-family: ui-monospace, "SFMono-Regular", monospace; overflow-wrap: anywhere; }
    .facts { margin: 1.5rem 0 2rem; border-block: 1px solid var(--line); }
    .facts p { display: grid; grid-template-columns: minmax(7rem, .4fr) 1fr; gap: 1rem; margin: 0; padding: 1rem 0; border-bottom: 1px solid var(--line); }
    .facts p:last-child { border-bottom: 0; }
    .facts span { color: var(--muted); }
    .primary-link { display: inline-flex; justify-content: center; padding: .95rem 1.25rem; border-radius: 999px; background: var(--ink); color: white; text-decoration: none; font-weight: 700; }
    .primary-link.compact { margin-top: 2rem; }
    .shared-content { margin: 2rem 0; white-space: pre-wrap; overflow-wrap: anywhere; }
    .formula-rendered { font-size: clamp(1.05rem, 3vw, 1.45rem); line-height: 1.8; text-align: center; }
    .formula-source { margin: .75rem 0 0; padding: 1.25rem; border-radius: 1.25rem; background: #edf2ef; font-size: .88rem; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; }
    .source-details { margin-top: 1.5rem; color: var(--muted); }
    .source-details summary { cursor: pointer; font-weight: 650; }
    .share-export { padding: clamp(1.2rem, 4vw, 2.5rem); border-radius: 1.4rem; background: #fff; color: var(--ink); }
    .formula-export { min-height: 14rem; display: flex; flex-direction: column; justify-content: center; }
    .card-export { min-height: 20rem; display: flex; flex-direction: column; justify-content: center; }
    .content-actions { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem; margin-top: 1rem; }
    .export-brand-option { display: flex; gap: .7rem; margin-top: 1rem; padding: .9rem 1rem; border: 1px solid var(--line); border-radius: 1rem; cursor: pointer; }
    .export-brand-option input { margin-top: .15rem; accent-color: var(--green); }
    .export-brand-option span { display: grid; gap: .2rem; }
    .export-brand-option small { color: var(--muted); line-height: 1.45; }
    .card-copy { font-family: ui-serif, "New York", Georgia, serif; font-size: clamp(1.35rem, 4vw, 2.2rem); line-height: 1.7; }
    .signature { margin: 1.5rem 0 0; color: var(--muted); text-align: right; }
    .notice { margin: 2.5rem 0 0; color: var(--muted); font-size: .78rem; line-height: 1.6; }
    .report-link { display: inline-block; margin-top: 1rem; color: var(--muted); font-size: .75rem; }
    .manage-title { max-width: 16ch; font-size: clamp(2.4rem, 7vw, 5rem); }
    .manage-lede { margin-bottom: 2rem; }
    .legal-page { max-width: 52rem; }
    .legal-title { max-width: 15ch; font-size: clamp(2.5rem, 7vw, 5.4rem); }
    .legal-intro { margin-bottom: 2.5rem; }
    .legal-sections { display: grid; gap: 2rem; }
    .legal-sections section { padding-top: 2rem; border-top: 1px solid var(--line); }
    .legal-sections h2 { font-size: 1.2rem; letter-spacing: -.02em; }
    .legal-sections p { margin: .7rem 0 0; color: var(--muted); line-height: 1.8; }
    .legal-updated { margin: 2.5rem 0 0; color: var(--muted); font-size: .75rem; }
    .manage-actions { display: grid; gap: .75rem; }
    .managed-content-card { display: grid; grid-template-columns: auto 1fr auto; gap: .8rem; align-items: center; margin: 1.5rem 0; padding: 1rem; border: 1px solid var(--line); border-radius: 1.2rem; background: #f8fbf9; }
    .managed-content-card span { color: var(--muted); font-size: .75rem; }
    .managed-content-card .primary-link { padding: .7rem 1rem; }
    .account-connect { display: grid; gap: .7rem; margin: 1rem 0 1.5rem; padding: 1rem; border-radius: 1.2rem; background: #edf5f1; }
    .account-connect p { margin: 0; color: var(--muted); line-height: 1.55; }
    .google-link { display: flex; justify-content: center; padding: .85rem 1rem; border: 1px solid var(--line); border-radius: 999px; background: white; text-decoration: none; font-weight: 700; }
    .account-links { display: grid; gap: .7rem; margin: 0 0 1.5rem; padding: 0; list-style: none; }
    .account-credits { display: grid; gap: .65rem; margin: 1.2rem 0; padding: 1rem; border: 1px solid #bdd7cb; border-radius: 1.2rem; background: #edf5f1; }
    .account-credits h2, .account-credits p { margin: 0; }
    .account-credits h2 { font-size: clamp(1.15rem, 3vw, 1.65rem); }
    .account-credits > p { color: var(--muted); line-height: 1.55; }
    .account-credits button { width: 100%; border: 0; background: var(--ink); color: white; }
    .credit-pack-list { display: grid; gap: .65rem; }
    .credit-pack { display: grid; gap: .35rem; padding: .8rem; border: 1px solid #bdd7cb; border-radius: .9rem; background: rgba(255,255,255,.58); }
    .credit-pack > span, .credit-pack > small { color: var(--muted); }
    .provider-choices { display: grid; gap: .45rem; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); }
    .provider-choices button { margin: 0; }
    .support-totals { display: grid; gap: .25rem; padding: 1rem; border-radius: 1rem; background: #edf5f1; border: 1px solid #bdd7cb; }
    .support-totals strong { font-size: 1.5rem; }
    .billing-status { color: var(--green); font-size: .78rem; }
    .billing-status[data-error="true"] { color: #8f2f2a; }
    .account-links li { display: grid; grid-template-columns: 1fr auto auto; gap: .8rem; align-items: center; padding: 1rem; border: 1px solid var(--line); border-radius: 1rem; }
    .account-links li div { display: grid; gap: .2rem; }
    .account-links li span { color: var(--muted); font-size: .72rem; }
    .account-links .empty-account { display: block; color: var(--muted); }
    .start-page { justify-content: flex-start; padding-top: 5rem; }
    .start-panel { max-width: 44rem; }
    .start-intro { max-width: 18ch; margin: 0; font-size: clamp(2.2rem, 6vw, 4rem); letter-spacing: -.05em; }
    .start-no-account { margin: 1rem 0 0; color: var(--muted); font-size: clamp(.95rem, 2vw, 1.1rem); line-height: 1.65; }
    .start-section { margin: 2rem 0 0; }
    .start-section h2 { margin: 0 0 .75rem; font-size: .9rem; font-weight: 700; letter-spacing: .04em; }
    .start-examples { margin: 0; padding: 0 0 0 1.2rem; color: var(--muted); font-size: .88rem; line-height: 1.9; }
    .start-examples li { margin: .35rem 0; }
    .example-url::before { content: '↗ '; color: var(--green); }
    .example-formula::before { content: '∑ '; color: var(--green); }
    .example-card::before { content: '✦ '; color: var(--green); }
    .start-closing { margin: 2rem 0 1.5rem; color: var(--muted); font-size: .88rem; line-height: 1.7; }
    .start-panel .primary-link { display: inline-flex; text-decoration: none; }
    button { width: 100%; padding: .95rem 1.1rem; border-radius: 999px; font: inherit; font-weight: 700; cursor: pointer; }
    button:disabled { cursor: wait; opacity: .55; }
    .secondary-button { border: 1px solid var(--line); background: transparent; color: var(--ink); }
    .danger-button { margin-top: .5rem; border: 1px solid #d7aaa7; background: #fff4f2; color: #8a322c; }
    .theme-mist { --paper: #edf4f2; --surface: rgba(247,252,250,.9); --green: #426e68; }
    .theme-night { color-scheme: dark; --paper: #141b20; --surface: rgba(28,38,44,.92); --ink: #edf4f0; --muted: #a8b7b0; --line: #3a4843; --green: #91cbb4; }
    .theme-mist .card-export { background: #e6f0ed; }
    .theme-night .card-export { background: #1b252b; }
    @media (max-width: 46rem) { .content-workspace.formula-mode { grid-template-columns: 1fr; } .formula-preview { margin-top: 0; } }
    @media (max-width: 38rem) { .account-entry a { min-height: 2.5rem; padding: .6rem .85rem; } .facts p { grid-template-columns: 1fr; gap: .35rem; } .panel { border-radius: 1.35rem; } .creator-heading, .formula-tool-heading { display: grid; } .quick-open-form { grid-template-columns: auto 1fr; } .quick-open-form > button { grid-column: 1 / -1; } .formula-ai-compose, .formula-ai-result, .custom-formula-fields { grid-template-columns: 1fr; } .formula-ai-compose button, .formula-ai-result button { width: 100%; } .type-tabs { gap: .4rem; } .field-meta { display: grid; } .result-actions, .recovery-actions, .content-actions { grid-template-columns: 1fr; } .managed-content-card { grid-template-columns: 1fr; } .account-links li { grid-template-columns: 1fr auto; } }
  </style>
</head>
<body>${body}${clientMessagesMarkup(locale)}${scriptMarkup}${externalScriptMarkup}</body>
</html>`;
}

function formatDate(value, locale = 'en') {
  if (!value) return 'Unknown';
  const date = new Date(value.endsWith?.('Z') ? value : `${value}Z`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
}

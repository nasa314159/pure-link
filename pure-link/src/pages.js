import { escapeHtml } from './http.js';

const PLATFORM_NOTICE = 'Shared content and destination sites are provided by their creators. They do not represent PureLink’s views, endorsement, or guarantee of safety.';

export function renderHomePage() {
  return documentShell({
    title: 'PureLink — Share clearly',
    description: 'A quiet, privacy-minded way to share a URL, a formula, or a small card.',
    body: `
      <main class="home">
        <p class="eyebrow">PURELINK</p>
        <h1>Share clearly.<br>Leave less behind.</h1>
        <p class="lede">A quiet way to pass along a URL, a formula, or a few meaningful words.</p>
        <section class="status" aria-label="Development status">
          <span class="status-dot" aria-hidden="true"></span>
          Local MVP foundation is operational
        </section>
      </main>
    `,
  });
}

export function renderUrlPreview(link) {
  const destination = new URL(link.content);
  const affiliate = Number(link.is_affiliate) === 1;
  return documentShell({
    title: `Preview ${destination.hostname} — PureLink`,
    description: 'Review a PureLink destination before continuing.',
    robots: 'noindex, nofollow, noarchive',
    body: `
      <main class="page">
        <a class="wordmark" href="/">PureLink</a>
        <article class="panel preview-panel">
          <p class="eyebrow">DESTINATION PREVIEW</p>
          <h1 class="destination-host">${escapeHtml(destination.hostname)}</h1>
          <p class="destination-url">${escapeHtml(destination.toString())}</p>
          <div class="facts">
            <p><strong>Connection</strong><span>${destination.protocol === 'https:' ? 'HTTPS' : 'HTTP — not encrypted'}</span></p>
            <p><strong>Shared</strong><span>${escapeHtml(formatDate(link.created_at))}</span></p>
            <p><strong>Referral</strong><span>${affiliate ? 'Creator says this may provide referral or affiliate benefit.' : 'Creator did not declare an affiliate relationship.'}</span></p>
          </div>
          <a class="primary-link" href="${escapeHtml(destination.toString())}" rel="noreferrer">Continue to destination</a>
          <p class="notice">${escapeHtml(PLATFORM_NOTICE)} This preview is informational and is not a security certification.</p>
        </article>
      </main>
    `,
  });
}

export function renderFormulaPage(link) {
  return documentShell({
    title: 'Formula — PureLink',
    description: 'A formula shared with PureLink.',
    robots: 'noindex, nofollow, noarchive',
    body: `
      <main class="page">
        <a class="wordmark" href="/">PureLink</a>
        <article class="panel content-panel">
          <p class="eyebrow">FORMULA</p>
          <pre class="shared-content formula-source">${escapeHtml(link.content)}</pre>
          <p class="notice">${escapeHtml(PLATFORM_NOTICE)}</p>
        </article>
      </main>
    `,
  });
}

export function renderCardPage(link) {
  const signature = link.signature ? `<p class="signature">— ${escapeHtml(link.signature)}</p>` : '';
  return documentShell({
    title: 'A small card — PureLink',
    description: 'A small card shared with PureLink.',
    robots: 'noindex, nofollow, noarchive',
    body: `
      <main class="page card-page theme-${escapeHtml(link.theme || 'paper')}">
        <a class="wordmark" href="/">PureLink</a>
        <article class="panel content-panel card-panel">
          <p class="eyebrow">A SMALL CARD</p>
          <p class="shared-content card-copy">${escapeHtml(link.content)}</p>
          ${signature}
          <p class="notice">${escapeHtml(PLATFORM_NOTICE)}</p>
        </article>
      </main>
    `,
  });
}

export function renderManagePage(slug, nonce) {
  const safeSlugScript = JSON.stringify(slug).replaceAll('<', '\\u003c');
  return documentShell({
    title: 'Manage your PureLink',
    description: 'Manage an anonymous PureLink using its private management credential.',
    robots: 'noindex, nofollow, noarchive',
    body: `
      <main class="page">
        <a class="wordmark" href="/">PureLink</a>
        <article class="panel manage-panel">
          <p class="eyebrow">ANONYMOUS MANAGEMENT</p>
          <h1 class="manage-title">Keep this access safe.</h1>
          <p class="lede manage-lede">PureLink does not know who created this link. Save this management address now; it cannot be recovered if both this browser and your copy are lost.</p>
          <div class="manage-actions" id="manage-actions" hidden>
            <button class="secondary-button" id="copy-management" type="button">Copy management address</button>
            <button class="secondary-button" id="download-recovery" type="button">Download recovery file</button>
            <button class="danger-button" id="delete-link" type="button">Delete this PureLink</button>
          </div>
          <p class="notice" id="management-status" role="status">Checking this browser for management access…</p>
        </article>
      </main>
    `,
    script: `
      const slug = ${safeSlugScript};
      const storageKey = 'purelink:management:' + slug;
      const fragmentToken = location.hash.slice(1);
      if (fragmentToken) localStorage.setItem(storageKey, fragmentToken);
      const token = fragmentToken || localStorage.getItem(storageKey) || '';
      const actions = document.getElementById('manage-actions');
      const status = document.getElementById('management-status');
      const canonicalAddress = location.origin + '/manage/' + encodeURIComponent(slug) + '#' + token;

      if (token) {
        actions.hidden = false;
        status.textContent = 'Management access is available on this device.';
      } else {
        status.textContent = 'No management credential was found. PureLink cannot recover an anonymous credential.';
      }

      document.getElementById('copy-management').addEventListener('click', async (event) => {
        await navigator.clipboard.writeText(canonicalAddress);
        const button = event.currentTarget;
        button.textContent = 'Copied';
        setTimeout(() => { button.textContent = 'Copy management address'; }, 1600);
      });

      document.getElementById('download-recovery').addEventListener('click', () => {
        const recoveryText = 'PureLink anonymous management credential\\n\\n' + canonicalAddress + '\\n\\nKeep this file private. PureLink cannot recover this credential.\\n';
        const anchor = document.createElement('a');
        anchor.download = 'purelink-' + slug + '-recovery.txt';
        anchor.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(recoveryText);
        anchor.click();
      });

      let deleteArmed = false;
      document.getElementById('delete-link').addEventListener('click', async (event) => {
        const button = event.currentTarget;
        if (!deleteArmed) {
          deleteArmed = true;
          button.textContent = 'Press again to permanently delete';
          setTimeout(() => { deleteArmed = false; button.textContent = 'Delete this PureLink'; }, 5000);
          return;
        }

        button.disabled = true;
        const response = await fetch('/api/links/' + encodeURIComponent(slug), {
          method: 'DELETE',
          headers: { authorization: 'Bearer ' + token },
        });
        if (response.ok) {
          localStorage.removeItem(storageKey);
          actions.hidden = true;
          history.replaceState(null, '', location.pathname);
          status.textContent = 'This PureLink has been permanently deleted.';
        } else {
          button.disabled = false;
          deleteArmed = false;
          button.textContent = 'Delete this PureLink';
          status.textContent = 'Deletion failed. Check the management address and try again.';
        }
      });
    `,
    nonce,
  });
}

export function renderNotFoundPage() {
  return documentShell({
    title: 'Not found — PureLink',
    description: 'This PureLink could not be found.',
    robots: 'noindex, nofollow',
    body: `
      <main class="home">
        <p class="eyebrow">404</p>
        <h1>This PureLink is not here.</h1>
        <p class="lede">It may have been removed, expired, or typed incorrectly.</p>
        <a class="primary-link compact" href="/">Return home</a>
      </main>
    `,
  });
}

function documentShell({ title, description, body, robots = 'noindex, nofollow', script = '', nonce = '' }) {
  const scriptMarkup = script ? `<script nonce="${escapeHtml(nonce)}">${script}</script>` : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="${escapeHtml(robots)}">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; --ink: #17231f; --muted: #65716b; --line: #dce3df; --paper: #f7f8f5; --surface: rgba(255,255,255,.88); --green: #235c48; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; color: var(--ink); background: radial-gradient(circle at 15% 5%, #e4f0e8 0, transparent 28rem), var(--paper); font-family: ui-rounded, "SF Pro Rounded", "Avenir Next", system-ui, sans-serif; }
    a { color: inherit; }
    .home, .page { width: min(100% - 2rem, 58rem); min-height: 100vh; margin: 0 auto; display: flex; flex-direction: column; justify-content: center; }
    .home { align-items: flex-start; padding: 5rem 0; }
    .page { padding: 3rem 0; }
    .eyebrow { margin: 0 0 1rem; color: var(--green); font-size: .75rem; font-weight: 750; letter-spacing: .18em; }
    h1 { max-width: 13ch; margin: 0; font-size: clamp(3rem, 9vw, 6.6rem); font-weight: 680; letter-spacing: -.06em; line-height: .94; }
    .lede { max-width: 35rem; margin: 1.75rem 0 0; color: var(--muted); font-size: clamp(1.05rem, 2.5vw, 1.35rem); line-height: 1.65; }
    .status { display: inline-flex; align-items: center; gap: .65rem; margin-top: 3rem; padding: .7rem 1rem; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); color: var(--muted); font-size: .86rem; }
    .status-dot { width: .55rem; height: .55rem; border-radius: 50%; background: #37a875; box-shadow: 0 0 0 .25rem #dff3e9; }
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
    .formula-source { padding: 1.25rem; border-radius: 1.25rem; background: #edf2ef; font-size: clamp(1rem, 3vw, 1.5rem); line-height: 1.6; text-align: center; }
    .card-copy { font-family: ui-serif, "New York", Georgia, serif; font-size: clamp(1.35rem, 4vw, 2.2rem); line-height: 1.7; }
    .signature { margin: 1.5rem 0 0; color: var(--muted); text-align: right; }
    .notice { margin: 2.5rem 0 0; color: var(--muted); font-size: .78rem; line-height: 1.6; }
    .manage-title { max-width: 16ch; font-size: clamp(2.4rem, 7vw, 5rem); }
    .manage-lede { margin-bottom: 2rem; }
    .manage-actions { display: grid; gap: .75rem; }
    button { width: 100%; padding: .95rem 1.1rem; border-radius: 999px; font: inherit; font-weight: 700; cursor: pointer; }
    button:disabled { cursor: wait; opacity: .55; }
    .secondary-button { border: 1px solid var(--line); background: transparent; color: var(--ink); }
    .danger-button { margin-top: .5rem; border: 1px solid #d7aaa7; background: #fff4f2; color: #8a322c; }
    .theme-mist { --paper: #edf4f2; --surface: rgba(247,252,250,.9); --green: #426e68; }
    .theme-night { color-scheme: dark; --paper: #141b20; --surface: rgba(28,38,44,.92); --ink: #edf4f0; --muted: #a8b7b0; --line: #3a4843; --green: #91cbb4; }
    @media (max-width: 38rem) { .facts p { grid-template-columns: 1fr; gap: .35rem; } .panel { border-radius: 1.35rem; } }
  </style>
</head>
<body>${body}${scriptMarkup}</body>
</html>`;
}

function formatDate(value) {
  if (!value) return 'Unknown';
  const date = new Date(value.endsWith?.('Z') ? value : `${value}Z`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
}

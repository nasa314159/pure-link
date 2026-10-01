// Anonymous-record activation for the canonical management surfaces.
//
// The server cannot see the fragment-stored anonymous credential on a public
// GET, so it renders the owner-manage section hidden and marks it with an
// allowlisting fingerprint: the first 16 base64url characters of the link's
// stored management hash. The fingerprint alone owns nothing — activation
// requires the locally stored credential (the existing anonymous-management
// mechanism: localStorage `purelink:management:<slug>`, filled exclusively
// at fragment-recovery time) to re-verify: its own SHA-256 fingerprint must
// match this page's allowlisting mark. Only then is the exact same
// section the server renders for session owners revealed as-is.
//
// The message bundle already embedded on the page (purelink-client-messages)
// provides the Delete-button label; the requested locale's
// manage.deleteThisLink is used. No credential value ever enters this DOM.

function readClientMessages(localeMessages) {
  if (localeMessages?.deleteThisLink) return localeMessages;
  try {
    const node = document.getElementById('purelink-client-messages');
    if (!node) return {};
    const bundle = JSON.parse(node.textContent || '{}');
    return bundle?.manage || {};
  } catch {
    return {};
  }
}

async function activateSection(section, localeMessages) {
  const slug = document.body.dataset.purelinkSlug || section.dataset.purelinkSlug || '';
  const publicFingerprint = document.body.dataset.purelinkOwnerFp || section.dataset.publicFingerprint || '';
  if (!slug || !publicFingerprint) return;
  let credential = '';
  try {
    credential = localStorage.getItem(`purelink:management:${slug}`) || '';
  } catch {
    return;
  }
  if (!credential) return;
  let observedFingerprint = '';
  try {
    const { hashManagementToken } = await import('/assets/hash-credential.js');
    observedFingerprint = (await hashManagementToken(credential)).slice(0, 16);
  } catch {
    return;
  }
  if (!observedFingerprint || observedFingerprint !== publicFingerprint) return;
  // Verified: reveal exactly this owner-manage section — identical markup,
  // styles, and delete flow the server renders for session owners. The
  // delete itself keeps going through the unchanged DELETE /api/links/<slug>
  // endpoint, which re-verifies the credential server-side.
  section.hidden = false;
  section.dataset.activated = 'true';
  const button = section.querySelector('.danger-button');
  if (button) {
    button.hidden = false;

    const messages = readClientMessages(localeMessages);
    if (messages.deleteThisLink) button.textContent = messages.deleteThisLink;
  }
  const status = section.querySelector('.notice');
  if (status) status.hidden = true;
}

export async function activateCanonicalOwnerSection(context = {}) {
  if (typeof document === 'undefined' || typeof localStorage === 'undefined') return;
  const sections = document.querySelectorAll('.content-manage[data-owner-section], .preview-manage[data-owner-section]');
  await Promise.all([...sections].map((section) => activateSection(section, context.localeMessages)));
  // The handoff flag is a temporary continuity signal, not part of the
  // canonical address: remove it from the visible URL once this page has
  // been evaluated (verified or not), so refreshes and copies stay clean.
  try {
    if (sections.length && new URLSearchParams(location.search).get('handoff') === '1') {
      history.replaceState(null, '', location.pathname + location.hash);
    }
  } catch { /* older browsers simply keep the query signal */ }
}

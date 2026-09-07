import { describe, expect, it } from 'vitest';
import { requireSameOrigin, requireSameOriginForFormPost, startGoogleAuth } from '../src/auth.js';

describe('Google account integration', () => {
  it('stays disabled until OAuth credentials are configured', async () => {
    const response = await startGoogleAuth(new Request('https://no-no.uk/auth/google'), { pure_link_db: new StateDb() });
    expect(response.status).toBe(503);
  });

  it('starts Google OIDC with PKCE and a short-lived state cookie', async () => {
    const db = new StateDb();
    const response = await startGoogleAuth(new Request('https://worker.test/auth/google?returnTo=/account'), {
      pure_link_db: db,
      GOOGLE_CLIENT_ID: 'client.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'secret',
      PUBLIC_ORIGIN: 'https://no-no.uk',
    });
    const location = new URL(response.headers.get('location'));
    expect(response.status).toBe(302);
    expect(location.origin).toBe('https://accounts.google.com');
    expect(location.searchParams.get('redirect_uri')).toBe('https://no-no.uk/auth/google/callback');
    expect(location.searchParams.get('scope')).toBe('openid email profile');
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(response.headers.get('set-cookie')).toContain('HttpOnly; Secure; SameSite=Lax');
    expect(response.headers.get('set-cookie')).toContain('Max-Age=1200');
    expect(db.values[2]).toBe('/account');
  });

  it('preserves the generic same-origin policy for non-logout consumers', () => {
    const env = { PUBLIC_ORIGIN: 'https://no-no.uk' };
    expect(requireSameOrigin(new Request('https://no-no.uk/auth/logout', {
      method: 'POST', headers: { 'sec-fetch-site': 'same-origin' },
    }), env)).toBe(true);
    expect(requireSameOrigin(new Request('https://no-no.uk/auth/logout', {
      method: 'POST', headers: { origin: 'null', 'sec-fetch-site': 'same-origin' },
    }), env)).toBe(false);
    expect(requireSameOrigin(new Request('https://no-no.uk/auth/logout', {
      method: 'POST', headers: { origin: 'null' },
    }), env)).toBe(false);
  });

  it('accepts an opaque or absent form-post Origin only with same-origin Fetch Metadata', () => {
    const env = { PUBLIC_ORIGIN: 'https://no-no.uk' };
    expect(requireSameOriginForFormPost(new Request('https://no-no.uk/auth/logout', {
      method: 'POST', headers: { origin: 'null', 'sec-fetch-site': 'same-origin' },
    }), env)).toBe(true);
    expect(requireSameOriginForFormPost(new Request('https://no-no.uk/auth/logout', {
      method: 'POST', headers: { 'sec-fetch-site': 'same-origin' },
    }), env)).toBe(true);
    expect(requireSameOriginForFormPost(new Request('https://no-no.uk/auth/logout', {
      method: 'POST', headers: { origin: 'null', 'sec-fetch-site': 'same-site' },
    }), env)).toBe(false);
  });

  it('rejects explicit cross-origin form posts even with conflicting metadata', () => {
    const request = new Request('https://no-no.uk/auth/logout', {
      method: 'POST', headers: { origin: 'https://attacker.example', 'sec-fetch-site': 'same-origin' },
    });
    expect(requireSameOriginForFormPost(request, { PUBLIC_ORIGIN: 'https://no-no.uk' })).toBe(false);
  });

  it('keeps opaque Origins rejected by the generic fetch API policy', () => {
    const request = new Request('https://no-no.uk/api/links', {
      method: 'POST', headers: { origin: 'null', 'sec-fetch-site': 'same-origin' },
    });
    expect(requireSameOrigin(request, { PUBLIC_ORIGIN: 'https://no-no.uk' })).toBe(false);
  });

  it('accepts the Safari opaque-Origin shared-page locale switch with same-origin metadata', () => {
    const env = { PUBLIC_ORIGIN: 'https://no-no.uk' };
    // Real Safari sends an opaque Origin for this same-origin form POST.
    const safari = new Request('https://no-no.uk/locale', {
      method: 'POST', headers: { origin: 'null', 'sec-fetch-site': 'same-origin' },
    });
    expect(requireSameOriginForFormPost(safari, env)).toBe(true);
    expect(requireSameOrigin(safari, env)).toBe(false);
    // Opaque Origin without browser-controlled same-origin metadata stays rejected.
    expect(requireSameOriginForFormPost(new Request('https://no-no.uk/locale', {
      method: 'POST', headers: { origin: 'null' },
    }), env)).toBe(false);
    // A real same-origin Origin keeps working for normal browsers.
    expect(requireSameOriginForFormPost(new Request('https://no-no.uk/locale', {
      method: 'POST', headers: { origin: 'https://no-no.uk' },
    }), env)).toBe(true);
  });
});

class StateDb {
  prepare() {
    return {
      bind: (...values) => {
        this.values = values;
        return { run: async () => ({ success: true }) };
      },
    };
  }
}

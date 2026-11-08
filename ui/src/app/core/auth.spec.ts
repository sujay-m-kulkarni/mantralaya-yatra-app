import { TestBed } from '@angular/core/testing';

import { ApiClient } from './api';
import { AuthError, AuthService, PostForm, REDIRECT_URI, Tokens, authorizeUrl, jwtClaims, pkceChallenge, toTokens } from './auth';
import { BrowserStore, MemoryStorage } from './store/browser-store';
import { LOCAL_STORE } from './tokens';

const SETTINGS = {
  authority: 'https://yatra.ciamlogin.com/11111111-1111-1111-1111-111111111111',
  clientId: 'app-client-id',
  scope: 'api://api-client-id/access_as_user',
};

/** A JWT with these claims, UTF-8 encoded as real ones are (signature not checked by the app). */
function jwt(claims: Record<string, unknown>): string {
  const part = (o: unknown) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${part({ alg: 'none' })}.${part(claims)}.sig`;
}

describe('auth helpers', () => {
  it('makes the RFC 7636 PKCE challenge', async () => {
    // The example in RFC 7636, appendix B.
    expect(await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('asks for a code, the API scope and a refresh token, with PKCE', () => {
    const url = new URL(authorizeUrl(SETTINGS, 'challenge', 'state-1'));
    expect(url.origin + url.pathname).toBe(`${SETTINGS.authority}/oauth2/v2.0/authorize`);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT_URI);
    expect(url.searchParams.get('scope')).toContain('offline_access');
    expect(url.searchParams.get('scope')).toContain(SETTINGS.scope);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBe('state-1');
  });

  it('reads who signed in from the tokens, including non-ASCII names', () => {
    const tokens = toTokens(
      { access_token: jwt({ email: 'a@x.in' }), refresh_token: 'r1', id_token: jwt({ email: 'ramesh@x.in', name: 'Rāmesh' }), expires_in: 3600 },
      1_000,
      null,
    );
    expect(tokens).toEqual({ accessToken: jasmine.any(String), refreshToken: 'r1', expiresAt: 3_601_000, email: 'ramesh@x.in', name: 'Rāmesh' });
    expect(jwtClaims('not a jwt')).toEqual({});
  });

  it("keeps the old refresh token when Entra doesn't send a new one, and explains a refusal", () => {
    const previous: Tokens = { accessToken: 'old', refreshToken: 'keep', expiresAt: 0, email: 'e@x.in', name: null };
    expect(toTokens({ access_token: jwt({}), expires_in: 60 }, 0, previous).refreshToken).toBe('keep');
    expect(() => toTokens({ error: 'invalid_grant', error_description: 'AADSTS70000: The grant expired.\nTrace ID: 1' }, 0, null)).toThrowError(
      AuthError,
      'AADSTS70000: The grant expired.',
    );
  });
});

describe('AuthService', () => {
  let auth: AuthService;
  let now: number;
  let calls: Record<string, string>[];
  let answer: () => { status: number; data: unknown };

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: LOCAL_STORE, useValue: new BrowserStore(new MemoryStorage(), 'auth') }] });
    auth = TestBed.inject(AuthService);
    auth.settings = SETTINGS;
    now = 1_000_000;
    auth.now = () => now;
    calls = [];
    answer = () => ({ status: 200, data: { access_token: jwt({}), refresh_token: 'r2', expires_in: 3600 } });
    const post: PostForm = async (_url, form) => {
      calls.push(form);
      return answer();
    };
    auth.postForm = post;
    await auth.init();
  });

  async function signedIn(expiresInMs: number): Promise<void> {
    const tokens: Tokens = { accessToken: 'a1', refreshToken: 'r1', expiresAt: now + expiresInMs, email: 'e@x.in', name: 'E' };
    await TestBed.inject(LOCAL_STORE).setMeta('auth_tokens', JSON.stringify(tokens));
    auth.tokens.set(tokens);
  }

  it('is off without settings, so developer builds use the dev header', () => {
    auth.settings = { authority: '', clientId: '', scope: '' };
    expect(auth.enabled).toBeFalse();
  });

  it('hands out the current token while it has time left', async () => {
    await signedIn(30 * 60_000);
    expect(await auth.accessToken()).toBe('a1');
    expect(calls.length).toBe(0);
  });

  it('refreshes once when the token is about to expire, even for several calls at once', async () => {
    await signedIn(60_000);
    const [a, b] = await Promise.all([auth.accessToken(), auth.accessToken()]);
    expect(a).toBe(b);
    expect(a).not.toBe('a1');
    expect(calls).toEqual([jasmine.objectContaining({ grant_type: 'refresh_token', refresh_token: 'r1', client_id: 'app-client-id' })]);
    expect(auth.tokens()!.refreshToken).toBe('r2');
  });

  it('signs out when Entra refuses the refresh token', async () => {
    await signedIn(0);
    answer = () => ({ status: 400, data: { error: 'invalid_grant', error_description: 'AADSTS700082: expired' } });
    expect(await auth.accessToken()).toBeNull();
    expect(auth.signedIn()).toBeFalse();
  });

  it('stays signed in when the refresh fails for lack of network', async () => {
    await signedIn(0);
    auth.postForm = async () => {
      throw new Error('offline');
    };
    expect(await auth.accessToken()).toBeNull();
    expect(auth.signedIn()).toBeTrue();
  });

  it('the API client sends the token, and asks to sign in when there is none', async () => {
    await signedIn(30 * 60_000);
    let sent: Record<string, string> = {};
    const api = new ApiClient({ baseUrl: 'https://api.test', getToken: () => auth.accessToken() }, async (_u, init) => {
      sent = init!.headers as Record<string, string>;
      return new Response('[]', { status: 200 });
    });
    await api.listYatras();
    expect(sent['Authorization']).toBe('Bearer a1');
    expect(sent['X-Dev-User']).toBeUndefined();

    await auth.signOut();
    await expectAsync(api.listYatras()).toBeRejectedWithError(/signed out/);
  });
});

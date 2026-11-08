// Sign-in with Microsoft Entra External ID: email and a one-time code, no passwords.
//
// The standard flow for phone apps (OAuth 2.0 authorization code with PKCE):
//  1. Open the tenant's sign-in page in a Chrome Custom Tab (not the web view, so the page is the real one).
//  2. The volunteer enters their email and the code Entra emails them.
//  3. Entra sends the browser to app.mantralayayatra://auth?code=..., which Android hands back to this app.
//  4. The app swaps the code (plus the PKCE secret only it knows) for tokens, over native HTTP: Entra refuses
//     token requests coming from a web view's origin for mobile app registrations.
// The access token is sent to the API; the refresh token gets a new one when it runs out, so volunteers sign in
// once. Tokens stay on the phone, in the app's private storage.

import { Injectable, computed, inject, signal } from '@angular/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { CapacitorHttp, PluginListenerHandle } from '@capacitor/core';

import { LOCAL_STORE } from './tokens';
import { AUTH_AUTHORITY, AUTH_CLIENT_ID, AUTH_SCOPE } from './version';

/** Registered on the Entra app as a "Mobile and desktop applications" redirect URI, and in AndroidManifest.xml. */
export const REDIRECT_URI = 'app.mantralayayatra://auth';

const STORE_KEY = 'auth_tokens';

/** Refresh this long before the access token expires, so a call never goes out with a dying token. */
const REFRESH_MARGIN_MS = 2 * 60_000;

export interface Tokens {
  accessToken: string;
  refreshToken: string | null;
  /** Epoch milliseconds. */
  expiresAt: number;
  email: string | null;
  name: string | null;
}

export interface AuthSettings {
  /** e.g. https://<tenant-subdomain>.ciamlogin.com/<tenant-id> */
  authority: string;
  clientId: string;
  /** The API's scope, e.g. api://<api-client-id>/access_as_user */
  scope: string;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number | string;
  error?: string;
  error_description?: string;
}

/** Posts a form natively; replaced in tests. */
export type PostForm = (url: string, form: Record<string, string>) => Promise<{ status: number; data: unknown }>;

const nativePostForm: PostForm = async (url, form) => {
  const response = await CapacitorHttp.post({
    url,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    data: form,
  });
  return { status: response.status, data: response.data };
};

export class AuthError extends Error {}

// ---- PKCE helpers ----

function base64Url(bytes: Uint8Array): string {
  let text = '';
  bytes.forEach((b) => (text += String.fromCharCode(b)));
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomString(byteCount = 32): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(byteCount)));
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

/** The claims in a JWT's middle part. Not verified: only used to show who is signed in. */
export function jwtClaims(token: string | undefined): Record<string, unknown> {
  const part = token?.split('.')[1];
  if (!part) return {};
  try {
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='));
    return JSON.parse(decodeURIComponent(escape(json))) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function authorizeUrl(settings: AuthSettings, challenge: string, state: string): string {
  const params = new URLSearchParams({
    client_id: settings.clientId,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    response_mode: 'query',
    scope: `openid offline_access email profile ${settings.scope}`,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  });
  return `${settings.authority}/oauth2/v2.0/authorize?${params}`;
}

/** Turns Entra's token answer into stored tokens; keeps the old refresh token if no new one was issued. */
export function toTokens(response: TokenResponse, now: number, previous: Tokens | null): Tokens {
  if (!response.access_token) {
    throw new AuthError(response.error_description?.split('\n')[0] || response.error || 'Sign-in did not return a token.');
  }
  const id = jwtClaims(response.id_token);
  const access = jwtClaims(response.access_token);
  const text = (v: unknown) => (typeof v === 'string' && v ? v : null);
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token ?? previous?.refreshToken ?? null,
    expiresAt: now + Number(response.expires_in ?? 3600) * 1000,
    email: text(id['email']) ?? text(access['email']) ?? previous?.email ?? null,
    name: text(id['name']) ?? previous?.name ?? null,
  };
}

/**
 * Who is signed in, and a fresh access token for each API call.
 * When this build has no sign-in settings (a developer build against a laptop API), `enabled` is false and the
 * app uses the API's Development header instead.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly store = inject(LOCAL_STORE);

  /** Replaced in tests. */
  settings: AuthSettings = { authority: AUTH_AUTHORITY, clientId: AUTH_CLIENT_ID, scope: AUTH_SCOPE };
  postForm: PostForm = nativePostForm;
  now: () => number = () => Date.now();

  readonly tokens = signal<Tokens | null>(null);
  readonly signedIn = computed(() => this.tokens() !== null);
  readonly email = computed(() => this.tokens()?.email ?? null);

  private loaded: Promise<void> | null = null;
  private refreshing: Promise<string | null> | null = null;

  get enabled(): boolean {
    return !!(this.settings.authority && this.settings.clientId && this.settings.scope);
  }

  init(): Promise<void> {
    this.loaded ??= this.store.getMeta(STORE_KEY).then((raw) => this.tokens.set(raw ? (JSON.parse(raw) as Tokens) : null));
    return this.loaded;
  }

  /** Opens the sign-in page and waits for Entra to send the volunteer back. */
  async signIn(): Promise<Tokens> {
    if (!this.enabled) throw new AuthError('This build has no sign-in settings (app.config.json).');
    const verifier = randomString(48);
    const state = randomString(16);
    const challenge = await pkceChallenge(verifier);

    let resolveCode!: (code: string) => void;
    let rejectCode!: (error: Error) => void;
    const answer = new Promise<string>((resolve, reject) => {
      resolveCode = resolve;
      rejectCode = reject;
    });
    let finished = false;

    const handles: PluginListenerHandle[] = [
      await App.addListener('appUrlOpen', ({ url }) => {
        if (!url.startsWith(REDIRECT_URI)) return;
        finished = true;
        const query = new URL(url.replace(REDIRECT_URI, 'https://redirect.invalid/auth')).searchParams;
        if (query.get('state') !== state) rejectCode(new AuthError('The sign-in answer did not match this request. Try again.'));
        else if (query.get('error')) rejectCode(new AuthError(query.get('error_description')?.split('\n')[0] || query.get('error')!));
        else resolveCode(query.get('code') ?? '');
        void Browser.close().catch(() => undefined);
      }),
      await Browser.addListener('browserFinished', () => {
        // The volunteer closed the sign-in page; give a redirect that is on its way a moment to arrive first.
        setTimeout(() => !finished && rejectCode(new AuthError('Sign-in was cancelled.')), 1500);
      }),
    ];

    let code: string;
    try {
      await Browser.open({ url: authorizeUrl(this.settings, challenge, state) });
      code = await answer;
    } finally {
      for (const handle of handles) await handle.remove();
    }

    if (!code) throw new AuthError('Sign-in returned no code.');
    return this.redeem({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: REDIRECT_URI });
  }

  /** A valid access token for the API, refreshed if it is about to expire; null when sign-in is needed. */
  async accessToken(): Promise<string | null> {
    await this.init();
    const tokens = this.tokens();
    if (!tokens) return null;
    if (tokens.expiresAt - REFRESH_MARGIN_MS > this.now()) return tokens.accessToken;
    if (!tokens.refreshToken) return null;
    this.refreshing ??= this.redeem({ grant_type: 'refresh_token', refresh_token: tokens.refreshToken })
      .then((t) => t.accessToken)
      .catch(async (error: unknown) => {
        // A refused refresh token (expired, revoked) means signing in again; a network failure does not.
        if (error instanceof AuthError) await this.signOut();
        return null;
      })
      .finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  async signOut(): Promise<void> {
    await this.store.setMeta(STORE_KEY, null);
    this.tokens.set(null);
  }

  private async redeem(grant: Record<string, string>): Promise<Tokens> {
    const response = await this.postForm(`${this.settings.authority}/oauth2/v2.0/token`, {
      client_id: this.settings.clientId,
      scope: `openid offline_access email profile ${this.settings.scope}`,
      ...grant,
    });
    const body = (typeof response.data === 'string' ? JSON.parse(response.data || '{}') : response.data) as TokenResponse;
    const tokens = toTokens(body, this.now(), this.tokens());
    await this.store.setMeta(STORE_KEY, JSON.stringify(tokens));
    this.tokens.set(tokens);
    return tokens;
  }
}

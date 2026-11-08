import {
  Member,
  PullResponse,
  PushRequest,
  PushResponse,
  Role,
  SevaType,
  YatraSummary,
} from './models';

/**
 * How the phone signs in to the API.
 * apiKey: the key built into the app (one user, the accountant), sent as X-Api-Key.
 * devUser/devEmail: the X-Dev-User header, which the API accepts only when it runs in Development.
 */
export interface Connection {
  baseUrl: string;
  apiKey?: string | null;
  devUser?: string | null;
  devEmail?: string | null;
}

/** A failure the screens can show: the server's message, or "no network". */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null = null,
  ) {
    super(message);
  }

  /** True when the server could not be reached at all; the entries stay queued. */
  get isOffline(): boolean {
    return this.status === 0;
  }
}

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** Thin wrapper over the endpoints in docs/architecture/api-contract.md. */
export class ApiClient {
  constructor(
    private readonly connection: Connection,
    private readonly fetchFn: Fetch = (input, init) => fetch(input, init),
  ) {}

  listYatras(): Promise<YatraSummary[]> {
    return this.call('GET', '/yatras');
  }

  createYatra(body: { name: string; startsOn: string; endsOn: string; displayName: string | null }): Promise<YatraSummary> {
    return this.call('POST', '/yatras', body);
  }

  listMembers(yatraId: string): Promise<Member[]> {
    return this.call('GET', `/yatras/${yatraId}/members`);
  }

  addMember(yatraId: string, body: { email: string; displayName: string; role: Role }): Promise<Member> {
    return this.call('POST', `/yatras/${yatraId}/members`, body);
  }

  saveSevaType(yatraId: string, code: string, body: Omit<SevaType, 'id' | 'code'>): Promise<SevaType> {
    return this.call('PUT', `/yatras/${yatraId}/seva-types/${encodeURIComponent(code)}`, body);
  }

  push(yatraId: string, body: PushRequest): Promise<PushResponse> {
    return this.call('POST', `/yatras/${yatraId}/sync/push`, body);
  }

  pull(yatraId: string, after: number, limit = 500): Promise<PullResponse> {
    return this.call('GET', `/yatras/${yatraId}/sync/pull?after=${after}&limit=${limit}`);
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.connection.apiKey) headers['X-Api-Key'] = this.connection.apiKey;
    else if (this.connection.devUser) {
      headers['X-Dev-User'] = this.connection.devUser;
      if (this.connection.devEmail) headers['X-Dev-Email'] = this.connection.devEmail;
    }

    let response: Response;
    try {
      response = await this.fetchFn(`${this.connection.baseUrl.replace(/\/+$/, '')}/api/v1${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError('Could not reach the server. Entries are kept on this phone and will sync later.', 0);
    }

    if (response.ok) return (await response.json()) as T;

    let message = `The server answered ${response.status}.`;
    let code: string | null = null;
    try {
      const problem = (await response.json()) as { title?: string; code?: string };
      if (problem.title) message = problem.title;
      code = problem.code ?? null;
    } catch {
      // Not a problem-details body; keep the status message.
    }
    if (response.status === 401) message = "The server did not accept this app's key. Install the latest APK, or check the key (docs/guides/android-setup.md).";
    if (response.status === 404 && path.startsWith('/yatras/')) message = 'This yatra was not found, or you are not a member of it.';
    throw new ApiError(message, response.status, code);
  }
}

import type {
  ApiResponse,
  AuthBundle,
  LoginSession,
  NewApiToken,
  NewApiUser,
  TokenPage,
  TokenUsage,
  TwoFactorChallenge,
} from "./types";

export class NewApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "NewApiError";
    this.status = status;
  }
}

export function normalizeEndpoint(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function messageOf(payload: unknown, fallback: string): string {
  if (isRecord(payload) && typeof payload.message === "string" && payload.message.trim()) {
    return payload.message;
  }
  return fallback;
}

function isAuthBundle(value: unknown): value is AuthBundle {
  if (!isRecord(value) || !isRecord(value.user) || !isRecord(value.session)) return false;
  return (
    typeof value.access_token === "string" &&
    typeof value.token_type === "string" &&
    typeof value.access_expires_at === "number" &&
    typeof value.user.id === "number" &&
    typeof value.user.username === "string" &&
    typeof value.session.sid === "string"
  );
}

export class NewApiClient {
  readonly endpoint: string;
  readonly accessToken?: string;

  constructor(endpoint: string, accessToken?: string) {
    this.endpoint = normalizeEndpoint(endpoint);
    this.accessToken = accessToken;
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!this.endpoint) throw new NewApiError("请先填写 New API 服务地址");
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    if (this.accessToken) headers.set("Authorization", `Bearer ${this.accessToken}`);

    let response: Response;
    try {
      response = await fetch(`${this.endpoint}${path}`, {
        ...init,
        headers,
        credentials: "include",
      });
    } catch {
      throw new NewApiError("无法连接 New API，请检查地址、网络或跨域配置");
    }

    const text = await response.text();
    let payload: unknown = undefined;
    if (text) {
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        payload = text;
      }
    }
    if (!response.ok) throw new NewApiError(messageOf(payload, `请求失败（${response.status}）`), response.status);
    if (isRecord(payload) && payload.success === false) throw new NewApiError(messageOf(payload, "New API 拒绝了请求"), response.status);
    return payload as T;
  }

  getSelf(): Promise<ApiResponse<NewApiUser>> {
    return this.request<ApiResponse<NewApiUser>>("/api/user/self");
  }

  generateAccessToken(): Promise<ApiResponse<string>> {
    return this.request<ApiResponse<string>>("/api/user/token");
  }

  async listTokens(): Promise<NewApiToken[]> {
    const response = await this.request<ApiResponse<TokenPage>>("/api/token/?p=1&size=100");
    return response.data?.items ?? [];
  }

  async revealTokenKey(id: number): Promise<string> {
    const response = await this.request<ApiResponse<{ key: string }>>(`/api/token/${id}/key`, { method: "POST" });
    if (!response.data?.key) throw new NewApiError("New API 没有返回令牌内容");
    return response.data.key;
  }

  async createToken(name: string, group: string, unlimitedQuota: boolean): Promise<void> {
    await this.request<ApiResponse>("/api/token/", {
      method: "POST",
      body: JSON.stringify({
        name,
        group,
        expired_time: -1,
        remain_quota: 0,
        unlimited_quota: unlimitedQuota,
        model_limits_enabled: false,
        cross_group_retry: false,
      }),
    });
  }

  async getTokenUsage(key: string): Promise<TokenUsage> {
    const response = await fetch(`${this.endpoint}/api/usage/token/`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${key}` },
    });
    const payload = (await response.json()) as ApiResponse<TokenUsage>;
    if (!response.ok || payload.success === false) throw new NewApiError(messageOf(payload, "无法读取令牌用量"), response.status);
    return payload.data ?? {};
  }

  async logout(session?: LoginSession): Promise<void> {
    await this.request<ApiResponse>("/api/user/auth/logout", {
      method: "POST",
      headers: session?.sid ? { "X-Auth-Session": session.sid } : undefined,
    });
  }
}

export async function login(endpoint: string, username: string, password: string): Promise<ApiResponse<AuthBundle | TwoFactorChallenge>> {
  const client = new NewApiClient(endpoint);
  return client.request<ApiResponse<AuthBundle | TwoFactorChallenge>>("/api/user/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function loginWith2FA(endpoint: string, flowToken: string, code: string): Promise<ApiResponse<AuthBundle>> {
  const client = new NewApiClient(endpoint);
  return client.request<ApiResponse<AuthBundle>>("/api/user/login/2fa", {
    method: "POST",
    body: JSON.stringify({ flow_token: flowToken, code }),
  });
}

export function hasAuthBundle(value: unknown): value is AuthBundle {
  return isAuthBundle(value);
}

export function isTwoFactorChallenge(value: unknown): value is TwoFactorChallenge {
  return isRecord(value) && value.require_2fa === true && typeof value.flow_token === "string";
}

import { invoke } from "@tauri-apps/api/core";

export interface NewApiEnvelope {
  success?: boolean;
  message?: string;
  data?: unknown;
}

export const newApiApi = {
  async login(
    endpoint: string,
    username: string,
    password: string,
  ): Promise<NewApiEnvelope> {
    return await invoke("new_api_login", { endpoint, username, password });
  },

  async login2fa(
    endpoint: string,
    flowToken: string,
    code: string,
  ): Promise<NewApiEnvelope> {
    return await invoke("new_api_login_2fa", {
      endpoint,
      flowToken,
      code,
    });
  },

  async getSelf(
    endpoint: string,
    accessToken: string,
  ): Promise<NewApiEnvelope> {
    return await invoke("new_api_get_self", { endpoint, accessToken });
  },

  async generateAccessToken(
    endpoint: string,
    accessToken: string,
  ): Promise<NewApiEnvelope> {
    return await invoke("new_api_generate_access_token", {
      endpoint,
      accessToken,
    });
  },

  async listTokens(
    endpoint: string,
    accessToken: string,
  ): Promise<NewApiEnvelope> {
    return await invoke("new_api_list_tokens", { endpoint, accessToken });
  },

  async revealTokenKey(
    endpoint: string,
    accessToken: string,
    tokenId: number,
  ): Promise<NewApiEnvelope> {
    return await invoke("new_api_reveal_token_key", {
      endpoint,
      accessToken,
      tokenId,
    });
  },

  async getModels(
    endpoint: string,
    accessToken: string,
  ): Promise<NewApiEnvelope> {
    return await invoke("new_api_get_models", { endpoint, accessToken });
  },

  async createToken(
    endpoint: string,
    accessToken: string,
    name: string,
    group: string,
  ): Promise<NewApiEnvelope> {
    return await invoke("new_api_create_token", {
      endpoint,
      accessToken,
      name,
      group,
    });
  },
};

import { useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronLeft,
  Circle,
  Eye,
  EyeOff,
  KeyRound,
  Layers3,
  Loader2,
  LockKeyhole,
  LogIn,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  WandSparkles,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import type { Provider, UniversalProvider } from "@/types";
import { newApiApi, providersApi, universalProvidersApi } from "@/lib/api";
import { extractErrorMessage } from "@/utils/errorUtils";
import { cn } from "@/lib/utils";

type AgentId = "claude" | "codex" | "opencode";
type SetupStage = "login" | "models" | "apply";

interface AgentResult {
  state: "success" | "error";
  message: string;
}

interface NewApiQuickSetupProps {
  onBack: () => void;
  onApplied?: () => void;
}

interface NewApiToken {
  id?: number | string;
  name?: string;
  key?: string;
  group?: string;
  status?: number | string;
}

const AGENTS: Array<{
  id: AgentId;
  name: string;
  detail: string;
  icon: string;
  color: string;
}> = [
  {
    id: "claude",
    name: "Claude Code",
    detail: "Anthropic 兼容接口",
    icon: "claude",
    color: "#d59b6a",
  },
  {
    id: "codex",
    name: "Codex",
    detail: "OpenAI Responses 接口",
    icon: "codex",
    color: "#75d6c3",
  },
  {
    id: "opencode",
    name: "OpenCode",
    detail: "OpenAI Compatible",
    icon: "opencode",
    color: "#86b9f7",
  },
];

const DEFAULT_ENDPOINT = "http://localhost:3000";
const ENDPOINT_STORAGE_KEY = "cc-switch-secdev-new-api-endpoint";
const UNIVERSAL_ID = "newapi-quick-setup";
const OPENCODE_ID = "newapi-opencode";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function payloadData(payload: { data?: unknown }): unknown {
  return payload.data;
}

function payloadMessage(payload: { message?: string }): string {
  return payload.message?.trim() || "New API 请求失败";
}

function assertSuccess(payload: { success?: boolean; message?: string }) {
  if (payload.success === false) {
    throw new Error(payloadMessage(payload));
  }
}

function normalizeEndpoint(value: string): string {
  let endpoint = value.trim().replace(/\/+$/, "");
  if (endpoint.endsWith("/v1")) {
    endpoint = endpoint.slice(0, -3).replace(/\/+$/, "");
  }
  return endpoint;
}

function modelEndpoint(value: string): string {
  return `${normalizeEndpoint(value)}/v1`;
}

function normalizeApiKey(value: string): string {
  const key = value.trim();
  if (!key) return "";
  return key.startsWith("sk-") ? key : `sk-${key}`;
}

function getAuthToken(payload: { data?: unknown }): string | null {
  const data = asRecord(payloadData(payload));
  const token = data?.access_token;
  return typeof token === "string" && token.trim() ? token : null;
}

function getUser(payload: { data?: unknown }): Record<string, unknown> {
  const data = asRecord(payloadData(payload));
  const user = asRecord(data?.user);
  return user ?? data ?? {};
}

export function getModelList(payload: { data?: unknown }): string[] {
  const data = payloadData(payload);
  const record = asRecord(data);
  const values = Array.isArray(data)
    ? data
    : Array.isArray(record?.models)
      ? record.models
      : Array.isArray(record?.data)
        ? record.data
        : [];
  return Array.from(
    new Set(
      values
        .map((item) => {
          if (typeof item === "string") return item.trim();
          const itemRecord = asRecord(item);
          for (const key of ["id", "name", "model"]) {
            const value = itemRecord?.[key];
            if (typeof value === "string" && value.trim()) {
              return value.trim();
            }
          }
          return "";
        })
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));
}

function getTokenList(payload: { data?: unknown }): NewApiToken[] {
  const data = payloadData(payload);
  const record = asRecord(data);
  const values = Array.isArray(data)
    ? data
    : Array.isArray(record?.items)
      ? record.items
      : Array.isArray(record?.data)
        ? record.data
        : [];
  return values
    .map(asRecord)
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => ({
      id:
        typeof item.id === "number" || typeof item.id === "string"
          ? item.id
          : undefined,
      name: typeof item.name === "string" ? item.name : undefined,
      key: typeof item.key === "string" ? item.key : undefined,
      group: typeof item.group === "string" ? item.group : undefined,
      status:
        typeof item.status === "number" || typeof item.status === "string"
          ? item.status
          : undefined,
    }));
}

function getTokenKey(payload: { data?: unknown }): string | null {
  const data = payloadData(payload);
  if (typeof data === "string" && data.trim()) return data.trim();
  const record = asRecord(data);
  const key = record?.key;
  return typeof key === "string" && key.trim() ? key.trim() : null;
}

function getTokenId(token: NewApiToken): number | null {
  if (typeof token.id === "number" && Number.isInteger(token.id)) {
    return token.id;
  }
  if (typeof token.id === "string" && /^\d+$/.test(token.id.trim())) {
    return Number(token.id);
  }
  return null;
}

function isUsableToken(token: NewApiToken): boolean {
  if (token.status === undefined) return true;
  return String(token.status) === "1";
}

function selectModel(models: string[], agent: AgentId): string {
  const preferred =
    agent === "claude"
      ? models.find((model) => /claude|anthropic/i.test(model))
      : agent === "codex"
        ? models.find((model) => /gpt|o[1-9]|codex/i.test(model))
        : models[0];
  return preferred ?? models[0] ?? "";
}

function maskSecret(value: string): string {
  if (!value) return "未获取";
  if (value.length <= 10) return "••••••••";
  return `${value.slice(0, 5)}••••${value.slice(-4)}`;
}

export function NewApiQuickSetup({ onBack, onApplied }: NewApiQuickSetupProps) {
  const [endpoint, setEndpoint] = useState(() => {
    try {
      return localStorage.getItem(ENDPOINT_STORAGE_KEY) || DEFAULT_ENDPOINT;
    } catch {
      return DEFAULT_ENDPOINT;
    }
  });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [flowToken, setFlowToken] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [user, setUser] = useState<Record<string, unknown>>({});
  const [models, setModels] = useState<string[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [apiKeyName, setApiKeyName] = useState("");
  const [selectedAgents, setSelectedAgents] = useState<
    Record<AgentId, boolean>
  >({
    claude: true,
    codex: true,
    opencode: true,
  });
  const [selectedModels, setSelectedModels] = useState<Record<AgentId, string>>(
    {
      claude: "",
      codex: "",
      opencode: "",
    },
  );
  const [stage, setStage] = useState<SetupStage>("login");
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [busy, setBusy] = useState<
    "login" | "models" | "apply" | "token" | null
  >(null);
  const [error, setError] = useState("");
  const [results, setResults] = useState<Partial<Record<AgentId, AgentResult>>>(
    {},
  );

  const activeAgents = useMemo(
    () => AGENTS.filter((agent) => selectedAgents[agent.id]),
    [selectedAgents],
  );
  const displayName =
    typeof user.username === "string" ? user.username : username;
  const group =
    typeof user.group === "string" && user.group.trim()
      ? user.group
      : "default";

  const finishLogin = async (token: string, endpointOverride = endpoint) => {
    setAccessToken(token);
    setBusy("models");
    setError("");
    try {
      const [selfPayload, modelsPayload, tokensPayload] = await Promise.all([
        newApiApi.getSelf(endpointOverride, token),
        newApiApi.getModels(endpointOverride, token),
        newApiApi.listTokens(endpointOverride, token),
      ]);
      assertSuccess(selfPayload);
      assertSuccess(modelsPayload);
      assertSuccess(tokensPayload);
      const currentUser = getUser(selfPayload);
      const availableModels = getModelList(modelsPayload);
      const tokens = getTokenList(tokensPayload).filter(isUsableToken);
      setUser(currentUser);
      setModels(availableModels);

      let resolvedKey =
        tokens.find((item) => item.key && !item.key.includes("*"))?.key ?? "";
      let existing = tokens.find((item) => item.id !== undefined);
      if (!resolvedKey) {
        for (const candidate of tokens) {
          const tokenId = getTokenId(candidate);
          if (tokenId === null) continue;
          try {
            const revealed = await newApiApi.revealTokenKey(
              endpointOverride,
              token,
              tokenId,
            );
            assertSuccess(revealed);
            const candidateKey = getTokenKey(revealed);
            if (candidateKey) {
              resolvedKey = candidateKey;
              existing = candidate;
              break;
            }
          } catch {
            // Older deployments can reject revealing a particular token.
            // Try another token before creating a new one.
          }
        }
      }
      if (!resolvedKey) {
        const generatedName = `MaiAI Switch - ${new Date()
          .toISOString()
          .slice(0, 10)}-${Date.now().toString().slice(-4)}`;
        setApiKeyName(generatedName);
        try {
          const created = await newApiApi.createToken(
            endpointOverride,
            token,
            generatedName,
            typeof currentUser.group === "string" && currentUser.group.trim()
              ? currentUser.group
              : "default",
          );
          assertSuccess(created);
          const refreshedPayload = await newApiApi.listTokens(
            endpointOverride,
            token,
          );
          assertSuccess(refreshedPayload);
          const beforeIds = new Set(
            tokens.map(getTokenId).filter((id): id is number => id !== null),
          );
          const refreshedTokens =
            getTokenList(refreshedPayload).filter(isUsableToken);
          const createdToken =
            refreshedTokens.find((item) => {
              const id = getTokenId(item);
              return (
                item.name === generatedName && id !== null && !beforeIds.has(id)
              );
            }) ?? refreshedTokens.find((item) => item.name === generatedName);
          const createdId = createdToken ? getTokenId(createdToken) : null;
          if (createdId === null) {
            throw new Error("令牌已创建，但没有找到令牌编号");
          }
          const revealed = await newApiApi.revealTokenKey(
            endpointOverride,
            token,
            createdId,
          );
          assertSuccess(revealed);
          resolvedKey = getTokenKey(revealed) ?? "";
          existing = createdToken;
          if (!resolvedKey) throw new Error("无法读取新令牌的完整 Key");
          toast.success("已自动创建并读取 New API 模型令牌");
        } catch (caught) {
          setError(
            extractErrorMessage(caught) ||
              "登录成功，但无法自动创建模型令牌，请检查 New API 令牌权限",
          );
        }
      } else {
        setApiKey(normalizeApiKey(resolvedKey));
        setApiKeyName(existing?.name || "New API Token");
      }
      if (resolvedKey) setApiKey(normalizeApiKey(resolvedKey));
      setStage("models");
      setSelectedModels({
        claude: selectModel(availableModels, "claude"),
        codex: selectModel(availableModels, "codex"),
        opencode: selectModel(availableModels, "opencode"),
      });
      setRequiresTwoFactor(false);
      setPassword("");
      setTwoFactorCode("");
      setFlowToken("");
    } catch (caught) {
      setError(
        extractErrorMessage(caught) || "登录成功，但读取 New API 账户信息失败",
      );
      setStage("login");
    } finally {
      setBusy(null);
    }
  };

  const handleLogin = async () => {
    setError("");
    if (!endpoint.trim() || !username.trim() || !password) {
      setError("请填写 New API 地址、账号和密码");
      return;
    }
    const normalizedEndpoint = normalizeEndpoint(endpoint);
    if (!/^https?:\/\//i.test(normalizedEndpoint)) {
      setError("New API 地址必须以 http:// 或 https:// 开头");
      return;
    }
    setBusy("login");
    try {
      localStorage.setItem(ENDPOINT_STORAGE_KEY, normalizedEndpoint);
      setEndpoint(normalizedEndpoint);
      const payload = await newApiApi.login(
        normalizedEndpoint,
        username.trim(),
        password,
      );
      assertSuccess(payload);
      const data = asRecord(payloadData(payload));
      if (data?.require_2fa === true) {
        const nextFlowToken = data.flow_token;
        if (typeof nextFlowToken !== "string" || !nextFlowToken) {
          throw new Error("New API 要求二次验证，但未返回验证流程令牌");
        }
        setFlowToken(nextFlowToken);
        setRequiresTwoFactor(true);
        return;
      }
      const token = getAuthToken(payload);
      if (!token) throw new Error("登录响应中没有 access token");
      await finishLogin(token, normalizedEndpoint);
    } catch (caught) {
      setError(
        extractErrorMessage(caught) || "New API 登录失败，请检查地址和账号密码",
      );
    } finally {
      setBusy(null);
    }
  };

  const handleTwoFactor = async () => {
    if (!twoFactorCode.trim() || !flowToken) {
      setError("请输入二次验证码");
      return;
    }
    setBusy("login");
    setError("");
    try {
      const payload = await newApiApi.login2fa(
        endpoint,
        flowToken,
        twoFactorCode,
      );
      assertSuccess(payload);
      const token = getAuthToken(payload);
      if (!token) throw new Error("二次验证响应中没有 access token");
      await finishLogin(token, normalizeEndpoint(endpoint));
    } catch (caught) {
      setError(extractErrorMessage(caught) || "二次验证失败");
    } finally {
      setBusy(null);
    }
  };

  const handleCreateToken = async () => {
    if (!accessToken || !apiKeyName.trim()) {
      setError("请填写令牌名称");
      return;
    }
    setBusy("token");
    setError("");
    try {
      const beforePayload = await newApiApi.listTokens(endpoint, accessToken);
      assertSuccess(beforePayload);
      const beforeIds = new Set(
        getTokenList(beforePayload)
          .map(getTokenId)
          .filter((id): id is number => id !== null),
      );
      const created = await newApiApi.createToken(
        endpoint,
        accessToken,
        apiKeyName.trim(),
        group,
      );
      assertSuccess(created);
      const tokensPayload = await newApiApi.listTokens(endpoint, accessToken);
      assertSuccess(tokensPayload);
      const tokens = getTokenList(tokensPayload).filter(isUsableToken);
      const createdToken =
        tokens.find((item) => {
          const id = getTokenId(item);
          return (
            item.name === apiKeyName.trim() && id !== null && !beforeIds.has(id)
          );
        }) ?? tokens.find((item) => item.name === apiKeyName.trim());
      const createdId = createdToken ? getTokenId(createdToken) : null;
      if (createdId === null) throw new Error("令牌已创建，但没有找到令牌编号");
      const revealed = await newApiApi.revealTokenKey(
        endpoint,
        accessToken,
        createdId,
      );
      assertSuccess(revealed);
      const key = getTokenKey(revealed);
      if (!key) throw new Error("无法读取新令牌的完整 Key");
      setApiKey(normalizeApiKey(key));
      toast.success("已自动创建并读取 New API 模型令牌");
    } catch (caught) {
      setError(extractErrorMessage(caught) || "创建模型令牌失败");
    } finally {
      setBusy(null);
    }
  };

  const toggleAgent = (id: AgentId) => {
    setSelectedAgents((current) => ({ ...current, [id]: !current[id] }));
  };

  const createUniversal = (): UniversalProvider => ({
    id: UNIVERSAL_ID,
    name: "NewAPI",
    providerType: "newapi",
    apps: {
      claude: selectedAgents.claude,
      codex: selectedAgents.codex,
      gemini: false,
    },
    baseUrl: normalizeEndpoint(endpoint),
    apiKey: normalizeApiKey(apiKey),
    models: {
      claude: selectedAgents.claude
        ? {
            model: selectedModels.claude,
            haikuModel: selectedModels.claude,
            sonnetModel: selectedModels.claude,
            opusModel: selectedModels.claude,
          }
        : undefined,
      codex: selectedAgents.codex
        ? {
            model: selectedModels.codex,
            reasoningEffort: "high",
          }
        : undefined,
    },
    websiteUrl: normalizeEndpoint(endpoint),
    notes: "由 New API 一键配置",
    icon: "newapi",
    iconColor: "#00A67E",
    createdAt: Date.now(),
  });

  const createOpenCodeProvider = (): Provider => ({
    id: OPENCODE_ID,
    name: "NewAPI",
    settingsConfig: {
      npm: "@ai-sdk/openai-compatible",
      name: "NewAPI",
      options: {
        baseURL: modelEndpoint(endpoint),
        apiKey: normalizeApiKey(apiKey),
      },
      models: {
        [selectedModels.opencode]: {
          name: selectedModels.opencode,
        },
      },
    },
    category: "aggregator",
    icon: "newapi",
    iconColor: "#00A67E",
    websiteUrl: normalizeEndpoint(endpoint),
    notes: "由 New API 一键配置",
    createdAt: Date.now(),
  });

  const applyAgent = async (agent: AgentId) => {
    if (agent === "opencode") {
      const provider = createOpenCodeProvider();
      const existing = await providersApi.getAll("opencode");
      if (existing[provider.id]) {
        await providersApi.update(provider, "opencode", provider.id);
      } else {
        await providersApi.add(provider, "opencode", true);
      }
      return;
    }

    const universal = createUniversal();
    await universalProvidersApi.upsert(universal);
    await universalProvidersApi.sync(universal.id);
    await providersApi.switch(`universal-${agent}-${universal.id}`, agent);
  };

  const handleApply = async () => {
    if (!apiKey) {
      setError("请先获取或创建 New API 模型令牌");
      return;
    }
    if (!activeAgents.length) {
      setError("请至少选择一个 Agent");
      return;
    }
    if (activeAgents.some((agent) => !selectedModels[agent.id].trim())) {
      setError("请为已选择的 Agent 指定模型");
      return;
    }

    setBusy("apply");
    setStage("apply");
    setError("");
    setResults({});
    for (const agent of activeAgents) {
      try {
        await applyAgent(agent.id);
        setResults((current) => ({
          ...current,
          [agent.id]: { state: "success", message: "配置已写入并启用" },
        }));
      } catch (caught) {
        setResults((current) => ({
          ...current,
          [agent.id]: {
            state: "error",
            message: extractErrorMessage(caught) || "配置失败",
          },
        }));
      }
    }
    setBusy(null);
    onApplied?.();
  };

  const canApply = Boolean(
    apiKey &&
      activeAgents.length &&
      activeAgents.every((agent) => selectedModels[agent.id]),
  );

  return (
    <div className="maiai-newapi flex min-h-0 flex-1 flex-col overflow-y-auto bg-background px-6 pb-12">
      <div className="mx-auto w-full max-w-6xl pt-5">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
              <WandSparkles className="h-3.5 w-3.5" />
              New API QUICK SETUP
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              一次登录，自动配置多个 Agent
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              MaiAI Switch 会从 New API
              读取可用模型，自动取得模型令牌，并把正确配置写入 Claude
              Code、Codex 和 OpenCode。
            </p>
          </div>
          <button
            type="button"
            className="secondary-button small-button"
            onClick={onBack}
          >
            <ChevronLeft className="h-4 w-4" />
            返回工作台
          </button>
        </div>

        <div className="mb-5 grid gap-2 md:grid-cols-3">
          {(
            [
              ["login", "登录 New API", "账号只在当前会话使用"],
              ["models", "选择 Agent", "自动读取模型和令牌"],
              ["apply", "应用配置", "写入并启用客户端"],
            ] as const
          ).map(([id, title, detail], index) => {
            const active = stage === id;
            const completed =
              (stage === "models" && id === "login") ||
              (stage === "apply" && id !== "apply");
            return (
              <div
                key={id}
                className={cn(
                  "flex items-center gap-3 border-b-2 px-1 pb-3",
                  active ? "border-primary" : "border-border",
                )}
              >
                <span
                  className={cn(
                    "grid h-7 w-7 place-items-center rounded-full border text-xs font-bold",
                    completed
                      ? "border-primary bg-primary/10 text-primary"
                      : active
                        ? "border-primary text-primary"
                        : "border-border text-muted-foreground",
                  )}
                >
                  {completed ? <Check className="h-3.5 w-3.5" /> : index + 1}
                </span>
                <span className="flex flex-col gap-0.5">
                  <strong
                    className={cn(
                      "text-xs",
                      active ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {title}
                  </strong>
                  <small className="text-[10px] text-muted-foreground">
                    {detail}
                  </small>
                </span>
              </div>
            );
          })}
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="leading-5">{error}</span>
          </div>
        )}

        {stage === "login" && (
          <section className="setup-layout">
            <div className="setup-form surface">
              <div className="surface-heading">
                <div>
                  <span className="eyebrow">ACCOUNT CONNECTION</span>
                  <h3>连接你的 New API</h3>
                </div>
                <span className="newapi-badge">
                  <ShieldCheck className="h-3.5 w-3.5" /> Rust 安全请求
                </span>
              </div>
              <label className="field-label" htmlFor="new-api-endpoint">
                New API 地址
              </label>
              <div className="input-shell">
                <span className="input-icon">
                  <Layers3 className="h-4 w-4" />
                </span>
                <input
                  id="new-api-endpoint"
                  value={endpoint}
                  onChange={(event) => setEndpoint(event.target.value)}
                  placeholder="https://new-api.example.com"
                  autoComplete="url"
                />
              </div>
              <label className="field-label" htmlFor="new-api-username">
                账号 / 邮箱
              </label>
              <div className="input-shell">
                <span className="input-icon">
                  <LogIn className="h-4 w-4" />
                </span>
                <input
                  id="new-api-username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="输入 New API 账号"
                  autoComplete="username"
                />
              </div>
              <label className="field-label" htmlFor="new-api-password">
                密码
              </label>
              <div className="input-shell">
                <span className="input-icon">
                  <LockKeyhole className="h-4 w-4" />
                </span>
                <input
                  id="new-api-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="输入密码"
                  autoComplete="current-password"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void handleLogin();
                  }}
                />
                <button
                  type="button"
                  className="input-action"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? "隐藏密码" : "显示密码"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {requiresTwoFactor && (
                <div className="twofa-box mt-4">
                  <KeyRound className="h-5 w-5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <strong>需要二次验证</strong>
                    <span>请输入 New API 验证器中的 6 位验证码</span>
                    <input
                      className="mt-2 h-9 w-full rounded-lg border border-input bg-background px-2 text-sm text-foreground outline-none focus:border-primary"
                      value={twoFactorCode}
                      onChange={(event) => setTwoFactorCode(event.target.value)}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="000000"
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void handleTwoFactor();
                      }}
                    />
                  </div>
                </div>
              )}
              <button
                type="button"
                className="primary-button mt-5 w-full"
                disabled={busy !== null}
                onClick={() =>
                  void (requiresTwoFactor ? handleTwoFactor() : handleLogin())
                }
              >
                {busy === "login" || busy === "models" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
                {requiresTwoFactor ? "验证并继续" : "登录并读取配置"}
              </button>
              <div className="setup-note mt-4">
                <LockKeyhole className="h-4 w-4" />
                <span>
                  密码不会写入配置文件，也不会发送到 MaiAI Switch
                  以外的服务。请求由桌面端 Rust 直接发送至你填写的 New API
                  地址。
                </span>
              </div>
            </div>
            <div className="config-preview surface">
              <div className="surface-heading">
                <div>
                  <span className="eyebrow">WHAT WILL HAPPEN</span>
                  <h3>登录后自动完成</h3>
                </div>
                <Bot className="h-5 w-5 text-primary" />
              </div>
              <div className="setup-steps">
                {[
                  ["01", "读取账户信息", "确认登录身份和默认分组"],
                  ["02", "读取可用模型", "只展示当前账号能使用的模型"],
                  ["03", "获取模型令牌", "复用已有令牌，没有则自动创建"],
                  ["04", "写入 Agent 配置", "生成正确格式并启用所选客户端"],
                ].map(([number, title, detail]) => (
                  <div
                    key={number}
                    className="flex items-start gap-3 border-b border-border pb-4 last:border-0"
                  >
                    <span>{number}</span>
                    <div>
                      <strong className="text-xs text-foreground">
                        {title}
                      </strong>
                      <p>{detail}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="preview-footer">
                <ShieldCheck className="h-4 w-4" />{" "}
                不保存密码，只在当前会话保留访问令牌
              </div>
            </div>
          </section>
        )}

        {stage === "models" && (
          <div className="space-y-4">
            <section className="surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <span className="eyebrow">CONNECTED ACCOUNT</span>
                  <h3 className="mt-2 text-base font-bold text-foreground">
                    {displayName || "New API 用户"}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {endpoint} · 分组 {group}
                  </p>
                </div>
                <div className="connected-pill">
                  <span className="online-dot" /> 已连接
                </div>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <div className="metric-card metric-teal min-h-0">
                  <span>可用模型</span>
                  <strong>{models.length}</strong>
                  <small>来自 New API 账户权限</small>
                </div>
                <div className="metric-card metric-blue min-h-0">
                  <span>模型令牌</span>
                  <strong>{maskSecret(apiKey)}</strong>
                  <small>{apiKey ? "已就绪" : "需要创建"}</small>
                </div>
                <div className="metric-card metric-amber min-h-0">
                  <span>目标 Agent</span>
                  <strong>{activeAgents.length} 个</strong>
                  <small>可随时调整</small>
                </div>
              </div>
            </section>

            {!apiKey && (
              <section className="create-key-card surface">
                <div>
                  <span className="eyebrow">MODEL ACCESS KEY</span>
                  <h3>自动创建模型令牌</h3>
                  <p>
                    New API 的登录 access token
                    不能直接调用模型。这里会创建一个长期有效的模型令牌，并只在本次配置过程中使用。
                  </p>
                </div>
                <div className="create-key-form">
                  <input
                    value={apiKeyName}
                    onChange={(event) => setApiKeyName(event.target.value)}
                    placeholder="令牌名称"
                    aria-label="令牌名称"
                  />
                  <input value={group} readOnly aria-label="令牌分组" />
                  <button
                    type="button"
                    className="primary-button small-button"
                    disabled={busy !== null}
                    onClick={() => void handleCreateToken()}
                  >
                    {busy === "token" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <KeyRound className="h-4 w-4" />
                    )}
                    创建并读取
                  </button>
                </div>
              </section>
            )}

            <section className="surface p-5">
              <div className="surface-heading">
                <div>
                  <span className="eyebrow">TARGET AGENTS</span>
                  <h3>选择需要配置的 Agent</h3>
                </div>
                <span className="muted-label">可多选</span>
              </div>
              <div className="mt-5 grid gap-3 lg:grid-cols-3">
                {AGENTS.map((agent) => {
                  const selected = selectedAgents[agent.id];
                  return (
                    <button
                      key={agent.id}
                      type="button"
                      className={cn(
                        "flex items-center gap-3 border p-3 text-left transition",
                        selected
                          ? "border-primary bg-primary/10"
                          : "border-border bg-card hover:border-primary/50",
                      )}
                      onClick={() => toggleAgent(agent.id)}
                    >
                      <span
                        className="grid h-9 w-9 place-items-center rounded-lg text-xs font-bold"
                        style={{
                          color: agent.color,
                          backgroundColor: `${agent.color}1c`,
                        }}
                      >
                        {agent.id === "claude"
                          ? "C"
                          : agent.id === "codex"
                            ? "X"
                            : "O"}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <strong className="text-xs text-foreground">
                          {agent.name}
                        </strong>
                        <small className="text-[10px] text-muted-foreground">
                          {agent.detail}
                        </small>
                      </span>
                      {selected ? (
                        <CheckCircle2 className="h-5 w-5 text-primary" />
                      ) : (
                        <Circle className="h-5 w-5 text-muted-foreground" />
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="surface p-5">
              <div className="surface-heading">
                <div>
                  <span className="eyebrow">MODEL ROUTING</span>
                  <h3>为每个 Agent 选择默认模型</h3>
                </div>
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div className="mt-5 grid gap-3 lg:grid-cols-3">
                {activeAgents.map((agent) => (
                  <label
                    key={agent.id}
                    className="flex flex-col gap-2 text-xs text-muted-foreground"
                  >
                    <span className="font-semibold">{agent.name}</span>
                    {models.length ? (
                      <select
                        value={selectedModels[agent.id]}
                        onChange={(event) =>
                          setSelectedModels((current) => ({
                            ...current,
                            [agent.id]: event.target.value,
                          }))
                        }
                        className="h-10 rounded-lg border border-input bg-background px-3 text-xs text-foreground outline-none focus:border-primary"
                      >
                        {models.map((model) => (
                          <option key={model} value={model}>
                            {model}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={selectedModels[agent.id]}
                        onChange={(event) =>
                          setSelectedModels((current) => ({
                            ...current,
                            [agent.id]: event.target.value,
                          }))
                        }
                        className="h-10 rounded-lg border border-input bg-background px-3 text-xs text-foreground outline-none focus:border-primary"
                        placeholder="输入模型名称"
                      />
                    )}
                  </label>
                ))}
              </div>
              {!models.length && (
                <div className="api-hint mt-4">
                  <AlertCircle className="h-4 w-4" />
                  New API 没有返回模型列表，你仍可以手动填写模型名称。
                </div>
              )}
            </section>

            <section className="surface config-preview p-5">
              <div className="surface-heading">
                <div>
                  <span className="eyebrow">CONFIGURATION PREVIEW</span>
                  <h3>将要写入的配置</h3>
                </div>
                <Eye className="h-5 w-5 text-primary" />
              </div>
              <pre className="mt-4 max-h-72 min-h-0 overflow-auto">
                <code>
                  {JSON.stringify(
                    {
                      endpoint: normalizeEndpoint(endpoint),
                      apiKey: maskSecret(apiKey),
                      agents: activeAgents.map((agent) => ({
                        name: agent.name,
                        model: selectedModels[agent.id],
                        baseURL:
                          agent.id === "claude"
                            ? normalizeEndpoint(endpoint)
                            : `${normalizeEndpoint(endpoint)}/v1`,
                      })),
                    },
                    null,
                    2,
                  )}
                </code>
              </pre>
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className="secondary-button small-button"
                  onClick={() => {
                    setStage("login");
                    setError("");
                  }}
                >
                  <RefreshCw className="h-4 w-4" />
                  重新登录
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={!canApply || busy !== null}
                  onClick={() => void handleApply()}
                >
                  {busy === "apply" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <WandSparkles className="h-4 w-4" />
                  )}
                  一键应用配置
                </button>
              </div>
            </section>
          </div>
        )}

        {stage === "apply" && (
          <section className="surface mx-auto max-w-3xl p-6">
            <div className="mb-6 flex items-center gap-3">
              <div className="brand-mark large">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <span className="eyebrow">SETUP RESULT</span>
                <h3 className="mt-1 text-lg font-bold text-foreground">
                  配置结果
                </h3>
              </div>
            </div>
            <div className="space-y-3">
              {activeAgents.map((agent) => {
                const result = results[agent.id];
                return (
                  <div
                    key={agent.id}
                    className="flex items-start gap-3 rounded-xl border border-border bg-card p-4"
                  >
                    <span
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-xs font-bold"
                      style={{ color: agent.color }}
                    >
                      {agent.id === "claude"
                        ? "C"
                        : agent.id === "codex"
                          ? "X"
                          : "O"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <strong className="text-sm text-foreground">
                        {agent.name}
                      </strong>
                      <p
                        className={cn(
                          "mt-1 text-xs leading-5",
                          result?.state === "error"
                            ? "text-red-600"
                            : "text-muted-foreground",
                        )}
                      >
                        {result?.message ||
                          (busy === "apply" ? "正在写入配置..." : "等待处理")}
                      </p>
                    </div>
                    {result?.state === "success" ? (
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
                    ) : result?.state === "error" ? (
                      <XCircle className="h-5 w-5 shrink-0 text-red-500" />
                    ) : (
                      <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
                    )}
                  </div>
                );
              })}
            </div>
            {busy !== "apply" && (
              <div className="mt-6 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className="secondary-button small-button"
                  onClick={() => setStage("models")}
                >
                  <RefreshCw className="h-4 w-4" />
                  调整配置
                </button>
                <button
                  type="button"
                  className="primary-button small-button"
                  onClick={onBack}
                >
                  <Check className="h-4 w-4" />
                  返回工作台
                </button>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

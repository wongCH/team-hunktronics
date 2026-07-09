// Shared types used across main, preload, and renderer processes.

export type ProviderType =
  | 'ollama'
  | 'openai'
  | 'anthropic'
  | 'github-models'
  | 'openai-compatible'
  | 'copilot';

export interface ConnectionConfig {
  id: string;
  providerType: ProviderType;
  label: string;
  /** Base URL override (used by ollama / openai-compatible; optional for others). */
  baseUrl?: string;
  /** Preferred default model id for this connection. */
  defaultModel?: string;
  /** Whether a secret/API key is stored for this connection (never the key itself). */
  hasKey: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatParams {
  temperature?: number;
  maxTokens?: number;
}

export interface ModelInfo {
  id: string;
  label?: string;
}

export interface ChatRequest {
  connectionId: string;
  model: string;
  messages: ChatMessage[];
  params?: ChatParams;
}

export interface TestResult {
  ok: boolean;
  message: string;
  models?: ModelInfo[];
}

export interface Conversation {
  id: string;
  title: string;
  connectionId: string | null;
  model: string | null;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface AppSettings {
  theme: 'neon-blue';
  experimentalCopilot: boolean;
  activeConnectionId: string | null;
  activeModel: string | null;
  /** OAuth client id used for GitHub device-flow login (advanced/experimental). */
  githubClientId: string;
}

export interface VaultStatus {
  available: boolean;
  backend: string;
}

/** Static, per-provider metadata that drives the connection editor UI. */
export interface ProviderMeta {
  type: ProviderType;
  name: string;
  description: string;
  needsKey: boolean;
  needsBaseUrl: boolean;
  defaultBaseUrl?: string;
  keyLabel?: string;
  keyPlaceholder?: string;
  docsUrl?: string;
  supportsDeviceFlow?: boolean;
  experimental?: boolean;
  /** Fallback model suggestions when the provider has no list endpoint. */
  suggestedModels?: string[];
}

export const PROVIDER_META: Record<ProviderType, ProviderMeta> = {
  ollama: {
    type: 'ollama',
    name: 'Ollama (local)',
    description: 'Run open models locally via the Ollama server.',
    needsKey: false,
    needsBaseUrl: true,
    defaultBaseUrl: 'http://localhost:11434',
    docsUrl: 'https://ollama.com',
    suggestedModels: ['llama3.1', 'qwen2.5', 'mistral', 'phi3']
  },
  openai: {
    type: 'openai',
    name: 'OpenAI',
    description: 'GPT models via the official OpenAI API.',
    needsKey: true,
    needsBaseUrl: false,
    defaultBaseUrl: 'https://api.openai.com/v1',
    keyLabel: 'API key',
    keyPlaceholder: 'sk-...',
    docsUrl: 'https://platform.openai.com/api-keys',
    suggestedModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'o3-mini']
  },
  anthropic: {
    type: 'anthropic',
    name: 'Anthropic (Claude)',
    description: 'Claude models via the Anthropic Messages API.',
    needsKey: true,
    needsBaseUrl: false,
    defaultBaseUrl: 'https://api.anthropic.com',
    keyLabel: 'API key',
    keyPlaceholder: 'sk-ant-...',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    suggestedModels: [
      'claude-3-5-sonnet-latest',
      'claude-3-5-haiku-latest',
      'claude-3-opus-latest'
    ]
  },
  'github-models': {
    type: 'github-models',
    name: 'GitHub Models',
    description: 'Free-tier model catalog using a GitHub token (models:read).',
    needsKey: true,
    needsBaseUrl: false,
    defaultBaseUrl: 'https://models.github.ai/inference',
    keyLabel: 'GitHub token',
    keyPlaceholder: 'github_pat_... or ghp_...',
    docsUrl: 'https://github.com/marketplace/models',
    supportsDeviceFlow: true,
    suggestedModels: ['openai/gpt-4o', 'openai/gpt-4o-mini', 'meta/Llama-3.3-70B-Instruct']
  },
  'openai-compatible': {
    type: 'openai-compatible',
    name: 'OpenAI-compatible endpoint',
    description: 'Any server that speaks the OpenAI Chat Completions API (LM Studio, OpenRouter, vLLM, …).',
    needsKey: true,
    needsBaseUrl: true,
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    keyLabel: 'API key',
    keyPlaceholder: 'Optional for local servers',
    suggestedModels: []
  },
  copilot: {
    type: 'copilot',
    name: 'GitHub Copilot (experimental)',
    description:
      'Uses your Copilot subscription via device login. Unofficial — may violate GitHub Terms of Service.',
    needsKey: false,
    needsBaseUrl: false,
    supportsDeviceFlow: true,
    experimental: true,
    suggestedModels: ['gpt-4o', 'claude-3.5-sonnet']
  }
};

export const DEFAULT_GITHUB_CLIENT_ID = 'Iv1.b507a08c87ecfe98';

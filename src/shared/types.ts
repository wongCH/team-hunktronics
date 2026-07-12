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

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

/** How much autonomy an agent has when it wants to take an action. */
export type AgentAutonomy = 'draft' | 'assist' | 'autonomous';

/** An orchestrator only delegates; a worker does the actual work. */
export type AgentRole = 'orchestrator' | 'worker';

export interface AgentConfig {
  id: string;
  name: string;
  /** Job title shown on the team canvas, e.g. "Chief of Staff" or "Inbox Agent". */
  title: string;
  role: AgentRole;
  /** Which LLM connection powers this agent. */
  connectionId: string | null;
  model: string | null;
  /** soul.md — persona / operating instructions used as the system prompt. */
  soul: string;
  /** Tool ids the agent is allowed to use. */
  tools: string[];
  /** Ordered skill ids the agent runs as a chain. */
  skills: string[];
  autonomy: AgentAutonomy;
  /** For orchestrators: worker agent ids it may delegate to. */
  delegatesTo: string[];
  /** Soft-delete flag — archived agents show in the "Removed" list. */
  archived?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AutonomyMeta {
  id: AgentAutonomy;
  name: string;
  description: string;
}

export const AUTONOMY_LEVELS: AutonomyMeta[] = [
  {
    id: 'draft',
    name: 'Draft',
    description: 'The agent only creates it — you review and send it yourself.'
  },
  {
    id: 'assist',
    name: 'Assist',
    description: 'Prepares the action and asks you to approve — on approval, it sends.'
  },
  {
    id: 'autonomous',
    name: 'Autonomous',
    description: 'Performs and sends the action directly, without asking first.'
  }
];

export interface ToolMeta {
  id: string;
  name: string;
  description: string;
}

export const TOOL_CATALOG: ToolMeta[] = [
  { id: 'email', name: 'Email', description: 'Compose and send emails' },
  { id: 'calendar', name: 'Calendar', description: 'Create and send calendar invites' },
  { id: 'web-search', name: 'Web search', description: 'Search the web for information' },
  { id: 'web-fetch', name: 'Web fetch', description: 'Fetch and read a web page' },
  { id: 'files', name: 'Files', description: 'Read and write local files' },
  { id: 'http', name: 'HTTP request', description: 'Call external HTTP APIs' },
  { id: 'code', name: 'Code run', description: 'Execute code in a sandbox' },
  { id: 'mcp', name: 'MCP server', description: 'Connect to an MCP server to add multiple tools' }
];

export interface SkillMeta {
  id: string;
  name: string;
  description: string;
}

export const SKILL_CATALOG: SkillMeta[] = [
  { id: 'plan', name: 'Plan', description: 'Break a goal into ordered steps' },
  { id: 'research', name: 'Research', description: 'Gather and synthesize information' },
  { id: 'summarize', name: 'Summarize', description: 'Condense long content' },
  { id: 'extract', name: 'Extract', description: 'Pull structured data from text' },
  { id: 'classify', name: 'Classify', description: 'Label or route the input' },
  { id: 'write', name: 'Write', description: 'Draft prose or documents' },
  { id: 'review', name: 'Review', description: 'Critique and improve output' }
];

export const DEFAULT_ORCHESTRATOR_SOUL = `# Chief of Staff

You are the orchestration agent (the team lead). You do not perform tasks
yourself — you break the user's goal into steps and delegate each to the most
suitable teammate.

## Operating rules
- Decompose the request into clear, ordered sub-tasks.
- For each sub-task, choose one teammate and hand off a precise instruction.
- Collect results, resolve conflicts, and synthesize a final answer.
- Never take direct actions (email, calendar, etc.); delegate them to a teammate.
`;

export const DEFAULT_WORKER_SOUL = `# Agent

You are a focused agent. You complete the single task delegated to you and
report back a concise, structured result.

## Behaviour
- Stay within your assigned tools and skills.
- Respect your autonomy level for any action that has side effects.
- Ask for missing information instead of guessing.
`;

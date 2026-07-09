import type { ChatMessage, ChatParams, ModelInfo, ProviderType } from '@shared/types';

export interface ProviderContext {
  baseUrl?: string;
  apiKey?: string | null;
  /** Optional per-request extras (e.g. resolved Copilot token). */
  extra?: Record<string, string>;
}

export interface StreamCallbacks {
  onChunk: (delta: string) => void;
}

export interface Provider {
  readonly type: ProviderType;
  listModels(ctx: ProviderContext): Promise<ModelInfo[]>;
  streamChat(
    ctx: ProviderContext,
    model: string,
    messages: ChatMessage[],
    params: ChatParams | undefined,
    signal: AbortSignal,
    cb: StreamCallbacks
  ): Promise<void>;
}

/** Normalize a base URL by trimming a trailing slash. */
export function trimUrl(url: string | undefined, fallback: string): string {
  const value = (url && url.trim()) || fallback;
  return value.replace(/\/+$/, '');
}

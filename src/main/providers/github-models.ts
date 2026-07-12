import type { ChatMessage, ChatParams, ModelInfo } from '@shared/types';
import type { Provider, ProviderContext, StreamCallbacks } from './types';
import { trimUrl } from './types';
import { httpError } from './stream';
import { openaiChatStream, type OpenAICompatOptions } from './openai-compatible';

const CATALOG_URL = 'https://models.github.ai/catalog/models';
const DEFAULT_BASE = 'https://models.github.ai/inference';

interface CatalogModel {
  id: string;
  name?: string;
  supported_output_modalities?: string[];
}

/**
 * GitHub Models. Chat uses the OpenAI-compatible `/inference` endpoint, but the model
 * list comes from the dedicated catalog endpoint (the inference base has no /models).
 */
export class GitHubModelsProvider implements Provider {
  readonly type = 'github-models' as const;

  private opts(ctx: ProviderContext): OpenAICompatOptions {
    const headers: Record<string, string> = {};
    if (ctx.apiKey) headers['authorization'] = `Bearer ${ctx.apiKey}`;
    return { baseUrl: trimUrl(ctx.baseUrl, DEFAULT_BASE), headers };
  }

  async listModels(ctx: ProviderContext): Promise<ModelInfo[]> {
    const headers: Record<string, string> = { accept: 'application/vnd.github+json' };
    if (ctx.apiKey) headers['authorization'] = `Bearer ${ctx.apiKey}`;
    const res = await fetch(CATALOG_URL, { headers });
    if (!res.ok) throw await httpError('Failed to list models', res);
    const json = (await res.json()) as CatalogModel[];
    const list = Array.isArray(json) ? json : [];
    return list
      .filter((m) => !m.supported_output_modalities || m.supported_output_modalities.includes('text'))
      .map((m) => ({ id: m.id, label: m.name }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  streamChat(
    ctx: ProviderContext,
    model: string,
    messages: ChatMessage[],
    params: ChatParams | undefined,
    signal: AbortSignal,
    cb: StreamCallbacks
  ): Promise<void> {
    return openaiChatStream(this.opts(ctx), model, messages, params, signal, cb);
  }
}

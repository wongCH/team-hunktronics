import type { ChatMessage, ChatParams, ModelInfo } from '@shared/types';
import type { Provider, ProviderContext, StreamCallbacks } from './types';
import { trimUrl } from './types';
import { httpError, streamSSE } from './stream';

const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_BASE = 'https://api.anthropic.com';
const DEFAULT_MAX_TOKENS = 4096;

export class AnthropicProvider implements Provider {
  readonly type = 'anthropic' as const;

  private headers(ctx: ProviderContext): Record<string, string> {
    return {
      'x-api-key': ctx.apiKey ?? '',
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json'
    };
  }

  async listModels(ctx: ProviderContext): Promise<ModelInfo[]> {
    const base = trimUrl(ctx.baseUrl, DEFAULT_BASE);
    const res = await fetch(`${base}/v1/models`, { headers: this.headers(ctx) });
    if (!res.ok) throw await httpError('Failed to list models', res);
    const json = (await res.json()) as {
      data?: Array<{ id: string; display_name?: string }>;
    };
    return (json.data ?? []).map((m) => ({ id: m.id, label: m.display_name }));
  }

  async streamChat(
    ctx: ProviderContext,
    model: string,
    messages: ChatMessage[],
    params: ChatParams | undefined,
    signal: AbortSignal,
    cb: StreamCallbacks
  ): Promise<void> {
    const base = trimUrl(ctx.baseUrl, DEFAULT_BASE);

    // Anthropic takes the system prompt as a top-level field.
    const system = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const convo = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const body: Record<string, unknown> = {
      model,
      max_tokens: params?.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages: convo,
      stream: true
    };
    if (system) body.system = system;
    if (params?.temperature !== undefined) body.temperature = params.temperature;

    const res = await fetch(`${base}/v1/messages`, {
      method: 'POST',
      headers: this.headers(ctx),
      body: JSON.stringify(body),
      signal
    });
    if (!res.ok) throw await httpError('Chat request failed', res);

    for await (const data of streamSSE(res.body)) {
      let parsed: {
        type?: string;
        delta?: { type?: string; text?: string };
      };
      try {
        parsed = JSON.parse(data);
      } catch {
        continue;
      }
      if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
        if (parsed.delta.text) cb.onChunk(parsed.delta.text);
      }
    }
  }
}

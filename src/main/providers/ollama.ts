import type { ChatMessage, ChatParams, ModelInfo } from '@shared/types';
import type { Provider, ProviderContext, StreamCallbacks } from './types';
import { trimUrl } from './types';
import { httpError, streamLines } from './stream';

const DEFAULT_BASE = 'http://localhost:11434';

export class OllamaProvider implements Provider {
  readonly type = 'ollama' as const;

  async listModels(ctx: ProviderContext): Promise<ModelInfo[]> {
    const base = trimUrl(ctx.baseUrl, DEFAULT_BASE);
    const res = await fetch(`${base}/api/tags`);
    if (!res.ok) throw await httpError('Failed to reach Ollama', res);
    const json = (await res.json()) as { models?: Array<{ name: string }> };
    return (json.models ?? []).map((m) => ({ id: m.name }));
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
    const options: Record<string, unknown> = {};
    if (params?.temperature !== undefined) options.temperature = params.temperature;
    if (params?.maxTokens !== undefined) options.num_predict = params.maxTokens;

    const res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true, options }),
      signal
    });
    if (!res.ok) throw await httpError('Chat request failed', res);

    // Ollama streams newline-delimited JSON objects.
    for await (const line of streamLines(res.body)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let parsed: { message?: { content?: string }; done?: boolean; error?: string };
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        continue;
      }
      if (parsed.error) throw new Error(parsed.error);
      if (parsed.message?.content) cb.onChunk(parsed.message.content);
      if (parsed.done) break;
    }
  }
}

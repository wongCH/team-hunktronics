import type { ChatMessage, ChatParams, ModelInfo, ProviderType } from '@shared/types';
import type { Provider, ProviderContext, StreamCallbacks } from './types';
import { trimUrl } from './types';
import { httpError, streamSSE } from './stream';

export interface OpenAICompatOptions {
  baseUrl: string;
  headers: Record<string, string>;
}

const responsesOnlyModels = new Set<string>();

function isLocalQwenThinkingModel(opts: OpenAICompatOptions, model: string): boolean {
  try {
    const url = new URL(opts.baseUrl);
    const localLmStudio =
      url.port === '1234' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost');
    return localLmStudio && /(?:^|[/_-])qwen3(?:[.\-_]|$)/i.test(model);
  } catch {
    return false;
  }
}

/** Shared model listing for OpenAI-compatible `/models` endpoints. */
export async function openaiListModels(opts: OpenAICompatOptions): Promise<ModelInfo[]> {
  const res = await fetch(`${opts.baseUrl}/models`, { headers: opts.headers });
  if (!res.ok) throw await httpError('Failed to list models', res);
  const json = (await res.json()) as { data?: Array<{ id: string }> };
  const data = Array.isArray(json.data) ? json.data : [];
  const seen = new Set<string>();
  const out: ModelInfo[] = [];
  for (const m of data) {
    if (m?.id && !seen.has(m.id)) {
      seen.add(m.id);
      out.push({ id: m.id });
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/** Streaming for models exposed only through OpenAI's `/responses` endpoint. */
export async function openaiResponsesStream(
  opts: OpenAICompatOptions,
  model: string,
  messages: ChatMessage[],
  params: ChatParams | undefined,
  signal: AbortSignal,
  cb: StreamCallbacks
): Promise<void> {
  const body: Record<string, unknown> = {
    model,
    input: messages,
    stream: true
  };
  if (params?.temperature !== undefined) body.temperature = params.temperature;
  if (params?.maxTokens !== undefined) body.max_output_tokens = params.maxTokens;

  const res = await fetch(`${opts.baseUrl}/responses`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...opts.headers },
    body: JSON.stringify(body),
    signal
  });
  if (!res.ok) throw await httpError('Responses request failed', res);

  for await (const data of streamSSE(res.body)) {
    if (data === '[DONE]') break;
    let parsed: { type?: string; delta?: string };
    try {
      parsed = JSON.parse(data);
    } catch {
      continue;
    }
    if (parsed.type === 'response.output_text.delta' && parsed.delta) {
      cb.onChunk(parsed.delta);
    }
  }
}

/** Shared streaming chat with a guarded fallback for Responses-only models. */
export async function openaiChatStream(
  opts: OpenAICompatOptions,
  model: string,
  messages: ChatMessage[],
  params: ChatParams | undefined,
  signal: AbortSignal,
  cb: StreamCallbacks
): Promise<void> {
  const capabilityKey = `${opts.baseUrl}\u0000${model}`;
  if (responsesOnlyModels.has(capabilityKey)) {
    return openaiResponsesStream(opts, model, messages, params, signal, cb);
  }

  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true
  };
  if (params?.temperature !== undefined) body.temperature = params.temperature;
  if (params?.maxTokens !== undefined) body.max_tokens = params.maxTokens;
  if (isLocalQwenThinkingModel(opts, model)) {
    body.chat_template_kwargs = { enable_thinking: false };
  }

  const res = await fetch(`${opts.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...opts.headers },
    body: JSON.stringify(body),
    signal
  });
  if (!res.ok) {
    const error = await httpError('Chat request failed', res);
    if (
      res.status === 400 &&
      /not accessible via the \/chat\/completions endpoint/i.test(error.message)
    ) {
      responsesOnlyModels.add(capabilityKey);
      return openaiResponsesStream(opts, model, messages, params, signal, cb);
    }
    throw error;
  }

  for await (const data of streamSSE(res.body)) {
    if (data === '[DONE]') break;
    let parsed: {
      choices?: Array<{ delta?: { content?: string }; text?: string }>;
    };
    try {
      parsed = JSON.parse(data);
    } catch {
      continue;
    }
    const delta = parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.text ?? '';
    if (delta) cb.onChunk(delta);
  }
}

function authHeaders(ctx: ProviderContext): Record<string, string> {
  const headers: Record<string, string> = {};
  if (ctx.apiKey) headers['authorization'] = `Bearer ${ctx.apiKey}`;
  return headers;
}

/**
 * Handles OpenAI, GitHub Models, and any generic OpenAI-compatible server.
 * The only differences are the base URL and whether a key is required,
 * both of which come from the connection config.
 */
export class OpenAICompatibleProvider implements Provider {
  constructor(
    readonly type: ProviderType,
    private readonly fallbackBaseUrl: string
  ) {}

  private opts(ctx: ProviderContext): OpenAICompatOptions {
    return {
      baseUrl: trimUrl(ctx.baseUrl, this.fallbackBaseUrl),
      headers: authHeaders(ctx)
    };
  }

  listModels(ctx: ProviderContext): Promise<ModelInfo[]> {
    return openaiListModels(this.opts(ctx));
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

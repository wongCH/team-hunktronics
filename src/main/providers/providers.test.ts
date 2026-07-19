import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { trimUrl } from './types';
import { getProvider } from './index';
import {
  openaiListModels,
  openaiChatStream,
  openaiResponsesStream,
  OpenAICompatibleProvider
} from './openai-compatible';
import { OllamaProvider } from './ollama';
import { AnthropicProvider } from './anthropic';
import { GitHubModelsProvider } from './github-models';
import type { StreamCallbacks } from './types';

/**
 * Backlog coverage: US-103 (model discovery), US-301 (streaming chat) at the
 * provider-adapter level. `fetch` is mocked; no network calls are made.
 */

function sseBody(events: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return {
    async *[Symbol.asyncIterator]() {
      for (const e of events) yield enc.encode(`data: ${e}\n`);
    }
  } as unknown as ReadableStream<Uint8Array>;
}

function ndjsonBody(lines: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return {
    async *[Symbol.asyncIterator]() {
      for (const l of lines) yield enc.encode(l + '\n');
    }
  } as unknown as ReadableStream<Uint8Array>;
}

function collector(): StreamCallbacks & { text: () => string } {
  let acc = '';
  return { onChunk: (d) => (acc += d), text: () => acc };
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('trimUrl', () => {
  it('trims trailing slashes', () => {
    expect(trimUrl('https://x.test/v1/', 'fb')).toBe('https://x.test/v1');
    expect(trimUrl('https://x.test///', 'fb')).toBe('https://x.test');
  });

  it('uses the fallback for empty / undefined input', () => {
    expect(trimUrl(undefined, 'https://fallback')).toBe('https://fallback');
    expect(trimUrl('   ', 'https://fallback')).toBe('https://fallback');
  });
});

describe('provider registry', () => {
  it('resolves each known provider type', () => {
    expect(getProvider('ollama')).toBeInstanceOf(OllamaProvider);
    expect(getProvider('anthropic')).toBeInstanceOf(AnthropicProvider);
    expect(getProvider('openai')).toBeInstanceOf(OpenAICompatibleProvider);
    expect(getProvider('github-models')).toBeInstanceOf(GitHubModelsProvider);
    expect(getProvider('lm-studio')).toBeInstanceOf(OpenAICompatibleProvider);
    expect(getProvider('openai-compatible')).toBeInstanceOf(OpenAICompatibleProvider);
  });

  it('uses the LM Studio local server without authorization', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });

    await getProvider('lm-studio').listModels({});

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:1234/v1/models', {
      headers: {}
    });
  });

  it('throws for an unknown provider type', () => {
    // @ts-expect-error intentional invalid type
    expect(() => getProvider('bogus')).toThrow(/Unknown provider/);
  });
});

describe('OpenAI-compatible — model discovery (US-103)', () => {
  it('lists and alphabetically sorts models', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'gpt-4o' }, { id: 'gpt-3.5' }, { id: 'o3-mini' }] })
    });
    const models = await openaiListModels({ baseUrl: 'https://api.test/v1', headers: {} });
    expect(models.map((m) => m.id)).toEqual(['gpt-3.5', 'gpt-4o', 'o3-mini']);
  });

  it('throws a descriptive error on a non-OK response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => JSON.stringify({ error: { message: 'bad token' } })
    });
    await expect(openaiListModels({ baseUrl: 'https://api.test/v1', headers: {} })).rejects.toThrow(
      /Failed to list models: 401 bad token/
    );
  });

  it('sends a bearer token when a key is present', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
    const provider = new OpenAICompatibleProvider('openai', 'https://api.openai.com/v1');
    await provider.listModels({ apiKey: 'sk-123' });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.authorization).toBe('Bearer sk-123');
  });
});

describe('OpenAI-compatible — streaming chat (US-301)', () => {
  it('accumulates delta content and stops at [DONE]', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      body: sseBody([
        JSON.stringify({ choices: [{ delta: { content: 'Hel' } }] }),
        JSON.stringify({ choices: [{ delta: { content: 'lo' } }] }),
        '[DONE]',
        JSON.stringify({ choices: [{ delta: { content: 'IGNORED' } }] })
      ])
    });
    const cb = collector();
    await openaiChatStream(
      { baseUrl: 'https://api.test/v1', headers: {} },
      'gpt-4o',
      [{ role: 'user', content: 'hi' }],
      undefined,
      new AbortController().signal,
      cb
    );
    expect(cb.text()).toBe('Hello');
  });

  it('forwards temperature and max_tokens into the request body', async () => {
    fetchMock.mockResolvedValue({ ok: true, body: sseBody(['[DONE]']) });
    await openaiChatStream(
      { baseUrl: 'https://api.test/v1', headers: {} },
      'gpt-4o',
      [{ role: 'user', content: 'hi' }],
      { temperature: 0.2, maxTokens: 256 },
      new AbortController().signal,
      collector()
    );
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.test/v1/chat/completions');
    const sent = JSON.parse(init.body);
    expect(sent).toMatchObject({
      model: 'gpt-4o',
      stream: true,
      temperature: 0.2,
      max_tokens: 256
    });
  });

  it('disables extended thinking for local Qwen 3 models', async () => {
    fetchMock.mockResolvedValue({ ok: true, body: sseBody(['[DONE]']) });

    await openaiChatStream(
      { baseUrl: 'http://127.0.0.1:1234/v1', headers: {} },
      'qwen/qwen3.6-27b',
      [{ role: 'user', content: 'hi' }],
      undefined,
      new AbortController().signal,
      collector()
    );

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      chat_template_kwargs: { enable_thinking: false }
    });
  });

  it('streams Responses API output text deltas', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      body: sseBody([
        JSON.stringify({ type: 'response.output_text.delta', delta: 'Hello ' }),
        JSON.stringify({ type: 'response.output_text.delta', delta: 'there' }),
        JSON.stringify({ type: 'response.completed' })
      ])
    });
    const cb = collector();

    await openaiResponsesStream(
      { baseUrl: 'https://responses.test/v1', headers: {} },
      'gpt-5.6-sol',
      [{ role: 'user', content: 'hi' }],
      { maxTokens: 128 },
      new AbortController().signal,
      cb
    );

    expect(cb.text()).toBe('Hello there');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://responses.test/v1/responses');
    expect(JSON.parse(init.body)).toMatchObject({
      model: 'gpt-5.6-sol',
      input: [{ role: 'user', content: 'hi' }],
      stream: true,
      max_output_tokens: 128
    });
  });

  it('falls back once and remembers Responses-only models', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () =>
          JSON.stringify({
            error: {
              message: 'model "gpt-5.6-sol" is not accessible via the /chat/completions endpoint'
            }
          })
      })
      .mockResolvedValueOnce({
        ok: true,
        body: sseBody([
          JSON.stringify({ type: 'response.output_text.delta', delta: 'First' }),
          JSON.stringify({ type: 'response.completed' })
        ])
      })
      .mockResolvedValueOnce({
        ok: true,
        body: sseBody([
          JSON.stringify({ type: 'response.output_text.delta', delta: 'Second' }),
          JSON.stringify({ type: 'response.completed' })
        ])
      });
    const opts = { baseUrl: 'https://fallback.test/v1', headers: {} };
    const first = collector();
    const second = collector();

    await openaiChatStream(
      opts,
      'gpt-5.6-sol',
      [{ role: 'user', content: 'hi' }],
      undefined,
      new AbortController().signal,
      first
    );
    await openaiChatStream(
      opts,
      'gpt-5.6-sol',
      [{ role: 'user', content: 'again' }],
      undefined,
      new AbortController().signal,
      second
    );

    expect(first.text()).toBe('First');
    expect(second.text()).toBe('Second');
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://fallback.test/v1/chat/completions',
      'https://fallback.test/v1/responses',
      'https://fallback.test/v1/responses'
    ]);
  });
});

describe('Ollama provider', () => {
  it('maps /api/tags names to model ids', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ models: [{ name: 'llama3.1' }, { name: 'qwen2.5' }] })
    });
    const models = await new OllamaProvider().listModels({ baseUrl: 'http://localhost:11434' });
    expect(models.map((m) => m.id)).toEqual(['llama3.1', 'qwen2.5']);
  });

  it('streams newline-delimited JSON message content until done', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      body: ndjsonBody([
        JSON.stringify({ message: { content: 'Hi ' } }),
        JSON.stringify({ message: { content: 'there' } }),
        JSON.stringify({ done: true })
      ])
    });
    const cb = collector();
    await new OllamaProvider().streamChat(
      { baseUrl: 'http://localhost:11434' },
      'llama3.1',
      [{ role: 'user', content: 'hi' }],
      undefined,
      new AbortController().signal,
      cb
    );
    expect(cb.text()).toBe('Hi there');
  });

  it('throws when a stream chunk reports an error', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      body: ndjsonBody([JSON.stringify({ error: 'model not found' })])
    });
    await expect(
      new OllamaProvider().streamChat(
        {},
        'missing',
        [{ role: 'user', content: 'hi' }],
        undefined,
        new AbortController().signal,
        collector()
      )
    ).rejects.toThrow('model not found');
  });
});

describe('Anthropic provider (US-301)', () => {
  it('lists models with id + display label and sends the x-api-key header', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: 'claude-3-5-sonnet-latest', display_name: 'Claude 3.5 Sonnet' }]
      })
    });
    const models = await new AnthropicProvider().listModels({ apiKey: 'sk-ant-1' });
    expect(models).toEqual([{ id: 'claude-3-5-sonnet-latest', label: 'Claude 3.5 Sonnet' }]);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers['x-api-key']).toBe('sk-ant-1');
    expect(init.headers['anthropic-version']).toBeTruthy();
  });

  it('lifts the system prompt out of messages and accumulates text deltas', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      body: sseBody([
        JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hel' } }),
        JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'lo' } }),
        JSON.stringify({ type: 'message_stop' })
      ])
    });
    const cb = collector();
    await new AnthropicProvider().streamChat(
      { apiKey: 'sk-ant-1' },
      'claude-3-5-sonnet-latest',
      [
        { role: 'system', content: 'Be terse.' },
        { role: 'user', content: 'hi' }
      ],
      { maxTokens: 512 },
      new AbortController().signal,
      cb
    );
    expect(cb.text()).toBe('Hello');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/v1\/messages$/);
    const sent = JSON.parse(init.body);
    expect(sent.system).toBe('Be terse.');
    expect(sent.messages).toEqual([{ role: 'user', content: 'hi' }]);
    expect(sent).toMatchObject({ stream: true, max_tokens: 512 });
  });
});

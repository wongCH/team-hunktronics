import { describe, it, expect } from 'vitest';
import { streamLines, streamSSE, httpError } from './stream';

/**
 * Backlog coverage: US-301 (stream assistant responses) — the low-level parsing
 * that turns a chunked fetch body into lines / SSE data events, plus the shared
 * HTTP error formatter.
 */

function body(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return {
    async *[Symbol.asyncIterator]() {
      for (const c of chunks) yield enc.encode(c);
    }
  } as unknown as ReadableStream<Uint8Array>;
}

async function collect(gen: AsyncGenerator<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const v of gen) out.push(v);
  return out;
}

describe('streamLines', () => {
  it('splits a single chunk into newline-delimited lines', async () => {
    expect(await collect(streamLines(body(['a\nb\nc\n'])))).toEqual(['a', 'b', 'c']);
  });

  it('reassembles lines split across chunk boundaries', async () => {
    expect(await collect(streamLines(body(['he', 'llo\nwor', 'ld\n'])))).toEqual(['hello', 'world']);
  });

  it('emits a trailing line with no final newline', async () => {
    expect(await collect(streamLines(body(['one\ntwo'])))).toEqual(['one', 'two']);
  });

  it('yields nothing for a null body', async () => {
    expect(await collect(streamLines(null))).toEqual([]);
  });
});

describe('streamSSE', () => {
  it('extracts data payloads and strips the "data:" prefix', async () => {
    const chunks = ['data: {"a":1}\n', 'data: [DONE]\n'];
    expect(await collect(streamSSE(body(chunks)))).toEqual(['{"a":1}', '[DONE]']);
  });

  it('ignores comments, blank lines and CRLF endings', async () => {
    const chunks = [': comment\r\n', '\r\n', 'event: ping\r\n', 'data: hi\r\n'];
    expect(await collect(streamSSE(body(chunks)))).toEqual(['hi']);
  });

  it('skips empty data lines', async () => {
    expect(await collect(streamSSE(body(['data: \n', 'data: x\n'])))).toEqual(['x']);
  });
});

describe('httpError', () => {
  it('prefers a nested JSON error message', async () => {
    const res = {
      status: 401,
      statusText: 'Unauthorized',
      text: async () => JSON.stringify({ error: { message: 'bad key' } })
    } as unknown as Response;
    const err = await httpError('Chat request failed', res);
    expect(err.message).toBe('Chat request failed: 401 bad key');
  });

  it('falls back to raw text when not JSON', async () => {
    const res = {
      status: 500,
      statusText: 'Server Error',
      text: async () => 'boom'
    } as unknown as Response;
    expect((await httpError('Failed', res)).message).toBe('Failed: 500 boom');
  });

  it('uses statusText when the body is empty', async () => {
    const res = {
      status: 503,
      statusText: 'Service Unavailable',
      text: async () => ''
    } as unknown as Response;
    expect((await httpError('Failed', res)).message).toBe('Failed: 503 Service Unavailable');
  });
});

/**
 * Streaming helpers for reading fetch() response bodies line-by-line.
 * Works with the WHATWG ReadableStream exposed by Node's global fetch.
 */

export async function* streamLines(
  body: ReadableStream<Uint8Array> | null
): AsyncGenerator<string> {
  if (!body) return;
  const decoder = new TextDecoder();
  let buffer = '';
  // Node's ReadableStream is async-iterable.
  for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      yield line;
    }
  }
  buffer += decoder.decode();
  if (buffer.length > 0) yield buffer;
}

/**
 * Parse Server-Sent Event `data:` payloads from a response body.
 * Yields the raw string after `data: `. Skips comments/empty lines.
 * Stops the caller via the `[DONE]` sentinel (still yielded — caller decides).
 */
export async function* streamSSE(
  body: ReadableStream<Uint8Array> | null
): AsyncGenerator<string> {
  for await (const rawLine of streamLines(body)) {
    const line = rawLine.replace(/\r$/, '');
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trimStart();
    if (data.length === 0) continue;
    yield data;
  }
}

/** Build a readable error message from a failed fetch Response. */
export async function httpError(prefix: string, res: Response): Promise<Error> {
  let detail = '';
  try {
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      detail = json?.error?.message || json?.error || json?.message || text;
    } catch {
      detail = text;
    }
  } catch {
    /* ignore */
  }
  detail = (detail || res.statusText || '').toString().slice(0, 300);
  return new Error(`${prefix}: ${res.status} ${detail}`.trim());
}

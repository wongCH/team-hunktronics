import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import clsx from 'clsx';
import type { AgentConfig, ApiTrace, ChatMessage } from '@shared/types';
import { AUTONOMY_LEVELS } from '@shared/types';
import { api } from '@/lib/api';
import { SendIcon, StopIcon } from './icons';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

export function AgentRunner({ agent }: { agent: AgentConfig }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [traces, setTraces] = useState<ApiTrace[]>([]);
  const streamRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const ready = Boolean(agent.connectionId && agent.model);
  const autonomy = AUTONOMY_LEVELS.find((a) => a.id === agent.autonomy);

  useEffect(() => {
    let cancelled = false;
    void api.traces.list().then((all) => {
      if (cancelled) return;
      setTraces(
        all
          .filter((t) => t.context.source === 'agent' && t.context.agentId === agent.id)
          .sort((a, b) => b.updatedAt - a.updatedAt)
      );
    });

    const unsubs = [
      api.chat.onChunk(({ streamId, delta }) => {
        if (streamId !== streamRef.current) return;
        setMessages((m) => {
          const copy = [...m];
          const last = copy[copy.length - 1];
          if (last && last.role === 'assistant')
            copy[copy.length - 1] = { ...last, content: last.content + delta };
          return copy;
        });
      }),
      api.chat.onDone(({ streamId }) => {
        if (streamId === streamRef.current) {
          streamRef.current = null;
          setStreaming(false);
        }
      }),
      api.chat.onError(({ streamId, message }) => {
        if (streamId === streamRef.current) {
          streamRef.current = null;
          setStreaming(false);
          setError(message);
        }
      }),
      api.traces.onUpdate(({ trace }) => {
        if (trace.context.source !== 'agent' || trace.context.agentId !== agent.id) return;
        setTraces((list) => [trace, ...list.filter((item) => item.id !== trace.id)]);
      })
    ];
    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, [agent.id]);

  useEffect(() => {
    setMessages([]);
    setError(null);
    setStreaming(false);
    streamRef.current = null;
    setTraces([]);
  }, [agent.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const content = text.trim();
    if (!content || streaming || !ready) return;
    setError(null);
    const outgoing: ChatMessage[] = [
      ...(agent.soul.trim() ? [{ role: 'system' as const, content: agent.soul }] : []),
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content }
    ];
    setMessages((m) => [...m, { role: 'user', content }, { role: 'assistant', content: '' }]);
    setText('');
    setStreaming(true);
    try {
      const { streamId } = await api.chat.send({
        connectionId: agent.connectionId!,
        model: agent.model!,
        messages: outgoing,
        traceContext: {
          source: 'agent',
          agentId: agent.id,
          agentName: agent.name
        }
      });
      streamRef.current = streamId;
    } catch (e) {
      setStreaming(false);
      setError((e as Error).message);
    }
  };

  const stop = () => {
    if (streamRef.current) void api.chat.cancel(streamRef.current);
    streamRef.current = null;
    setStreaming(false);
  };

  const clearTraces = async () => {
    await api.traces.clear();
    setTraces([]);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-5 py-2.5 border-b border-border text-[11px] text-content-muted flex items-center gap-2">
        <span className="chip !py-0.5 border-neon/40 text-neon capitalize">{agent.autonomy}</span>
        <span>{autonomy?.description}</span>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {!ready ? (
          <div className="h-full flex items-center justify-center text-center text-sm text-content-faint">
            Assign an LLM connection and model in the Configure tab to test this agent.
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center text-sm text-content-faint">
            Send a message to test {agent.name} with its soul, tools, and autonomy.
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-4">
            {messages.map((m, i) => (
              <div key={i} className={clsx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div
                  className={clsx(
                    'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm',
                    m.role === 'user'
                      ? 'bg-white/[0.04] border border-border'
                      : 'bg-surface border border-border'
                  )}
                >
                  {m.content === '' && streaming ? (
                    <span className="inline-block w-2 h-4 bg-neon animate-blink align-middle" />
                  ) : (
                    <div className="prose-acp">
                      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                        {m.content}
                      </Markdown>
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="border-t border-border px-5 py-3 bg-overlay/40">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs uppercase tracking-wide text-content-faint">LLM API Interaction Log</h3>
            <button className="btn-outline !py-1 text-xs" onClick={() => void clearTraces()}>
              Clear logs
            </button>
          </div>
          {traces.length === 0 ? (
            <div className="text-xs text-content-faint border border-border rounded-lg px-3 py-2">
              No API interactions for this agent yet.
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {traces.map((trace) => (
                <article key={trace.id} className="panel bg-surface p-3 space-y-2">
                  <header className="flex flex-wrap items-center gap-2 text-[11px] text-content-muted">
                    <span className="chip !py-0.5 border-neon/40 text-neon">{trace.status}</span>
                    <span>{new Date(trace.createdAt).toLocaleString()}</span>
                    <span>model: {trace.model}</span>
                    <span>chunks: {trace.response.chunks}</span>
                  </header>
                  <section className="space-y-1">
                    <h4 className="text-xs font-semibold text-content">Request</h4>
                    <pre className="text-[11px] text-content-muted whitespace-pre-wrap break-words bg-black/20 border border-border rounded-md px-2 py-1.5">
                      {JSON.stringify(
                        {
                          providerType: trace.providerType,
                          connectionId: trace.connectionId,
                          params: trace.request.params ?? null,
                          messages: trace.request.messages
                        },
                        null,
                        2
                      )}
                    </pre>
                  </section>
                  <section className="space-y-1">
                    <h4 className="text-xs font-semibold text-content">Response</h4>
                    <pre className="text-[11px] text-content-muted whitespace-pre-wrap break-words bg-black/20 border border-border rounded-md px-2 py-1.5">
                      {trace.response.content}
                    </pre>
                    {trace.response.error && (
                      <div className="text-[11px] text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-2 py-1">
                        {trace.response.error}
                      </div>
                    )}
                  </section>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="px-5">
          <div className="max-w-2xl mx-auto mb-2 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
            {error}
          </div>
        </div>
      )}

      <div className="border-t border-border p-3">
        <div className="max-w-2xl mx-auto flex items-end gap-2 panel bg-overlay p-2">
          <textarea
            rows={1}
            className="flex-1 resize-none px-2 py-2 text-sm max-h-40"
            placeholder={ready ? `Message ${agent.name}…` : 'Configure a model first…'}
            value={text}
            disabled={!ready}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          {streaming ? (
            <button className="btn-danger" onClick={stop}>
              <StopIcon className="w-4 h-4" /> Stop
            </button>
          ) : (
            <button className="btn-primary" onClick={() => void send()} disabled={!ready || !text.trim()}>
              <SendIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import clsx from 'clsx';
import type { AgentConfig, Conversation } from '@shared/types';
import { AUTONOMY_LEVELS } from '@shared/types';
import { api } from '@/lib/api';
import { SendIcon, StopIcon } from './icons';

export function AgentRunner({ agent }: { agent: AgentConfig }) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [text, setText] = useState('');
  const [runId, setRunId] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const runIdRef = useRef<string | null>(null);
  const pendingKeyRef = useRef<string | null>(null);
  const ready = Boolean(agent.connectionId && agent.model);
  const autonomy = AUTONOMY_LEVELS.find((level) => level.id === agent.autonomy);

  useEffect(() => {
    let cancelled = false;
    void api.conversations.list().then(async (conversations) => {
      if (cancelled) return;
      const title = `Agent · ${agent.id}`;
      let current = conversations.find((item) => item.title === title) ?? null;
      if (!current) {
        const now = Date.now();
        current = {
          id: crypto.randomUUID(),
          title,
          connectionId: agent.connectionId,
          model: agent.model,
          messages: [],
          createdAt: now,
          updatedAt: now
        };
        await api.conversations.save(current);
      }
      if (!cancelled) setConversation(current);
    });

    const unsubscribe = api.runs.onEvent((event) => {
      if (event.run.agentId !== agent.id) return;
      if (event.run.id !== runIdRef.current && event.run.idempotencyKey !== pendingKeyRef.current) return;
      runIdRef.current = event.run.id;
      setRunId(event.run.id);
      if (event.type === 'chunk' && event.delta) {
        setConversation((current) => {
          if (!current) return current;
          const messages = [...current.messages];
          const last = messages[messages.length - 1];
          if (last?.role === 'assistant') {
            messages[messages.length - 1] = { ...last, content: last.content + event.delta! };
          }
          return { ...current, messages, updatedAt: Date.now() };
        });
      }
      if (event.type === 'state' && ['completed', 'failed', 'cancelled'].includes(event.run.status)) {
        runIdRef.current = null;
        pendingKeyRef.current = null;
        setRunId(null);
        setPendingKey(null);
        setError(event.run.status === 'failed' ? event.run.error : null);
        void api.conversations.list().then((items) => {
          const updated = items.find((item) => item.id === event.run.conversationId);
          if (updated) setConversation(updated);
        });
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [agent.id, agent.connectionId, agent.model]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation?.messages]);

  const send = async () => {
    const userContent = text.trim();
    if (!userContent || runId || pendingKey || !conversation || !ready) return;
    const key = crypto.randomUUID();
    setText('');
    setError(null);
    pendingKeyRef.current = key;
    setPendingKey(key);
    setConversation({
      ...conversation,
      messages: [
        ...conversation.messages,
        { role: 'user', content: userContent },
        { role: 'assistant', content: '' }
      ]
    });
    try {
      const run = await api.runs.start({
        conversationId: conversation.id,
        agentId: agent.id,
        userContent,
        idempotencyKey: key
      });
      runIdRef.current = run.id;
      setRunId(run.id);
    } catch (reason) {
      runIdRef.current = null;
      pendingKeyRef.current = null;
      setRunId(null);
      setPendingKey(null);
      setError((reason as Error).message);
    }
  };

  const stop = () => {
    if (runIdRef.current) void api.runs.cancel(runIdRef.current);
  };

  const streaming = Boolean(runId || pendingKey);
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-5 py-2.5 border-b border-border text-[11px] text-content-muted flex items-center gap-2">
        <span className="chip !py-0.5 border-neon/40 text-neon capitalize">{agent.autonomy}</span>
        <span>{autonomy?.description}</span>
        <span className="ml-auto text-content-faint">Persistent · memory-aware</span>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {!ready ? (
          <div className="h-full grid place-items-center text-center text-sm text-content-faint">Assign a connection and model in Configure.</div>
        ) : !conversation?.messages.length ? (
          <div className="h-full grid place-items-center text-center text-sm text-content-faint">Message {agent.name} using its character and managed memory.</div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-4">
            {conversation.messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={clsx('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={clsx('max-w-[80%] rounded-lg px-4 py-2.5 text-sm border', message.role === 'user' ? 'bg-white/[0.04] border-border' : 'bg-surface border-border')}>
                  {message.content === '' && streaming ? (
                    <span className="inline-block w-2 h-4 bg-neon animate-blink align-middle" />
                  ) : (
                    <div className="prose-acp"><Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>{message.content}</Markdown></div>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {error && <div className="mx-5 mb-2 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</div>}
      <div className="border-t border-border p-3">
        <div className="max-w-2xl mx-auto flex items-end gap-2 panel bg-overlay p-2">
          <textarea
            rows={1}
            className="flex-1 resize-none px-2 py-2 text-sm max-h-40"
            placeholder={ready ? `Message ${agent.name}…` : 'Configure a model first…'}
            value={text}
            disabled={!ready}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
          />
          {streaming ? (
            <button className="btn-danger" onClick={stop} disabled={!runId}><StopIcon className="w-4 h-4" /> Stop</button>
          ) : (
            <button className="btn-primary" onClick={() => void send()} disabled={!ready || !text.trim()}><SendIcon className="w-4 h-4" /></button>
          )}
        </div>
      </div>
    </div>
  );
}
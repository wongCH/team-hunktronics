import { useEffect, useRef } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import clsx from 'clsx';
import type { ChatMessage } from '@shared/types';
import { useChatStore } from '@/store/useChatStore';
import { useAppStore } from '@/store/useAppStore';
import { BotIcon, UserIcon } from './icons';

function Bubble({ message, streaming }: { message: ChatMessage; streaming: boolean }) {
  const isUser = message.role === 'user';
  return (
    <div className={clsx('flex gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <div
        className={clsx(
          'w-8 h-8 rounded-lg shrink-0 flex items-center justify-center border',
          isUser
            ? 'bg-white/5 border-border text-content-muted'
            : 'bg-neon/10 border-neon/40 text-neon shadow-neon-sm'
        )}
      >
        {isUser ? <UserIcon className="w-4 h-4" /> : <BotIcon className="w-4 h-4" />}
      </div>
      <div
        className={clsx(
          'max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
          isUser
            ? 'bg-white/[0.04] border border-border text-content'
            : 'bg-surface border border-border text-content'
        )}
      >
        {message.content === '' && streaming ? (
          <span className="inline-block w-2 h-4 bg-neon animate-blink align-middle" />
        ) : (
          <div className="prose-acp">
            <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
              {message.content}
            </Markdown>
            {streaming && <span className="inline-block w-2 h-4 ml-0.5 bg-neon animate-blink align-middle" />}
          </div>
        )}
      </div>
    </div>
  );
}

function Welcome() {
  const openModal = useAppStore((s) => s.openModal);
  const hasConnections = useAppStore((s) => s.connections.length > 0);
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6">
      <div className="w-16 h-16 rounded-2xl bg-neon/10 border border-neon/40 shadow-neon flex items-center justify-center mb-5">
        <span className="text-neon neon-text text-2xl">◈</span>
      </div>
      <h1 className="text-xl font-semibold mb-2">Agent Control Panel</h1>
      <p className="text-content-muted max-w-md text-sm mb-6">
        Chat across local and cloud LLM backends from one neon cockpit. Your API keys are encrypted
        with your OS keychain and never leave this machine.
      </p>
      {!hasConnections && (
        <button className="btn-primary" onClick={() => openModal('connections')}>
          Connect your first backend
        </button>
      )}
    </div>
  );
}

export function MessageList() {
  const { conversations, activeId, isStreaming, streamConversationId } = useChatStore();
  const conv = conversations.find((c) => c.id === activeId);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conv?.messages]);

  if (!conv || conv.messages.length === 0) return <Welcome />;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-5">
        {conv.messages.map((m, i) => {
          const isLast = i === conv.messages.length - 1;
          const streaming =
            isStreaming && streamConversationId === conv.id && isLast && m.role === 'assistant';
          return <Bubble key={i} message={m} streaming={streaming} />;
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

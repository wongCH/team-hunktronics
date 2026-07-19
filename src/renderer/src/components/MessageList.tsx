import { useEffect, useRef } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import clsx from 'clsx';
import type { ChatMessage } from '@shared/types';
import { useChatStore } from '@/store/useChatStore';
import { useAppStore } from '@/store/useAppStore';
import { useAgentStore } from '@/store/useAgentStore';
import { getAgentIcon } from './AgentIconPicker';
import { BotIcon, UserIcon } from './icons';

function Bubble({
  message,
  streaming,
  agentIcon,
  compact
}: {
  message: ChatMessage;
  streaming: boolean;
  agentIcon?: string;
  compact: boolean;
}) {
  const isUser = message.role === 'user';
  return (
    <div className={clsx('flex', compact ? 'gap-2' : 'gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <div
        className={clsx(
          compact ? 'w-7 h-7' : 'w-8 h-8',
          'rounded-lg shrink-0 flex items-center justify-center border',
          isUser
            ? 'bg-white/5 border-border text-content-muted'
            : 'bg-neon/10 border-neon/40 text-neon shadow-neon-sm'
        )}
      >
        {isUser ? (
          <UserIcon className="w-4 h-4" />
        ) : agentIcon ? (
          <span>{agentIcon}</span>
        ) : (
          <BotIcon className="w-4 h-4" />
        )}
      </div>
      <div
        className={clsx(
          compact ? 'max-w-[85%] rounded-lg px-3 py-2 text-xs' : 'max-w-[75%] rounded-2xl px-4 py-3 text-sm',
          'leading-relaxed',
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

function Welcome({ compact }: { compact: boolean }) {
  const setPage = useAppStore((s) => s.setPage);
  const hasConnections = useAppStore((s) => s.connections.length > 0);
  const selectedAgentId = useChatStore((state) => state.selectedAgentId);
  const selectedAgent = useAgentStore((state) =>
    state.agents.find((agent) => agent.id === selectedAgentId && !agent.archived)
  );
  return (
    <div className={clsx('h-full flex flex-col items-center justify-center text-center', compact ? 'px-4' : 'px-6')}>
      <div className={clsx('bg-neon/10 border border-neon/40 shadow-neon flex items-center justify-center', compact ? 'w-10 h-10 rounded-lg mb-2' : 'w-16 h-16 rounded-2xl mb-5')}>
        <span className={clsx('text-neon neon-text', compact ? 'text-lg' : 'text-2xl')}>
          {selectedAgent ? getAgentIcon(selectedAgent.icon, selectedAgent.role) : '◈'}
        </span>
      </div>
      <h1 className={clsx('font-semibold', compact ? 'text-sm mb-1' : 'text-xl mb-2')}>
        {selectedAgent ? selectedAgent.name : 'Agent Control Panel'}
      </h1>
      <p className={clsx('text-content-muted max-w-md', compact ? 'text-xs mb-2' : 'text-sm mb-6')}>
        {selectedAgent
          ? `Start a direct conversation with your ${selectedAgent.title}.`
          : 'Chat across local and cloud LLM backends from one place. Your API keys are encrypted with your OS keychain and never leave this machine.'}
      </p>
      {!hasConnections && (
        <button className="btn-primary" onClick={() => setPage('settings')}>
          Connect your first backend
        </button>
      )}
    </div>
  );
}

export function MessageList({ compact = false }: { compact?: boolean }) {
  const { conversations, activeId, isStreaming, streamConversationId } = useChatStore();
  const conv = conversations.find((c) => c.id === activeId);
  const agent = useAgentStore((state) =>
    state.agents.find((candidate) => candidate.id === conv?.agentId && !candidate.archived)
  );
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conv?.messages]);

  if (!conv || conv.messages.length === 0) return <Welcome compact={compact} />;

  return (
    <div className="h-full overflow-y-auto">
      <div className={clsx('max-w-3xl mx-auto', compact ? 'px-3 py-3 space-y-3' : 'px-6 py-6 space-y-5')}>
        {conv.messages.map((m, i) => {
          const isLast = i === conv.messages.length - 1;
          const streaming =
            isStreaming && streamConversationId === conv.id && isLast && m.role === 'assistant';
          return (
            <Bubble
              key={i}
              message={m}
              streaming={streaming}
              agentIcon={agent ? getAgentIcon(agent.icon, agent.role) : undefined}
              compact={compact}
            />
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

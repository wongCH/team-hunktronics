import { useEffect, useState } from 'react';
import clsx from 'clsx';
import type { Conversation } from '@shared/types';
import { useAgentStore } from '@/store/useAgentStore';
import { findDirectAgentConversation, useChatStore } from '@/store/useChatStore';
import { getAgentIcon } from './AgentIconPicker';
import { PlusIcon, TrashIcon, BotIcon } from './icons';

function preview(conversation: Conversation | undefined, fallback: string): string {
  const message = [...(conversation?.messages ?? [])]
    .reverse()
    .find((item) => item.content.trim());
  return message?.content.replace(/\s+/g, ' ').trim() || fallback;
}

export function ConversationSidebar() {
  const [query, setQuery] = useState('');
  const agents = useAgentStore((state) => state.agents);
  const initAgents = useAgentStore((state) => state.init);
  const {
    conversations,
    activeId,
    isStreaming,
    newConversation,
    openAgentConversation,
    selectConversation,
    deleteConversation
  } = useChatStore();

  useEffect(() => {
    void initAgents();
  }, [initAgents]);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleAgents = agents.filter(
    (agent) =>
      !agent.archived &&
      (!normalizedQuery ||
        `${agent.name} ${agent.title}`.toLowerCase().includes(normalizedQuery))
  );
  const directConversations = conversations.filter((conversation) => !conversation.agentId);

  return (
    <aside className="w-72 shrink-0 flex flex-col bg-overlay border-r border-border">
      <div className="app-drag h-11 shrink-0" />
      <div className="px-3 pb-3 app-no-drag">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Messages</h2>
            <p className="text-[10px] text-content-faint">Talk directly to your agents</p>
          </div>
          <button
            className="btn-ghost !p-1.5"
            title="New session"
            aria-label="New session"
            disabled={isStreaming}
            onClick={() => void newConversation()}
          >
            <PlusIcon className="h-4 w-4" />
          </button>
        </div>
        <input
          className="field !py-1.5 text-xs"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Search agents..."
          aria-label="Search agents"
        />
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-3">
        <div className="px-2 pb-1 text-[10px] uppercase tracking-wider text-content-faint">
          Agents
        </div>
        <div className="space-y-0.5">
          {visibleAgents.map((agent) => {
            const conversation = findDirectAgentConversation(conversations, agent.id);
            const active = conversation?.id === activeId;
            const configured = Boolean(agent.connectionId && agent.model);
            return (
              <div
                key={agent.id}
                className={clsx(
                  'group flex cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-colors',
                  active
                    ? 'border-neon/30 bg-neon/10 text-content'
                    : 'border-transparent text-content-muted hover:bg-white/5'
                )}
                onClick={() => void openAgentConversation(agent.id)}
              >
                <div className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full border border-borderStrong bg-white/5 text-base">
                  {getAgentIcon(agent.icon, agent.role)}
                  <span
                    className={clsx(
                      'absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-overlay',
                      configured ? 'bg-emerald-400' : 'bg-amber-400'
                    )}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold text-content">{agent.name}</div>
                  <div className="truncate text-[10px] text-content-faint">
                    {preview(conversation, agent.title)}
                  </div>
                </div>
                {conversation && (
                  <button
                    className="opacity-0 group-hover:opacity-100 text-content-faint hover:text-red-300 transition-opacity"
                    onClick={(event) => {
                      event.stopPropagation();
                      void deleteConversation(conversation.id);
                    }}
                    aria-label={`Delete conversation with ${agent.name}`}
                    title="Clear conversation"
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
          {visibleAgents.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-content-faint">
              No agents match this search.
            </div>
          )}
        </div>

        {directConversations.length > 0 && (
          <div className="mt-5">
            <div className="px-2 pb-1 text-[10px] uppercase tracking-wider text-content-faint">
              Direct chats
            </div>
            <div className="space-y-0.5">
              {directConversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className={clsx(
                    'group flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 transition-colors',
                    conversation.id === activeId
                      ? 'border-neon/30 bg-neon/10 text-content'
                      : 'border-transparent text-content-muted hover:bg-white/5'
                  )}
                  onClick={() => selectConversation(conversation.id)}
                >
                  <BotIcon className="w-4 h-4 shrink-0 opacity-70" />
                  <span className="flex-1 truncate text-xs">{conversation.title || 'Untitled'}</span>
                  <button
                    className="opacity-0 group-hover:opacity-100 text-content-faint hover:text-red-300 transition-opacity"
                    onClick={(event) => {
                      event.stopPropagation();
                      void deleteConversation(conversation.id);
                    }}
                    aria-label="Delete conversation"
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </nav>
    </aside>
  );
}

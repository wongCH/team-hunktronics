import clsx from 'clsx';
import { useChatStore } from '@/store/useChatStore';
import { PlusIcon, TrashIcon, BotIcon } from './icons';

export function ConversationSidebar() {
  const { conversations, activeId, newConversation, selectConversation, deleteConversation } =
    useChatStore();

  return (
    <aside className="w-64 shrink-0 flex flex-col bg-overlay border-r border-border">
      <div className="app-drag h-11 shrink-0" />
      <div className="px-3 pb-2">
        <button className="btn-primary w-full app-no-drag" onClick={newConversation}>
          <PlusIcon className="w-4 h-4" /> New chat
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
        {conversations.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-content-faint">
            No conversations yet.
          </div>
        ) : (
          conversations.map((c) => (
            <div
              key={c.id}
              className={clsx(
                'group flex items-center gap-2 rounded-lg px-3 py-2 cursor-pointer transition-colors',
                c.id === activeId
                  ? 'bg-neon/10 text-content border border-neon/30'
                  : 'text-content-muted hover:bg-white/5 border border-transparent'
              )}
              onClick={() => selectConversation(c.id)}
            >
              <BotIcon className="w-4 h-4 shrink-0 opacity-70" />
              <span className="flex-1 truncate text-sm">{c.title || 'Untitled'}</span>
              <button
                className="opacity-0 group-hover:opacity-100 text-content-faint hover:text-red-300 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  void deleteConversation(c.id);
                }}
                aria-label="Delete conversation"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </nav>
    </aside>
  );
}

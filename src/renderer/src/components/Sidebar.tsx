import clsx from 'clsx';
import { useAppStore } from '@/store/useAppStore';
import { useChatStore } from '@/store/useChatStore';
import { PlusIcon, PlugIcon, SettingsIcon, TrashIcon, BotIcon } from './icons';

export function Sidebar() {
  const { conversations, activeId, newConversation, selectConversation, deleteConversation } =
    useChatStore();
  const { openModal, vault, connections } = useAppStore();

  return (
    <aside className="w-72 shrink-0 flex flex-col bg-overlay border-r border-border">
      <div className="app-drag h-14 flex items-center">
        <div className="pl-[76px] flex items-center gap-2">
          <span className="text-neon neon-text text-lg leading-none">◈</span>
          <span className="font-semibold text-sm tracking-wide">Agent Control</span>
        </div>
      </div>

      <div className="px-3 pt-1">
        <button className="btn-primary w-full app-no-drag" onClick={newConversation}>
          <PlusIcon /> New chat
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {conversations.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-content-faint">
            No conversations yet.
            <br />
            Start a new chat to begin.
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

      <footer className="border-t border-border p-3 space-y-1.5">
        <button
          className="btn-outline w-full justify-start app-no-drag"
          onClick={() => openModal('connections')}
        >
          <PlugIcon className="w-4 h-4" /> Connections
          <span className="ml-auto chip !py-0.5">{connections.length}</span>
        </button>
        <button
          className="btn-ghost w-full justify-start app-no-drag"
          onClick={() => openModal('settings')}
        >
          <SettingsIcon className="w-4 h-4" /> Settings
        </button>
        <div className="flex items-center gap-2 px-2 pt-1 text-[11px] text-content-faint">
          <span
            className={clsx(
              'w-1.5 h-1.5 rounded-full',
              vault?.available ? 'bg-emerald-400 shadow-neon-sm' : 'bg-amber-400'
            )}
          />
          {vault?.available ? `Keys encrypted · ${vault.backend}` : 'Encryption unavailable'}
        </div>
      </footer>
    </aside>
  );
}

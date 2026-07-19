import { useAppStore } from '@/store/useAppStore';
import { useAgentStore } from '@/store/useAgentStore';
import { useChatStore } from '@/store/useChatStore';
import { PROVIDER_META } from '@shared/types';
import { getAgentIcon } from './AgentIconPicker';
import { PlugIcon, PlusIcon, TrashIcon } from './icons';
import { ModelPicker } from './ModelPicker';

export function TopBar() {
  const { connections, settings, setActiveConnection, setPage } = useAppStore();
  const agents = useAgentStore((state) => state.agents);
  const selectedAgentId = useChatStore((state) => state.selectedAgentId);
  const conversations = useChatStore((state) => state.conversations);
  const activeId = useChatStore((state) => state.activeId);
  const isStreaming = useChatStore((state) => state.isStreaming);
  const newConversation = useChatStore((state) => state.newConversation);
  const clearConversation = useChatStore((state) => state.clearConversation);
  const selectedAgent = agents.find(
    (agent) => agent.id === selectedAgentId && !agent.archived
  );
  const activeConversation = conversations.find((conversation) => conversation.id === activeId);

  const activeConnectionId = selectedAgent?.connectionId ?? settings?.activeConnectionId;
  const activeConn = connections.find((c) => c.id === activeConnectionId);

  return (
    <header className="app-drag h-14 shrink-0 flex items-center gap-3 px-4 border-b border-border bg-surface/50">
      {selectedAgent ? (
        <div className="app-no-drag flex min-w-0 items-center gap-2">
          <span className="chip shrink-0">
            {getAgentIcon(selectedAgent.icon, selectedAgent.role)} {selectedAgent.name}
          </span>
          <span className="truncate text-xs text-content-muted">
            {selectedAgent.model ?? 'Model not configured'}
          </span>
        </div>
      ) : connections.length === 0 ? (
        <button className="btn-primary app-no-drag" onClick={() => setPage('settings')}>
          <PlugIcon className="w-4 h-4" /> Add a connection
        </button>
      ) : (
        <div className="app-no-drag flex items-center gap-2">
          <select
            className="field w-52 cursor-pointer"
            value={settings?.activeConnectionId ?? ''}
            onChange={(e) => void setActiveConnection(e.target.value || null)}
          >
            <option value="">Select connection…</option>
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>

          <ModelPicker />
        </div>
      )}

      <div className="ml-auto app-no-drag flex items-center gap-2">
        {activeConn && (
          <span className="chip">
            <span className="w-2 h-2 rounded-full bg-neon shadow-neon-sm" />
            {PROVIDER_META[activeConn.providerType].name}
          </span>
        )}
        <button
          className="btn-outline !py-1.5"
          disabled={isStreaming}
          onClick={() => void newConversation()}
          title="Start a separate blank chat"
        >
          <PlusIcon className="w-4 h-4" /> New session
        </button>
        <button
          className="btn-ghost !py-1.5"
          disabled={isStreaming || !activeConversation?.messages.length}
          onClick={() => {
            if (window.confirm('Clear all messages in this chat? This cannot be undone.')) {
              void clearConversation();
            }
          }}
          title="Clear messages from the active chat"
        >
          <TrashIcon className="w-4 h-4" /> Clear chat
        </button>
      </div>
    </header>
  );
}

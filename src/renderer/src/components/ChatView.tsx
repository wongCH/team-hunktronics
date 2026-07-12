import { useAppStore } from '@/store/useAppStore';
import { useChatStore } from '@/store/useChatStore';
import { MessageList } from './MessageList';
import { Composer } from './Composer';

export function ChatView() {
  const error = useChatStore((s) => s.error);
  const connections = useAppStore((s) => s.connections);
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);

  const activeConn = connections.find((c) => c.id === settings?.activeConnectionId);
  const needsCopilotOptIn =
    activeConn?.providerType === 'copilot' && !settings?.experimentalCopilot;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 min-h-0">
        <MessageList />
      </div>

      {needsCopilotOptIn && (
        <div className="px-4">
          <div className="max-w-3xl mx-auto mb-2 flex items-center gap-3 text-xs text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
            <span className="flex-1">
              GitHub Copilot is experimental and off by default. Enable it to send prompts to this
              connection.
            </span>
            <button
              className="btn-primary !py-1"
              onClick={() => void updateSettings({ experimentalCopilot: true })}
            >
              Enable
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="px-4">
          <div className="max-w-3xl mx-auto">
            <div className="mb-2 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {error}
            </div>
          </div>
        </div>
      )}
      <Composer />
    </div>
  );
}

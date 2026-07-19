import clsx from 'clsx';
import { useAppStore } from '@/store/useAppStore';
import { useChatStore } from '@/store/useChatStore';
import { PROVIDER_META } from '@shared/types';
import { PlusIcon, PlugIcon, BotIcon, CheckIcon } from '@/components/icons';

function StatCard({
  label,
  value,
  sub,
  big = true
}: {
  label: string;
  value: string | number;
  sub?: string;
  big?: boolean;
}) {
  return (
    <div className="panel bg-surface p-4">
      <div className="text-[11px] uppercase tracking-wider text-content-faint">{label}</div>
      <div
        className={clsx('font-semibold mt-1 truncate', big ? 'text-2xl text-neon' : 'text-sm text-content')}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-content-faint mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

export function DashboardPage() {
  const { connections, settings, vault, setPage, setActiveConnection } = useAppStore();
  const { conversations, newConversation, selectConversation } = useChatStore();

  const openChat = async (connId?: string) => {
    if (connId) await setActiveConnection(connId);
    setPage('chat');
  };
  const startNewChat = () => {
    void newConversation();
    setPage('chat');
  };
  const openConversation = (id: string) => {
    selectConversation(id);
    setPage('chat');
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="app-drag h-11 shrink-0" />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-8 py-4 pb-10">
          <h1 className="text-2xl font-semibold mb-1">Dashboard</h1>
          <p className="text-content-muted text-sm mb-6">
            Overview of your agents, backends, and recent activity.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <StatCard label="Connections" value={connections.length} />
            <StatCard label="Conversations" value={conversations.length} />
            <StatCard label="Active model" value={settings?.activeModel ?? '—'} big={false} />
            <StatCard
              label="Encryption"
              value={vault?.available ? 'On' : 'Off'}
              sub={vault?.backend}
              big={false}
            />
          </div>

          <div className="flex gap-2 mb-8">
            <button className="btn-primary" onClick={startNewChat}>
              <PlusIcon className="w-4 h-4" /> New chat
            </button>
            <button className="btn-outline" onClick={() => setPage('settings')}>
              <PlugIcon className="w-4 h-4" /> Add connection
            </button>
          </div>

          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            Backends <span className="chip !py-0.5">{connections.length}</span>
          </h2>
          {connections.length === 0 ? (
            <div className="panel bg-surface p-6 text-center mb-8">
              <p className="text-sm text-content-muted mb-3">No backends connected yet.</p>
              <button className="btn-primary" onClick={() => setPage('settings')}>
                Connect your first backend
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
              {connections.map((c) => {
                const meta = PROVIDER_META[c.providerType];
                const isActive = c.id === settings?.activeConnectionId;
                return (
                  <div
                    key={c.id}
                    className={clsx('panel bg-surface p-4 flex items-center gap-3', isActive && 'border-neon/40')}
                  >
                    <div className="w-10 h-10 rounded-lg bg-neon/10 border border-neon/30 flex items-center justify-center text-neon shrink-0">
                      ◈
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{c.label}</div>
                      <div className="text-[11px] text-content-faint">{meta.name}</div>
                    </div>
                    {(meta.needsKey || meta.supportsDeviceFlow) &&
                      (c.hasKey ? (
                        <span className="chip !py-0.5 border-emerald-500/40 text-emerald-300">
                          <CheckIcon className="w-3 h-3" /> key
                        </span>
                      ) : (
                        <span className="chip !py-0.5 border-amber-500/40 text-amber-300">no key</span>
                      ))}
                    <button className="btn-primary !py-1.5" onClick={() => void openChat(c.id)}>
                      Chat
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <h2 className="text-sm font-semibold mb-3">Recent conversations</h2>
          {conversations.length === 0 ? (
            <p className="text-sm text-content-faint">No conversations yet. Start a new chat to begin.</p>
          ) : (
            <div className="space-y-1.5">
              {conversations.slice(0, 6).map((c) => (
                <button
                  key={c.id}
                  className="panel bg-surface w-full text-left p-3 flex items-center gap-3 hover:border-borderStrong transition-colors"
                  onClick={() => openConversation(c.id)}
                >
                  <BotIcon className="w-4 h-4 opacity-70 shrink-0" />
                  <span className="flex-1 truncate text-sm">{c.title || 'Untitled'}</span>
                  <span className="text-[11px] text-content-faint shrink-0">
                    {c.messages.length} msgs
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

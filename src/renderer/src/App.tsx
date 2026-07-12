import { useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useChatStore } from '@/store/useChatStore';
import { NavRail } from '@/components/NavRail';
import { DashboardPage } from '@/pages/DashboardPage';
import { AgentsPage } from '@/pages/AgentsPage';
import { ChatPage } from '@/pages/ChatPage';
import { DataExplorerPage } from '@/pages/DataExplorerPage';
import { SettingsPage } from '@/pages/SettingsPage';

export default function App() {
  const ready = useAppStore((s) => s.ready);
  const loadAll = useAppStore((s) => s.loadAll);
  const page = useAppStore((s) => s.page);
  const initChat = useChatStore((s) => s.init);

  useEffect(() => {
    void loadAll();
    void initChat();
  }, [loadAll, initChat]);

  if (!ready) {
    return (
      <div className="h-screen flex items-center justify-center text-content-faint text-sm">
        <span className="text-neon neon-text mr-2 animate-pulseGlow">◈</span> Loading…
      </div>
    );
  }

  return (
    <div className="h-screen flex overflow-hidden">
      <NavRail />
      <main className="flex-1 flex flex-col min-w-0">
        {page === 'dashboard' && <DashboardPage />}
        {page === 'agents' && <AgentsPage />}
        {page === 'chat' && <ChatPage />}
        {page === 'data' && <DataExplorerPage />}
        {page === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}

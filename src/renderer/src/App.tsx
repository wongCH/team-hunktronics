import { useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useChatStore } from '@/store/useChatStore';
import { Sidebar } from '@/components/Sidebar';
import { TopBar } from '@/components/TopBar';
import { ChatView } from '@/components/ChatView';
import { Modal } from '@/components/Modal';
import { ConnectionsManager } from '@/components/ConnectionsManager';
import { SettingsModal } from '@/components/SettingsModal';

export default function App() {
  const ready = useAppStore((s) => s.ready);
  const loadAll = useAppStore((s) => s.loadAll);
  const modal = useAppStore((s) => s.modal);
  const closeModal = useAppStore((s) => s.closeModal);
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
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <ChatView />
      </main>

      {modal === 'connections' && (
        <Modal title="Connections" wide onClose={closeModal}>
          <ConnectionsManager />
        </Modal>
      )}
      {modal === 'settings' && (
        <Modal title="Settings" onClose={closeModal}>
          <SettingsModal />
        </Modal>
      )}
    </div>
  );
}

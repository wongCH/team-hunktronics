import { ConversationSidebar } from '@/components/ConversationSidebar';
import { TopBar } from '@/components/TopBar';
import { ChatView } from '@/components/ChatView';

export function ChatPage() {
  return (
    <div className="flex-1 flex min-h-0">
      <ConversationSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <ChatView />
      </div>
    </div>
  );
}

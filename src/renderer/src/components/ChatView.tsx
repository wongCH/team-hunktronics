import { useChatStore } from '@/store/useChatStore';
import { MessageList } from './MessageList';
import { Composer } from './Composer';

export function ChatView() {
  const error = useChatStore((s) => s.error);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 min-h-0">
        <MessageList />
      </div>
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

import { useEffect, useRef, useState } from 'react';
import { useChatStore } from '@/store/useChatStore';
import { useAppStore } from '@/store/useAppStore';
import { SendIcon, StopIcon } from './icons';

export function Composer() {
  const [text, setText] = useState('');
  const { sendMessage, stop, isStreaming } = useChatStore();
  const settings = useAppStore((s) => s.settings);
  const ready = Boolean(settings?.activeConnectionId && settings?.activeModel);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [text]);

  const submit = () => {
    if (!text.trim() || isStreaming) return;
    void sendMessage(text);
    setText('');
  };

  return (
    <div className="border-t border-border bg-surface/40 px-4 py-3">
      <div className="max-w-3xl mx-auto">
        <div className="panel bg-overlay flex items-end gap-2 p-2 transition-all focus-within:border-neon/60 focus-within:shadow-neon-sm">
          <textarea
            ref={taRef}
            rows={1}
            className="flex-1 resize-none px-2 py-2 text-sm text-content placeholder:text-content-faint max-h-[200px]"
            placeholder={ready ? 'Message your agent…' : 'Select a connection and model to start…'}
            value={text}
            disabled={!ready}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
          {isStreaming ? (
            <button className="btn-danger" onClick={stop}>
              <StopIcon className="w-4 h-4" /> Stop
            </button>
          ) : (
            <button className="btn-primary" onClick={submit} disabled={!ready || !text.trim()}>
              <SendIcon className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="text-[11px] text-content-faint mt-1.5 px-1">
          Enter to send · Shift+Enter for newline
        </div>
      </div>
    </div>
  );
}

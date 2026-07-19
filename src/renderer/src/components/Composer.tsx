import { useEffect, useRef, useState } from 'react';
import { useChatStore } from '@/store/useChatStore';
import { useAppStore } from '@/store/useAppStore';
import { useAgentStore } from '@/store/useAgentStore';
import { SendIcon, StopIcon } from './icons';

export function Composer({ compact = false }: { compact?: boolean }) {
  const [text, setText] = useState('');
  const { sendMessage, stop, isStreaming, selectedAgentId } = useChatStore();
  const settings = useAppStore((s) => s.settings);
  const agents = useAgentStore((s) => s.agents);
  const initAgents = useAgentStore((s) => s.init);
  const selectedAgent = agents.find(
    (agent) => agent.id === selectedAgentId && !agent.archived
  );
  const ready = selectedAgent
    ? Boolean(selectedAgent.connectionId && selectedAgent.model)
    : Boolean(settings?.activeConnectionId && settings?.activeModel);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void initAgents();
  }, [initAgents]);

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
    <div className={compact ? 'border-t border-border bg-surface/40 px-2 py-2' : 'border-t border-border bg-surface/40 px-4 py-3'}>
      <div className="max-w-3xl mx-auto">
        <div className="panel bg-overlay p-2 transition-all focus-within:border-neon/60 focus-within:shadow-neon-sm">
          <div className="flex items-end gap-2">
            <textarea
              ref={taRef}
              rows={1}
              className="flex-1 resize-none px-2 py-2 text-sm text-content placeholder:text-content-faint max-h-[200px]"
              placeholder={
                ready
                  ? `Message ${selectedAgent?.name ?? 'direct chat'}...`
                  : selectedAgent
                    ? `Configure a model for ${selectedAgent.name} to start...`
                    : 'Select a connection and model to start...'
              }
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
        </div>
        {!compact && (
          <div className="text-[11px] text-content-faint mt-1.5 px-1">
            Enter to send · Shift+Enter for newline
          </div>
        )}
      </div>
    </div>
  );
}

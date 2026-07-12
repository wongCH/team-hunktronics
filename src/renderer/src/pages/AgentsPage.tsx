import { useEffect, useState } from 'react';
import clsx from 'clsx';
import type { AgentConfig, AgentRole } from '@shared/types';
import { useAgentStore } from '@/store/useAgentStore';
import { useAppStore } from '@/store/useAppStore';
import { AgentEditor } from '@/components/AgentEditor';
import { CreateAgentModal } from '@/components/CreateAgentModal';
import { PlusIcon } from '@/components/icons';

function AgentRow({
  agent,
  active,
  onClick
}: {
  agent: AgentConfig;
  active: boolean;
  onClick: () => void;
}) {
  const connections = useAppStore((s) => s.connections);
  const conn = connections.find((c) => c.id === agent.connectionId);
  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full text-left rounded-lg px-3 py-2 flex items-center gap-2 border transition-colors',
        active
          ? 'bg-neon/10 border-neon/30 text-content'
          : 'border-transparent text-content-muted hover:bg-white/5'
      )}
    >
      <span
        className={clsx(
          'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-sm',
          agent.role === 'orchestrator' ? 'bg-neon/15 text-neon' : 'bg-white/5 text-content-muted'
        )}
      >
        {agent.role === 'orchestrator' ? '◆' : '◈'}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm truncate">{agent.name}</div>
        <div className="text-[11px] text-content-faint truncate capitalize">
          {conn ? conn.label : 'No model'} · {agent.autonomy}
        </div>
      </div>
    </button>
  );
}

export function AgentsPage() {
  const { agents, selectedId, init, select } = useAgentStore();
  const [creating, setCreating] = useState<AgentRole | null>(null);

  useEffect(() => {
    void init();
  }, [init]);

  const selected = agents.find((a) => a.id === selectedId) ?? null;
  const orchestrators = agents.filter((a) => a.role === 'orchestrator');
  const workers = agents.filter((a) => a.role === 'worker');

  return (
    <div className="flex-1 flex min-h-0">
      <aside className="w-72 shrink-0 flex flex-col bg-overlay border-r border-border">
        <div className="app-drag h-11 shrink-0" />
        <div className="px-3 pb-2 flex gap-2 app-no-drag">
          <button className="btn-primary flex-1" onClick={() => setCreating('worker')}>
            <PlusIcon className="w-4 h-4" /> Agent
          </button>
          <button
            className="btn-outline !px-3"
            title="Add orchestrator"
            onClick={() => setCreating('orchestrator')}
          >
            ◆
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-4">
          {agents.length === 0 && (
            <div className="px-3 py-8 text-center text-xs text-content-faint">
              No agents yet. Create an orchestrator and some workers.
            </div>
          )}
          {orchestrators.length > 0 && (
            <div>
              <div className="px-3 mb-1 text-[10px] uppercase tracking-wider text-content-faint">
                Orchestrators
              </div>
              <div className="space-y-0.5">
                {orchestrators.map((a) => (
                  <AgentRow
                    key={a.id}
                    agent={a}
                    active={a.id === selectedId}
                    onClick={() => select(a.id)}
                  />
                ))}
              </div>
            </div>
          )}
          {workers.length > 0 && (
            <div>
              <div className="px-3 mb-1 text-[10px] uppercase tracking-wider text-content-faint">
                Workers
              </div>
              <div className="space-y-0.5">
                {workers.map((a) => (
                  <AgentRow
                    key={a.id}
                    agent={a}
                    active={a.id === selectedId}
                    onClick={() => select(a.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="app-drag h-11 shrink-0" />
        {selected ? (
          <AgentEditor key={selected.id} agent={selected} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <div className="w-14 h-14 rounded-2xl bg-neon/10 border border-neon/40 shadow-neon flex items-center justify-center mb-4 text-neon text-xl">
              ◈
            </div>
            <h2 className="text-lg font-semibold mb-1">Build a multi-agent system</h2>
            <p className="text-content-muted text-sm max-w-md mb-5">
              Create an orchestrator that delegates, plus worker agents — each with its own LLM,
              soul.md, tools, skill chain, and autonomy level.
            </p>
            <div className="flex gap-2">
              <button className="btn-primary" onClick={() => setCreating('orchestrator')}>
                New orchestrator
              </button>
              <button className="btn-outline" onClick={() => setCreating('worker')}>
                New worker
              </button>
            </div>
          </div>
        )}
      </div>

      {creating && (
        <CreateAgentModal
          role={creating}
          onClose={() => setCreating(null)}
          onCreated={(id) => {
            setCreating(null);
            select(id);
          }}
        />
      )}
    </div>
  );
}

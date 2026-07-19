import { useEffect, useState } from 'react';
import clsx from 'clsx';
import type { AgentConfig, AgentRole } from '@shared/types';
import { useAgentStore } from '@/store/useAgentStore';
import { useAppStore } from '@/store/useAppStore';
import { AgentEditor } from '@/components/AgentEditor';
import { CreateAgentModal } from '@/components/CreateAgentModal';
import { TeamMap } from '@/components/TeamMap';
import { LlmWikiSetup } from '@/components/LlmWikiSetup';
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
          agent.role === 'orchestrator'
            ? 'bg-neon/15 text-neon'
            : agent.role === 'team-lead'
              ? 'bg-white/10 text-content'
              : 'bg-white/5 text-content-muted'
        )}
      >
        {agent.role === 'orchestrator' ? '◆' : agent.role === 'team-lead' ? '◇' : '◈'}
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
  const [view, setView] = useState<'map' | 'configure'>('map');
  const [wikiOnboarding, setWikiOnboarding] = useState(false);

  useEffect(() => {
    void init();
  }, [init]);

  const selected = agents.find((a) => a.id === selectedId) ?? null;
  const orchestrators = agents.filter((a) => a.role === 'orchestrator');
  const leads = agents.filter((a) => a.role === 'team-lead');
  const specialists = agents.filter((a) => a.role === 'specialist');
  const hasRoot = orchestrators.length > 0;

  return (
    <div className="flex-1 flex min-h-0">
      <aside className="w-72 shrink-0 flex flex-col bg-overlay border-r border-border">
        <div className="app-drag h-11 shrink-0" />
        <div className="px-3 pb-2 flex gap-2 app-no-drag">
          {hasRoot ? (
            <>
              <button className="btn-primary flex-1" onClick={() => setCreating('specialist')}>
                <PlusIcon className="w-4 h-4" /> Specialist
              </button>
              <button className="btn-outline !px-3" title="Add team lead" onClick={() => setCreating('team-lead')}>
                ◇
              </button>
            </>
          ) : (
            <button className="btn-primary flex-1" onClick={() => setCreating('orchestrator')}>
              <PlusIcon className="w-4 h-4" /> Create orchestrator
            </button>
          )}
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
          {leads.length > 0 && (
            <div>
              <div className="px-3 mb-1 text-[10px] uppercase tracking-wider text-content-faint">
                Team leads
              </div>
              <div className="space-y-0.5">
                {leads.map((a) => (
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
          {specialists.length > 0 && (
            <div>
              <div className="px-3 mb-1 text-[10px] uppercase tracking-wider text-content-faint">
                Specialists
              </div>
              <div className="space-y-0.5">
                {specialists.map((a) => (
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
        <div className="px-5 pb-3 border-b border-border flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Agent team</h1>
            <p className="text-xs text-content-muted mt-0.5">One orchestrator, domain leads, and focused specialists.</p>
          </div>
          <div className="flex border border-border rounded-lg p-0.5">
            {(['map', 'configure'] as const).map((mode) => (
              <button
                key={mode}
                className={clsx(
                  'px-3 py-1.5 text-xs rounded-md capitalize transition-colors',
                  view === mode ? 'bg-neon/15 text-neon' : 'text-content-muted hover:text-content'
                )}
                onClick={() => setView(mode)}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
        {view === 'map' ? (
          <TeamMap
            agents={agents.filter((agent) => !agent.archived)}
            selectedId={selectedId}
            onSelect={select}
            onConfigure={(id) => {
              select(id);
              setView('configure');
            }}
          />
        ) : selected ? (
          <div className="flex-1 min-h-0 flex flex-col">
            {wikiOnboarding && (
              <div className="px-5 pt-4">
                <LlmWikiSetup onDone={() => setWikiOnboarding(false)} />
              </div>
            )}
            <AgentEditor key={selected.id} agent={selected} />
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <div className="w-14 h-14 rounded-2xl bg-neon/10 border border-neon/40 shadow-neon flex items-center justify-center mb-4 text-neon text-xl">
              ◈
            </div>
            <h2 className="text-lg font-semibold mb-1">Build a multi-agent system</h2>
            <p className="text-content-muted text-sm max-w-md mb-5">
              Start with one orchestrator, then add domain leads and focused specialists. Each agent
              has its own LLM, character, tools, skill chain, and autonomy policy.
            </p>
            <div className="flex gap-2">
              <button className="btn-primary" onClick={() => setCreating('orchestrator')}>
                New orchestrator
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
            setView('configure');
            setWikiOnboarding(true);
          }}
        />
      )}
    </div>
  );
}

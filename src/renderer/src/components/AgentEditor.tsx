import { useEffect, useMemo, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import type { AgentConfig, AgentRole, ModelInfo } from '@shared/types';
import { AUTONOMY_LEVELS, SKILL_CATALOG, TOOL_CATALOG } from '@shared/types';
import { useAppStore } from '@/store/useAppStore';
import { useAgentStore } from '@/store/useAgentStore';
import { api } from '@/lib/api';
import { AgentRunner } from './AgentRunner';
import { CheckIcon, TrashIcon, XIcon } from './icons';

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint && <p className="text-[11px] text-content-faint">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export function AgentEditor({ agent }: { agent: AgentConfig }) {
  const { saveAgent, deleteAgent, agents } = useAgentStore();
  const connections = useAppStore((s) => s.connections);

  const [draft, setDraft] = useState<AgentConfig>(agent);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<'configure' | 'test'>('configure');
  const [models, setModels] = useState<ModelInfo[]>([]);

  useEffect(() => {
    setDraft(agent);
    setDirty(false);
    setTab('configure');
  }, [agent.id]);

  useEffect(() => {
    let cancelled = false;
    if (!draft.connectionId) {
      setModels([]);
      return;
    }
    api.models
      .list(draft.connectionId)
      .then((m) => !cancelled && setModels(m))
      .catch(() => !cancelled && setModels([]));
    return () => {
      cancelled = true;
    };
  }, [draft.connectionId]);

  const set = (patch: Partial<AgentConfig>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };

  const save = async () => {
    await saveAgent(draft);
    setDirty(false);
  };

  const workerAgents = useMemo(
    () => agents.filter((a) => a.role === 'worker' && a.id !== draft.id),
    [agents, draft.id]
  );
  const availableSkills = SKILL_CATALOG.filter((s) => !draft.skills.includes(s.id));

  const toggleTool = (id: string) =>
    set({ tools: draft.tools.includes(id) ? draft.tools.filter((t) => t !== id) : [...draft.tools, id] });
  const addSkill = (id: string) => id && set({ skills: [...draft.skills, id] });
  const removeSkill = (id: string) => set({ skills: draft.skills.filter((s) => s !== id) });
  const moveSkill = (idx: number, dir: -1 | 1) => {
    const next = [...draft.skills];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    set({ skills: next });
  };
  const toggleDelegate = (id: string) =>
    set({
      delegatesTo: draft.delegatesTo.includes(id)
        ? draft.delegatesTo.filter((d) => d !== id)
        : [...draft.delegatesTo, id]
    });

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="px-5 py-3 border-b border-border flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <input
            className="text-lg font-semibold bg-transparent outline-none w-full"
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="Name"
          />
          <input
            className="text-xs text-content-muted bg-transparent outline-none w-full"
            value={draft.title ?? ''}
            onChange={(e) => set({ title: e.target.value })}
            placeholder="Role / title"
          />
        </div>
        <select
          className="field !w-auto !py-1.5 cursor-pointer"
          value={draft.role}
          onChange={(e) => set({ role: e.target.value as AgentRole })}
        >
          <option value="worker">Worker</option>
          <option value="orchestrator">Orchestrator</option>
        </select>
        <button className="btn-primary !py-1.5" onClick={() => void save()} disabled={!dirty}>
          {dirty ? 'Save' : 'Saved'}
        </button>
        <button
          className="btn-danger !py-1.5"
          onClick={() => void deleteAgent(draft.id)}
          title="Delete agent"
        >
          <TrashIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="px-5 pt-3 flex gap-1 border-b border-border">
        {(['configure', 'test'] as const).map((t) => (
          <button
            key={t}
            className={clsx(
              'px-3 py-2 text-sm rounded-t-lg border-b-2 -mb-px capitalize',
              tab === t
                ? 'border-neon text-neon'
                : 'border-transparent text-content-muted hover:text-content'
            )}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'test' ? (
        <AgentRunner agent={draft} />
      ) : (
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="max-w-2xl mx-auto space-y-7">
            {draft.role === 'orchestrator' && (
              <div className="rounded-lg border border-neon/30 bg-neon/5 px-3 py-2 text-xs text-content-muted">
                ◆ This orchestrator delegates tasks to the worker agents you select below. It should
                not perform actions itself.
              </div>
            )}

            <Section title="Model" hint="Which LLM backend and model powers this agent.">
              <div className="grid grid-cols-2 gap-2">
                <select
                  className="field cursor-pointer"
                  value={draft.connectionId ?? ''}
                  onChange={(e) => set({ connectionId: e.target.value || null, model: null })}
                >
                  <option value="">Select connection…</option>
                  {connections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <input
                  className="field"
                  list="agent-model-list"
                  placeholder="Model…"
                  value={draft.model ?? ''}
                  disabled={!draft.connectionId}
                  onChange={(e) => set({ model: e.target.value || null })}
                />
                <datalist id="agent-model-list">
                  {models.map((m) => (
                    <option key={m.id} value={m.id} />
                  ))}
                </datalist>
              </div>
            </Section>

            <Section title="soul.md" hint="Persona and operating instructions — used as the system prompt.">
              <textarea
                className="field font-mono text-xs leading-relaxed min-h-[180px]"
                value={draft.soul}
                onChange={(e) => set({ soul: e.target.value })}
                spellCheck={false}
              />
            </Section>

            <Section title="Tools" hint="Capabilities the agent may use (execution wiring coming next).">
              <div className="flex flex-wrap gap-2">
                {TOOL_CATALOG.map((t) => {
                  const on = draft.tools.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      title={t.description}
                      onClick={() => toggleTool(t.id)}
                      className={clsx(
                        'chip cursor-pointer transition-colors',
                        on ? 'border-neon/50 text-neon bg-neon/10' : 'hover:border-borderStrong'
                      )}
                    >
                      {on && <CheckIcon className="w-3 h-3" />}
                      {t.name}
                    </button>
                  );
                })}
              </div>
            </Section>

            <Section title="Skill chain" hint="Ordered skills the agent runs in sequence.">
              {draft.skills.length > 0 && (
                <div className="space-y-1.5 mb-2">
                  {draft.skills.map((sid, idx) => {
                    const meta = SKILL_CATALOG.find((s) => s.id === sid);
                    return (
                      <div
                        key={sid}
                        className="flex items-center gap-2 panel bg-overlay px-3 py-2"
                      >
                        <span className="w-5 h-5 rounded-full bg-neon/15 text-neon text-[11px] flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <span className="text-sm flex-1">{meta?.name ?? sid}</span>
                        <span className="text-[11px] text-content-faint hidden sm:block">
                          {meta?.description}
                        </span>
                        <button
                          className="text-content-faint hover:text-content disabled:opacity-30"
                          onClick={() => moveSkill(idx, -1)}
                          disabled={idx === 0}
                        >
                          ↑
                        </button>
                        <button
                          className="text-content-faint hover:text-content disabled:opacity-30"
                          onClick={() => moveSkill(idx, 1)}
                          disabled={idx === draft.skills.length - 1}
                        >
                          ↓
                        </button>
                        <button
                          className="text-content-faint hover:text-red-300"
                          onClick={() => removeSkill(sid)}
                        >
                          <XIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              {availableSkills.length > 0 && (
                <div className="relative inline-block">
                  <select
                    className="field !py-1.5 !w-auto pr-8 cursor-pointer"
                    value=""
                    onChange={(e) => addSkill(e.target.value)}
                  >
                    <option value="">+ Add skill…</option>
                    {availableSkills.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </Section>

            <Section title="Autonomy" hint="How the agent behaves when an action has side effects.">
              <div className="grid gap-2">
                {AUTONOMY_LEVELS.map((lvl) => {
                  const on = draft.autonomy === lvl.id;
                  return (
                    <button
                      key={lvl.id}
                      onClick={() => set({ autonomy: lvl.id })}
                      className={clsx(
                        'text-left rounded-lg border px-3 py-2.5 transition-all',
                        on
                          ? 'border-neon/50 bg-neon/10 shadow-neon-sm'
                          : 'border-border hover:border-borderStrong'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={clsx(
                            'w-3.5 h-3.5 rounded-full border flex items-center justify-center',
                            on ? 'border-neon' : 'border-content-faint'
                          )}
                        >
                          {on && <span className="w-2 h-2 rounded-full bg-neon" />}
                        </span>
                        <span className={clsx('text-sm font-medium', on && 'text-neon')}>
                          {lvl.name}
                        </span>
                      </div>
                      <p className="text-[11px] text-content-muted mt-1 ml-[22px]">
                        {lvl.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </Section>

            {draft.role === 'orchestrator' && (
              <Section title="Delegation" hint="Worker agents this orchestrator can hand tasks to.">
                {workerAgents.length === 0 ? (
                  <p className="text-xs text-content-faint">
                    No worker agents yet. Create some workers to delegate to.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {workerAgents.map((w) => {
                      const on = draft.delegatesTo.includes(w.id);
                      return (
                        <button
                          key={w.id}
                          onClick={() => toggleDelegate(w.id)}
                          className={clsx(
                            'chip cursor-pointer transition-colors',
                            on ? 'border-neon/50 text-neon bg-neon/10' : 'hover:border-borderStrong'
                          )}
                        >
                          {on && <CheckIcon className="w-3 h-3" />}
                          {w.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </Section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

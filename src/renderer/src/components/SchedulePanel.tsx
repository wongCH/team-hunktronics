import { useEffect, useState } from 'react';
import clsx from 'clsx';
import type { AgentConfig, AgentSchedule } from '@shared/types';
import { api } from '@/lib/api';
import { Modal } from './Modal';
import { PlusIcon, RefreshIcon, TrashIcon } from './icons';

function emptySchedule(agents: AgentConfig[]): AgentSchedule {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name: '',
    agentId: agents[0]?.id ?? '',
    prompt: '',
    cron: '0 9 * * *',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    enabled: true,
    maxAttempts: 1,
    nextRunAt: now,
    lastRunAt: null,
    lastRunStatus: 'idle',
    lastError: null,
    conversationId: null,
    currentRunId: null,
    createdAt: now,
    updatedAt: now
  };
}

export function SchedulePanel() {
  const [schedules, setSchedules] = useState<AgentSchedule[]>([]);
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [editing, setEditing] = useState<AgentSchedule | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const [nextSchedules, nextAgents] = await Promise.all([
        api.schedules.list(),
        api.agents.list()
      ]);
      setSchedules(nextSchedules.sort((a, b) => a.nextRunAt - b.nextRunAt));
      setAgents(nextAgents.filter((agent) => !agent.archived));
    } catch (reason) {
      setError((reason as Error).message);
    }
  };

  useEffect(() => {
    void load();
    return api.runs.onEvent((event) => {
      if (
        event.type === 'state' &&
        ['completed', 'failed', 'cancelled'].includes(event.run.status)
      ) {
        window.setTimeout(() => void load(), 80);
      }
    });
  }, []);

  const save = async (schedule: AgentSchedule) => {
    setError(null);
    try {
      setSchedules(await api.schedules.save(schedule));
      setEditing(null);
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    }
  };

  const toggle = async (schedule: AgentSchedule) => {
    await save({ ...schedule, enabled: !schedule.enabled });
  };

  const runNow = async (schedule: AgentSchedule) => {
    setBusyId(schedule.id);
    setError(null);
    try {
      await api.schedules.runNow(schedule.id);
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    setSchedules(await api.schedules.delete(id));
    setEditing(null);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-6 py-3 border-b border-border flex items-center gap-3">
        <div className="flex-1">
          <h2 className="text-sm font-semibold">App-open schedules</h2>
          <p className="text-[11px] text-content-muted mt-0.5">
            Focused agent jobs run while this desktop application is open. Failures do not cascade.
          </p>
        </div>
        <button className="btn-outline !px-2.5" title="Refresh schedules" onClick={() => void load()}>
          <RefreshIcon className="w-4 h-4" />
        </button>
        <button
          className="btn-primary"
          onClick={() => setEditing(emptySchedule(agents))}
          disabled={agents.length === 0}
        >
          <PlusIcon className="w-4 h-4" /> New schedule
        </button>
      </div>

      {error && (
        <div className="mx-6 mt-3 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto px-6 py-4">
        {schedules.length === 0 ? (
          <div className="h-full grid place-items-center text-center">
            <div>
              <p className="text-sm text-content-muted">No scheduled agent work.</p>
              <p className="text-xs text-content-faint mt-1">
                Create one focused fetch, decision, and output job after configuring an agent model.
              </p>
            </div>
          </div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-overlay border-b border-border text-content-faint">
                <tr>
                  <th className="px-4 py-2 text-left">Schedule</th>
                  <th className="px-4 py-2 text-left">Agent</th>
                  <th className="px-4 py-2 text-left">Expression</th>
                  <th className="px-4 py-2 text-left">Next run</th>
                  <th className="px-4 py-2 text-left">Last status</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((schedule) => {
                  const agent = agents.find((candidate) => candidate.id === schedule.agentId);
                  return (
                    <tr key={schedule.id} className="border-b border-border/70 last:border-0">
                      <td className="px-4 py-3">
                        <button className="text-left hover:text-neon" onClick={() => setEditing(schedule)}>
                          <div className="font-medium">{schedule.name}</div>
                          <div className="text-[10px] text-content-faint mt-0.5">
                            {schedule.enabled ? 'Enabled' : 'Disabled'}
                          </div>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-content-muted">{agent?.name ?? 'Missing agent'}</td>
                      <td className="px-4 py-3 font-mono text-content-muted">
                        {schedule.cron}
                        <div className="text-[10px] text-content-faint mt-0.5">{schedule.timeZone}</div>
                      </td>
                      <td className="px-4 py-3 text-content-muted whitespace-nowrap">
                        {schedule.enabled ? new Date(schedule.nextRunAt).toLocaleString() : 'Paused'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={clsx(
                            'chip !py-0.5 capitalize',
                            schedule.lastRunStatus === 'succeeded' && 'border-emerald-500/40 text-emerald-300',
                            schedule.lastRunStatus === 'failed' && 'border-red-500/40 text-red-300',
                            schedule.lastRunStatus === 'running' && 'border-neon/40 text-neon'
                          )}
                        >
                          {schedule.lastRunStatus}
                        </span>
                        {schedule.lastError && (
                          <div className="text-[10px] text-red-300 mt-1 max-w-48 truncate" title={schedule.lastError}>
                            {schedule.lastError}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button className="btn-outline !py-1" onClick={() => void toggle(schedule)}>
                            {schedule.enabled ? 'Pause' : 'Enable'}
                          </button>
                          <button
                            className="btn-primary !py-1"
                            disabled={busyId === schedule.id || Boolean(schedule.currentRunId)}
                            onClick={() => void runNow(schedule)}
                          >
                            {busyId === schedule.id || schedule.currentRunId ? 'Running…' : 'Run now'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <ScheduleModal
          schedule={editing}
          agents={agents}
          onClose={() => setEditing(null)}
          onSave={save}
          onDelete={schedules.some((item) => item.id === editing.id) ? remove : undefined}
        />
      )}
    </div>
  );
}

function ScheduleModal({
  schedule,
  agents,
  onClose,
  onSave,
  onDelete
}: {
  schedule: AgentSchedule;
  agents: AgentConfig[];
  onClose: () => void;
  onSave: (schedule: AgentSchedule) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(schedule);
  return (
    <Modal
      title={onDelete ? 'Edit schedule' : 'New schedule'}
      onClose={onClose}
      footer={
        <div className="flex items-center gap-2 w-full">
          {onDelete && (
            <button className="btn-danger !px-2.5" title="Delete schedule" onClick={() => void onDelete(schedule.id)}>
              <TrashIcon className="w-4 h-4" />
            </button>
          )}
          <div className="flex-1" />
          <button
            className="btn-primary"
            disabled={!draft.name.trim() || !draft.agentId || !draft.prompt.trim() || !draft.cron.trim()}
            onClick={() => void onSave(draft)}
          >
            Save schedule
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">Name</label>
          <input className="field" autoFocus value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Daily research scan" />
        </div>
        <div>
          <label className="label">Agent</label>
          <select className="field cursor-pointer" value={draft.agentId} onChange={(event) => setDraft({ ...draft, agentId: event.target.value })}>
            {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name} · {agent.role}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Focused prompt</label>
          <textarea className="field min-h-28" value={draft.prompt} onChange={(event) => setDraft({ ...draft, prompt: event.target.value })} placeholder="Fetch one input, make one decision, and write one review-ready result." />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Cron expression</label>
            <input className="field font-mono" value={draft.cron} onChange={(event) => setDraft({ ...draft, cron: event.target.value })} placeholder="0 9 * * *" />
          </div>
          <div>
            <label className="label">Timezone</label>
            <input className="field" value={draft.timeZone} onChange={(event) => setDraft({ ...draft, timeZone: event.target.value })} placeholder="UTC" />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="accent-neon" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} />
          Enabled while the application is open
        </label>
      </div>
    </Modal>
  );
}
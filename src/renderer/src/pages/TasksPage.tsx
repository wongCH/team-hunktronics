import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import type { AgentTask, TaskPriority, TaskStatus } from '@shared/types';
import { api } from '@/lib/api';
import { useAgentStore } from '@/store/useAgentStore';
import { useAppStore } from '@/store/useAppStore';
import { useChatStore } from '@/store/useChatStore';
import { Modal } from '@/components/Modal';
import { PlusIcon, RefreshIcon, TrashIcon } from '@/components/icons';
import { PipelinePanel } from '@/components/PipelinePanel';

const COLUMNS: Array<{ id: TaskStatus; label: string }> = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'in-progress', label: 'In progress' },
  { id: 'review', label: 'Review' },
  { id: 'done', label: 'Done' }
];

const PRIORITY_STYLE: Record<TaskPriority, string> = {
  low: 'bg-content-faint',
  medium: 'bg-neon',
  high: 'bg-amber-400',
  urgent: 'bg-red-400'
};

function emptyTask(status: TaskStatus): AgentTask {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: '',
    description: '',
    status,
    priority: 'medium',
    agentId: null,
    conversationId: null,
    currentRunId: null,
    lastError: null,
    createdAt: now,
    updatedAt: now
  };
}

export function TasksPage() {
  const [view, setView] = useState<'board' | 'pipelines'>('board');
  const { agents, init: initAgents } = useAgentStore();
  const setPage = useAppStore((state) => state.setPage);
  const { init: initChat, selectConversation } = useChatStore();
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [selected, setSelected] = useState<AgentTask | null>(null);
  const [creating, setCreating] = useState<TaskStatus | null>(null);
  const [filterAgentId, setFilterAgentId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      setTasks(await api.tasks.list());
    } catch (reason) {
      setError((reason as Error).message);
    }
  };

  useEffect(() => {
    void initAgents();
    void initChat();
    void load();
    return api.runs.onEvent((event) => {
      if (event.type === 'state' && ['completed', 'failed', 'cancelled'].includes(event.run.status)) {
        window.setTimeout(() => void load(), 50);
      }
    });
  }, [initAgents, initChat]);

  const visibleTasks = useMemo(
    () => (filterAgentId ? tasks.filter((task) => task.agentId === filterAgentId) : tasks),
    [tasks, filterAgentId]
  );

  const save = async (task: AgentTask) => {
    setError(null);
    try {
      const next = await api.tasks.save(task);
      setTasks(next);
      setSelected((current) => (current?.id === task.id ? next.find((item) => item.id === task.id) ?? null : current));
      setCreating(null);
    } catch (reason) {
      setError((reason as Error).message);
    }
  };

  const move = async (taskId: string, status: TaskStatus) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task || task.status === status) return;
    await save({ ...task, status, updatedAt: Date.now() });
  };

  const start = async (task: AgentTask) => {
    setBusyId(task.id);
    setError(null);
    try {
      await api.tasks.start(task.id);
      await load();
      setSelected(null);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    setTasks(await api.tasks.delete(id));
    setSelected(null);
  };

  const openConversation = (task: AgentTask) => {
    if (!task.conversationId) return;
    selectConversation(task.conversationId);
    setPage('chat');
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-base">
      <div className="app-drag h-11 shrink-0" />
      <header className="px-6 pb-4 border-b border-border flex items-end gap-4">
        <div className="flex-1">
          <h1 className="text-xl font-semibold">Tasks</h1>
          <p className="text-xs text-content-muted mt-1">Durable work assigned to agents, with review before completion.</p>
        </div>
        {view === 'board' && (
          <>
            <select className="field !w-52 !py-1.5 cursor-pointer" value={filterAgentId ?? ''} onChange={(event) => setFilterAgentId(event.target.value || null)}>
              <option value="">All agents</option>
              {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
            </select>
            <button className="btn-outline !px-2.5" title="Refresh tasks" onClick={() => void load()}>
              <RefreshIcon className="w-4 h-4" />
            </button>
            <button className="btn-primary" onClick={() => setCreating('backlog')}>
              <PlusIcon className="w-4 h-4" /> New task
            </button>
          </>
        )}
      </header>

      <div className="px-6 py-2 border-b border-border flex gap-1">
        {(['board', 'pipelines'] as const).map((item) => (
          <button
            key={item}
            className={clsx(
              'px-3 py-1.5 rounded-md text-xs capitalize transition-colors',
              view === item ? 'bg-neon/15 text-neon' : 'text-content-muted hover:text-content'
            )}
            onClick={() => setView(item)}
          >
            {item}
          </button>
        ))}
      </div>

      {error && <div className="mx-6 mt-3 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</div>}

      {view === 'pipelines' ? (
        <PipelinePanel agents={agents} />
      ) : (
        <>
      <div className="flex-1 min-h-0 overflow-x-auto p-4">
        <div className="grid grid-cols-4 gap-3 min-w-[980px] h-full">
          {COLUMNS.map((column) => {
            const columnTasks = visibleTasks.filter((task) => task.status === column.id);
            return (
              <section
                key={column.id}
                className="min-w-0 flex flex-col rounded-lg border border-border bg-overlay/35"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => void move(event.dataTransfer.getData('taskId'), column.id)}
              >
                <header className="h-11 px-3 flex items-center gap-2 border-b border-border">
                  <h2 className="text-xs font-semibold uppercase tracking-wider flex-1">{column.label}</h2>
                  <span className="chip !py-0.5">{columnTasks.length}</span>
                  <button className="btn-ghost !p-1" title={`Add to ${column.label}`} onClick={() => setCreating(column.id)}>
                    <PlusIcon className="w-4 h-4" />
                  </button>
                </header>
                <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
                  {columnTasks.map((task) => {
                    const agent = agents.find((candidate) => candidate.id === task.agentId);
                    return (
                      <article
                        key={task.id}
                        draggable
                        onDragStart={(event) => event.dataTransfer.setData('taskId', task.id)}
                        onClick={() => setSelected(task)}
                        className="panel bg-surface p-3 cursor-pointer hover:border-borderStrong active:opacity-60"
                      >
                        <div className="flex items-start gap-2">
                          <span className={clsx('w-2 h-2 rounded-full mt-1.5 shrink-0', PRIORITY_STYLE[task.priority])} />
                          <h3 className="text-sm font-medium leading-snug flex-1">{task.title}</h3>
                        </div>
                        {task.description && <p className="text-[11px] text-content-muted mt-2 line-clamp-3">{task.description}</p>}
                        <div className="mt-3 flex items-center gap-2 text-[10px] text-content-faint">
                          <span className="flex-1 truncate">{agent?.name ?? 'Unassigned'}</span>
                          {task.currentRunId && <span className="text-neon animate-pulseGlow">Working</span>}
                          {task.lastError && <span className="text-red-300">Needs attention</span>}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {(selected || creating) && (
        <TaskModal
          task={selected ?? emptyTask(creating!)}
          agents={agents}
          busy={busyId === selected?.id}
          onClose={() => {
            setSelected(null);
            setCreating(null);
          }}
          onSave={save}
          onDelete={selected ? remove : undefined}
          onStart={selected ? start : undefined}
          onOpenConversation={selected?.conversationId ? openConversation : undefined}
        />
      )}
        </>
      )}
    </div>
  );
}

function TaskModal({
  task,
  agents,
  busy,
  onClose,
  onSave,
  onDelete,
  onStart,
  onOpenConversation
}: {
  task: AgentTask;
  agents: ReturnType<typeof useAgentStore.getState>['agents'];
  busy: boolean;
  onClose: () => void;
  onSave: (task: AgentTask) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onStart?: (task: AgentTask) => Promise<void>;
  onOpenConversation?: (task: AgentTask) => void;
}) {
  const [draft, setDraft] = useState(task);
  return (
    <Modal
      title={onDelete ? 'Task details' : 'New task'}
      onClose={onClose}
      footer={
        <div className="flex items-center gap-2 w-full">
          {onDelete && (
            <button className="btn-danger !px-2.5" title="Delete task" onClick={() => void onDelete(task.id)}>
              <TrashIcon className="w-4 h-4" />
            </button>
          )}
          {onOpenConversation && <button className="btn-outline" onClick={() => onOpenConversation(task)}>Open conversation</button>}
          <div className="flex-1" />
          {onStart && draft.agentId && draft.status !== 'done' && (
            <button className="btn-outline" disabled={busy || Boolean(draft.currentRunId)} onClick={() => void onStart(draft)}>
              {busy || draft.currentRunId ? 'Working…' : draft.lastError ? 'Retry work' : 'Run task'}
            </button>
          )}
          <button className="btn-primary" disabled={!draft.title.trim()} onClick={() => void onSave(draft)}>Save</button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">Title</label>
          <input className="field" autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
        </div>
        <div>
          <label className="label">Description</label>
          <textarea className="field min-h-32" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">Status</label>
            <select className="field cursor-pointer" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as TaskStatus })}>
              {COLUMNS.map((column) => <option key={column.id} value={column.id}>{column.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Priority</label>
            <select className="field cursor-pointer" value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as TaskPriority })}>
              {(['low', 'medium', 'high', 'urgent'] as const).map((priority) => <option key={priority} value={priority}>{priority}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Agent</label>
            <select className="field cursor-pointer" value={draft.agentId ?? ''} onChange={(event) => setDraft({ ...draft, agentId: event.target.value || null })}>
              <option value="">Unassigned</option>
              {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
            </select>
          </div>
        </div>
        {draft.lastError && <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{draft.lastError}</div>}
      </div>
    </Modal>
  );
}
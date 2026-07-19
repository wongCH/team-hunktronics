import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import type { AgentTask, ApiTrace, ApiTraceStatus, MemoryHealth } from '@shared/types';
import { api } from '@/lib/api';
import { RefreshIcon, TrashIcon } from '@/components/icons';
import { SchedulePanel } from '@/components/SchedulePanel';
import { PolicyPanel } from '@/components/PolicyPanel';

const STATUS_STYLE: Record<ApiTraceStatus, string> = {
  streaming: 'border-neon/40 text-neon',
  done: 'border-emerald-500/40 text-emerald-300',
  error: 'border-red-500/40 text-red-300',
  cancelled: 'border-amber-500/40 text-amber-300'
};

export function OperationsPage() {
  const [view, setView] = useState<'runs' | 'schedules' | 'policy'>('runs');
  const [traces, setTraces] = useState<ApiTrace[]>([]);
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [memory, setMemory] = useState<MemoryHealth | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<ApiTraceStatus | 'all'>('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      const [nextTraces, nextTasks, nextMemory] = await Promise.all([
        api.traces.list(),
        api.tasks.list(),
        api.memory.health()
      ]);
      setTraces(nextTraces.sort((a, b) => b.updatedAt - a.updatedAt));
      setTasks(nextTasks);
      setMemory(nextMemory);
      setSelectedId((current) => current ?? nextTraces[0]?.id ?? null);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load();
    return api.traces.onUpdate(({ trace }) => {
      setTraces((items) => [trace, ...items.filter((item) => item.id !== trace.id)]);
    });
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return traces.filter((trace) => {
      if (status !== 'all' && trace.status !== status) return false;
      if (!needle) return true;
      return `${trace.providerType} ${trace.model} ${trace.context.agentName ?? ''} ${trace.status} ${trace.response.error ?? ''}`
        .toLocaleLowerCase()
        .includes(needle);
    });
  }, [traces, query, status]);

  const selected = traces.find((trace) => trace.id === selectedId) ?? null;
  const failedTasks = tasks.filter((task) => task.lastError);
  const activeRuns = traces.filter((trace) => trace.status === 'streaming').length;
  const failedRuns = traces.filter((trace) => trace.status === 'error').length;

  const clear = async () => {
    setTraces(await api.traces.clear());
    setSelectedId(null);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-base">
      <div className="app-drag h-11 shrink-0" />
      <header className="px-6 pb-4 border-b border-border flex items-end gap-4">
        <div className="flex-1">
          <h1 className="text-xl font-semibold">Operations</h1>
          <p className="text-xs text-content-muted mt-1">Provider runs, failures, task attention, and memory health.</p>
        </div>
        <button className="btn-outline !px-2.5" title="Refresh operations" onClick={() => void load()} disabled={busy}>
          <RefreshIcon className={clsx('w-4 h-4', busy && 'animate-spin')} />
        </button>
        <button className="btn-danger !px-2.5" title="Clear API traces" onClick={() => void clear()}>
          <TrashIcon className="w-4 h-4" />
        </button>
      </header>

      <div className="px-6 py-2 border-b border-border flex gap-1">
        {(['runs', 'schedules', 'policy'] as const).map((item) => (
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

      {view === 'schedules' ? (
        <SchedulePanel />
      ) : view === 'policy' ? (
        <PolicyPanel />
      ) : (
        <>

      <div className="grid grid-cols-4 gap-3 px-6 py-4 border-b border-border">
        <Metric label="Active runs" value={activeRuns} tone={activeRuns ? 'active' : 'normal'} />
        <Metric label="Failed runs" value={failedRuns} tone={failedRuns ? 'danger' : 'normal'} />
        <Metric label="Tasks needing attention" value={failedTasks.length} tone={failedTasks.length ? 'warning' : 'normal'} />
        <Metric label="Memory health" value={memory?.score ?? '—'} tone={(memory?.score ?? 100) < 70 ? 'danger' : 'active'} />
      </div>

      {error && <div className="mx-6 mt-3 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</div>}

      <div className="px-6 py-3 border-b border-border flex gap-3">
        <input className="field max-w-xl" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search model, provider, agent, or error…" />
        <select className="field !w-40 cursor-pointer" value={status} onChange={(event) => setStatus(event.target.value as ApiTraceStatus | 'all')}>
          <option value="all">All statuses</option>
          <option value="streaming">Streaming</option>
          <option value="done">Done</option>
          <option value="error">Error</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <div className="ml-auto self-center text-[11px] text-content-faint">{visible.length} of {traces.length} runs</div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-[minmax(420px,1.2fr)_minmax(340px,0.8fr)]">
        <section className="overflow-auto border-r border-border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-overlay border-b border-border text-content-faint">
              <tr><th className="px-4 py-2 text-left">Status</th><th className="px-4 py-2 text-left">Target</th><th className="px-4 py-2 text-left">Model</th><th className="px-4 py-2 text-left">Started</th><th className="px-4 py-2 text-right">Chunks</th></tr>
            </thead>
            <tbody>
              {visible.map((trace) => (
                <tr key={trace.id} className={clsx('border-b border-border/70 cursor-pointer hover:bg-white/[0.035]', selectedId === trace.id && 'bg-neon/[0.07]')} onClick={() => setSelectedId(trace.id)}>
                  <td className="px-4 py-2.5"><span className={clsx('chip !py-0.5', STATUS_STYLE[trace.status])}>{trace.status}</span></td>
                  <td className="px-4 py-2.5"><div>{trace.context.agentName ?? 'Chat'}</div><div className="text-[10px] text-content-faint">{trace.providerType}</div></td>
                  <td className="px-4 py-2.5 text-content-muted max-w-48 truncate">{trace.model}</td>
                  <td className="px-4 py-2.5 text-content-muted whitespace-nowrap">{new Date(trace.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right text-content-muted">{trace.response.chunks}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length === 0 && <div className="h-full grid place-items-center text-sm text-content-faint">No matching runs.</div>}
        </section>

        <aside className="min-w-0 overflow-auto bg-overlay/30 p-4">
          {selected ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className={clsx('chip', STATUS_STYLE[selected.status])}>{selected.status}</span>
                <span className="font-mono text-[10px] text-content-faint truncate">{selected.id}</span>
              </div>
              <Detail label="Provider" value={selected.providerType} />
              <Detail label="Model" value={selected.model} />
              <Detail label="Connection" value={selected.connectionId} mono />
              <Detail label="Agent" value={selected.context.agentName ?? 'Generic chat'} />
              <Detail label="Duration" value={selected.response.doneAt ? `${selected.response.doneAt - selected.request.startedAt} ms` : 'Running'} />
              {selected.response.error && <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{selected.response.error}</div>}
              <div>
                <h2 className="label">Request diagnostics</h2>
                <pre className="text-[11px] whitespace-pre-wrap break-words bg-black/20 border border-border rounded-md p-3 text-content-muted">{JSON.stringify({ messageCount: selected.request.messageCount, characterCount: selected.request.characterCount, hasSystemContext: selected.request.hasSystemContext, params: selected.request.params ?? null, startedAt: selected.request.startedAt }, null, 2)}</pre>
              </div>
              <div>
                <h2 className="label">Response</h2>
                <pre className="text-[11px] whitespace-pre-wrap break-words bg-black/20 border border-border rounded-md p-3 text-content-muted max-h-80 overflow-auto">{selected.response.preview || '(empty)'}{selected.response.truncated ? '\n\n[preview truncated]' : ''}</pre>
              </div>
            </div>
          ) : (
            <div className="h-full grid place-items-center text-sm text-content-faint">Select a run.</div>
          )}
        </aside>
      </div>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string | number; tone: 'normal' | 'active' | 'warning' | 'danger' }) {
  return <div className="panel bg-surface px-4 py-3"><div className="text-[10px] uppercase tracking-wider text-content-faint">{label}</div><div className={clsx('text-2xl font-semibold mt-1', tone === 'active' && 'text-neon', tone === 'warning' && 'text-amber-300', tone === 'danger' && 'text-red-300')}>{value}</div></div>;
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div><div className="label">{label}</div><div className={clsx('text-xs break-words', mono && 'font-mono text-content-muted')}>{value}</div></div>;
}
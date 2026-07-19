import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import type {
  MemoryCompressionProposal,
  MemoryDocument,
  MemoryHealth,
  MemoryKind,
  MemoryScope
} from '@shared/types';
import { api } from '@/lib/api';
import { useAgentStore } from '@/store/useAgentStore';
import { CheckIcon, PlusIcon, RefreshIcon } from '@/components/icons';

const KIND_LABELS: Record<MemoryKind, string> = {
  baseline: 'Baseline',
  evergreen: 'Evergreen',
  daily: 'Daily log',
  archive: 'Archive'
};

function defaultName(kind: MemoryKind): string {
  if (kind === 'baseline') return 'MEMORY.md';
  if (kind === 'daily') return `${new Date().toISOString().slice(0, 10)}.md`;
  return 'notes.md';
}

export function MemoryPage() {
  const { agents, init: initAgents } = useAgentStore();
  const [documents, setDocuments] = useState<MemoryDocument[]>([]);
  const [health, setHealth] = useState<MemoryHealth | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [scope, setScope] = useState<MemoryScope | 'all'>('all');
  const [kind, setKind] = useState<MemoryKind | 'all'>('all');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [proposal, setProposal] = useState<MemoryCompressionProposal | null>(null);

  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      const [nextDocuments, nextHealth] = await Promise.all([api.memory.list(), api.memory.health()]);
      setDocuments(nextDocuments);
      setHealth(nextHealth);
      setSelectedId((current) => current ?? nextDocuments[0]?.id ?? null);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void initAgents();
    void load();
  }, [initAgents]);

  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return documents.filter((document) => {
      if (scope !== 'all' && document.scope !== scope) return false;
      if (kind !== 'all' && document.kind !== kind) return false;
      if (!query) return true;
      return `${document.name}\n${document.content}`.toLocaleLowerCase().includes(query);
    });
  }, [documents, kind, scope, search]);

  const selected = documents.find((document) => document.id === selectedId) ?? null;
  useEffect(() => {
    setDraft(selected?.content ?? '');
    setSaved(false);
    setError(null);
  }, [selected?.id, selected?.revision]);

  const save = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.memory.write({
        scope: selected.scope,
        agentId: selected.agentId ?? undefined,
        name: selected.name,
        content: draft,
        expectedRevision: selected.revision
      });
      setDocuments((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      setHealth(await api.memory.health());
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    const nextScope = scope === 'agent' ? 'agent' : 'team';
    const nextKind = kind === 'daily' || kind === 'baseline' ? kind : 'evergreen';
    const agentId = nextScope === 'agent' ? agents[0]?.id : undefined;
    if (nextScope === 'agent' && !agentId) {
      setError('Create an agent before adding agent memory.');
      return;
    }
    const requested = window.prompt('Memory file name', defaultName(nextKind));
    if (!requested) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.memory.write({
        scope: nextScope,
        agentId,
        name: requested,
        content: `# ${requested.replace(/\.md$/, '')}\n`
      });
      await load();
      setSelectedId(created.id);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const proposeCompression = async () => {
    if (!selected?.agentId) return;
    setBusy(true);
    setError(null);
    try {
      setProposal(await api.memory.proposeCompression(selected.agentId));
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const applyCompression = async () => {
    if (!proposal) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.memory.applyCompression(proposal.id);
      setProposal(null);
      await load();
      setSelectedId(updated.id);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-base">
      <div className="app-drag h-11 shrink-0" />
      <header className="px-6 pb-4 border-b border-border flex items-end gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold">Memory</h1>
          <p className="text-xs text-content-muted mt-1">
            Bounded baseline context, durable topic notes, and raw daily logs with protected writes.
          </p>
        </div>
        {health && (
          <div className="text-right">
            <div className="text-2xl font-semibold text-neon">{health.score}</div>
            <div className="text-[10px] uppercase tracking-wider text-content-faint">health score</div>
          </div>
        )}
        <button className="btn-outline !px-2.5" title="Refresh memory" onClick={() => void load()} disabled={busy}>
          <RefreshIcon className={clsx('w-4 h-4', busy && 'animate-spin')} />
        </button>
      </header>

      {health && health.findings.length > 0 && (
        <div className="px-6 py-2 border-b border-border flex gap-2 overflow-x-auto">
          {health.findings.slice(0, 5).map((finding) => (
            <span
              key={`${finding.code}-${finding.documentId ?? 'root'}`}
              className={clsx(
                'chip whitespace-nowrap',
                finding.severity === 'critical'
                  ? 'border-red-500/40 text-red-300'
                  : finding.severity === 'warning'
                    ? 'border-amber-500/40 text-amber-300'
                    : 'border-borderStrong'
              )}
              title={finding.message}
            >
              {finding.message}
            </span>
          ))}
        </div>
      )}

      <div className="flex-1 min-h-0 grid grid-cols-[300px_minmax(0,1fr)]">
        <aside className="border-r border-border flex flex-col min-h-0 bg-overlay/30">
          <div className="p-3 border-b border-border space-y-2">
            <input
              className="field"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search memory…"
            />
            <div className="grid grid-cols-2 gap-2">
              <select className="field !py-1.5 cursor-pointer" value={scope} onChange={(event) => setScope(event.target.value as MemoryScope | 'all')}>
                <option value="all">All scopes</option>
                <option value="team">Team</option>
                <option value="agent">Agent</option>
              </select>
              <select className="field !py-1.5 cursor-pointer" value={kind} onChange={(event) => setKind(event.target.value as MemoryKind | 'all')}>
                <option value="all">All types</option>
                <option value="baseline">Baseline</option>
                <option value="evergreen">Evergreen</option>
                <option value="daily">Daily logs</option>
                <option value="archive">Archive</option>
              </select>
            </div>
            <button className="btn-primary w-full" onClick={() => void create()}>
              <PlusIcon className="w-4 h-4" /> New memory file
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto p-2 space-y-1">
            {visible.map((document) => (
              <button
                key={document.id}
                className={clsx(
                  'w-full text-left rounded-lg border px-3 py-2 transition-colors',
                  document.id === selectedId
                    ? 'border-neon/40 bg-neon/10'
                    : 'border-transparent hover:border-border hover:bg-white/[0.03]'
                )}
                onClick={() => setSelectedId(document.id)}
              >
                <div className="text-sm truncate">{document.name}</div>
                <div className="text-[10px] text-content-faint mt-0.5 flex justify-between gap-2">
                  <span>{document.agentId ? agents.find((agent) => agent.id === document.agentId)?.name ?? document.agentId : 'Team'}</span>
                  <span>{KIND_LABELS[document.kind]} · {document.lineCount} lines</span>
                </div>
              </button>
            ))}
            {visible.length === 0 && <p className="text-xs text-content-faint px-3 py-6 text-center">No memory files match.</p>}
          </nav>
        </aside>

        <section className="min-w-0 flex flex-col min-h-0">
          {selected ? (
            <>
              <div className="px-5 py-3 border-b border-border flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm font-semibold truncate">{selected.id}</h2>
                  <p className="text-[10px] text-content-faint">
                    {selected.sizeBytes.toLocaleString()} bytes · updated {new Date(selected.updatedAt).toLocaleString()}
                  </p>
                </div>
                {selected.kind === 'baseline' && (
                  <span className={clsx('chip', selected.lineCount >= 150 && 'border-amber-500/40 text-amber-300')}>
                    {draft ? draft.split(/\r?\n/).length : 0}/200 lines
                  </span>
                )}
                {selected.agentId && selected.kind === 'baseline' && (
                  <button className="btn-outline" onClick={() => void proposeCompression()} disabled={busy}>
                    Compress logs
                  </button>
                )}
                <button className="btn-primary" onClick={() => void save()} disabled={busy || draft === selected.content}>
                  {saved ? <CheckIcon className="w-4 h-4" /> : null}
                  {saved ? 'Saved' : 'Save'}
                </button>
              </div>
              {error && <div className="mx-5 mt-3 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</div>}
              <textarea
                className="flex-1 min-h-0 resize-none bg-transparent px-5 py-4 font-mono text-sm leading-relaxed outline-none"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                spellCheck={false}
              />
            </>
          ) : (
            <div className="flex-1 grid place-items-center text-sm text-content-faint">Select a memory file.</div>
          )}
        </section>
      </div>
      {proposal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm p-6 grid place-items-center" onMouseDown={() => setProposal(null)}>
          <div className="panel bg-surface w-full max-w-3xl max-h-[85vh] flex flex-col" onMouseDown={(event) => event.stopPropagation()}>
            <header className="px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold">Review memory compression</h2>
              <p className="text-[11px] text-content-muted mt-1">
                {proposal.sourceDocumentIds.length} daily logs will be archived only after this proposal is applied.
              </p>
            </header>
            {proposal.warnings.length > 0 && <div className="mx-5 mt-3 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">{proposal.warnings.join(' ')}</div>}
            <pre className="flex-1 min-h-0 overflow-auto m-5 text-xs whitespace-pre-wrap break-words font-mono bg-black/20 border border-border rounded-md p-4">{proposal.proposedContent}</pre>
            <footer className="px-5 py-4 border-t border-border flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setProposal(null)}>Cancel</button>
              <button className="btn-primary" onClick={() => void applyCompression()} disabled={busy}>Apply and archive logs</button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
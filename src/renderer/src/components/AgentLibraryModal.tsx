import { useState } from 'react';
import clsx from 'clsx';
import { AGENT_LIBRARY, type AgentLibraryCategory } from '@/lib/agentLibrary';
import { useAgentStore } from '@/store/useAgentStore';
import { Modal } from './Modal';
import { PlusIcon } from './icons';

const CATEGORIES: Array<'All' | AgentLibraryCategory> = [
  'All',
  'Communication',
  'Productivity',
  'Operations',
  'Insights'
];

export function AgentLibraryModal({
  onClose,
  onAdded
}: {
  onClose: () => void;
  onAdded: (id: string) => void;
}) {
  const { agents, createAgent } = useAgentStore();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('All');
  const [addingId, setAddingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const root = agents.find((agent) => agent.role === 'orchestrator' && !agent.archived);
  const normalizedQuery = query.trim().toLowerCase();
  const templates = AGENT_LIBRARY.filter(
    (template) =>
      (category === 'All' || template.category === category) &&
      (!normalizedQuery ||
        `${template.name} ${template.title} ${template.description}`
          .toLowerCase()
          .includes(normalizedQuery))
  );

  const add = async (template: (typeof AGENT_LIBRARY)[number]) => {
    if (!root || !template.ready) return;
    setAddingId(template.id);
    setError(null);
    try {
      const agent = await createAgent({
        role: 'specialist',
        icon: template.icon,
        name: template.name,
        title: template.title,
        soul: template.soul,
        reportsTo: root.id
      });
      onAdded(agent.id);
    } catch (reason) {
      setError((reason as Error).message);
      setAddingId(null);
    }
  };

  return (
    <Modal title="Agent library" onClose={onClose} wide>
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold">Choose a specialist</h3>
          <p className="mt-1 text-xs text-content-muted">
            Add a prepared agent to your team. Pending templates show the exact soul file a human
            author must complete.
          </p>
        </div>

        <input
          className="field"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Search agents..."
          aria-label="Search agent library"
        />

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Agent categories">
          {CATEGORIES.map((item) => (
            <button
              key={item}
              type="button"
              className={clsx(
                'rounded-md border px-2.5 py-1 text-xs transition-colors',
                category === item
                  ? 'border-neon/50 bg-neon/15 text-neon'
                  : 'border-border text-content-muted hover:border-borderStrong'
              )}
              aria-pressed={category === item}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {templates.map((template) => (
            <article
              key={template.id}
              className="flex min-h-48 flex-col rounded-lg border border-border bg-overlay/50 p-4"
            >
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-borderStrong bg-white/5 text-xl">
                  {template.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="truncate text-sm font-semibold">{template.name}</h4>
                  <p className="truncate text-[11px] text-content-faint">{template.title}</p>
                </div>
                <span
                  className={clsx(
                    'rounded-full border px-2 py-0.5 text-[10px]',
                    template.ready
                      ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
                      : 'border-amber-400/40 bg-amber-400/10 text-amber-300'
                  )}
                >
                  {template.ready ? 'Ready' : 'Soul pending'}
                </span>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-content-muted">
                {template.description}
              </p>
              <div className="mt-auto pt-4">
                {!template.ready && (
                  <code className="mb-2 block break-all text-[10px] text-content-faint">
                    {template.soulFile}
                  </code>
                )}
                <button
                  className="btn-primary w-full justify-center !py-1.5"
                  disabled={!root || !template.ready || addingId !== null}
                  title={template.ready ? `Add ${template.name}` : `Complete ${template.soulFile} first`}
                  onClick={() => void add(template)}
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                  {addingId === template.id
                    ? 'Adding...'
                    : template.ready
                      ? 'Add to team'
                      : 'Awaiting soul'}
                </button>
              </div>
            </article>
          ))}
        </div>

        {templates.length === 0 && (
          <div className="py-10 text-center text-sm text-content-faint">
            No agents match this search.
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300" role="alert">
            Could not add agent: {error}
          </div>
        )}
      </div>
    </Modal>
  );
}

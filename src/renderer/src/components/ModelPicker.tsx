import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { useAppStore } from '@/store/useAppStore';
import { CheckIcon, ChevronDownIcon, RefreshIcon } from './icons';

export function ModelPicker() {
  const {
    models,
    modelsLoading,
    modelsError,
    settings,
    connections,
    setActiveModel,
    loadModels
  } = useAppStore();

  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const activeConnId = settings?.activeConnectionId ?? null;
  const active = settings?.activeModel ?? '';
  const disabled = !activeConnId || !connections.some((c) => c.id === activeConnId);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const q = filter.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      q
        ? models.filter(
            (m) =>
              m.id.toLowerCase().includes(q) || (m.label ?? '').toLowerCase().includes(q)
          )
        : models,
    [models, q]
  );
  const exactMatch = models.some((m) => m.id.toLowerCase() === q);
  const showCustom = q.length > 0 && !exactMatch;

  const choose = (id: string) => {
    void setActiveModel(id);
    setOpen(false);
    setFilter('');
  };

  return (
    <div className="relative app-no-drag" ref={ref}>
      <button
        type="button"
        className={clsx(
          'field w-64 flex items-center justify-between gap-2 cursor-pointer',
          disabled && 'opacity-50 pointer-events-none'
        )}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={clsx('truncate', !active && 'text-content-faint')}>
          {active || (modelsLoading ? 'Loading models…' : 'Select model…')}
        </span>
        <ChevronDownIcon className="w-4 h-4 shrink-0 opacity-60" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-40 w-72 panel bg-surface shadow-neon-lg flex flex-col max-h-[22rem] overflow-hidden">
          <div className="p-2 border-b border-border">
            <input
              autoFocus
              className="field !py-1.5"
              placeholder="Search or type a model…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (filtered.length > 0) choose(filtered[0].id);
                  else if (q) choose(filter.trim());
                } else if (e.key === 'Escape') {
                  setOpen(false);
                }
              }}
            />
          </div>

          <div className="overflow-y-auto py-1">
            {showCustom && (
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm text-neon hover:bg-white/5"
                onClick={() => choose(filter.trim())}
              >
                Use &ldquo;{filter.trim()}&rdquo;
              </button>
            )}
            {filtered.map((m) => (
              <button
                key={m.id}
                type="button"
                className={clsx(
                  'w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-white/5',
                  m.id === active ? 'text-neon' : 'text-content'
                )}
                onClick={() => choose(m.id)}
                title={m.id}
              >
                <span className="w-4 shrink-0">
                  {m.id === active && <CheckIcon className="w-3.5 h-3.5" />}
                </span>
                <span className="truncate">{m.label ?? m.id}</span>
              </button>
            ))}
            {filtered.length === 0 && !showCustom && (
              <div className="px-3 py-4 text-xs text-content-faint text-center">
                {modelsLoading ? 'Loading models…' : 'No models found.'}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-t border-border">
            <span className="text-[11px] text-content-faint truncate">
              {modelsError ? 'List unavailable — type a name' : `${models.length} model${models.length === 1 ? '' : 's'}`}
            </span>
            <button
              type="button"
              className="text-content-faint hover:text-neon"
              title="Refresh model list"
              onClick={() => activeConnId && void loadModels(activeConnId)}
            >
              <RefreshIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

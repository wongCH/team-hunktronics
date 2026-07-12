import { useEffect, useState } from 'react';
import clsx from 'clsx';
import type { LocalDataCollection, LocalDataResult } from '@shared/types';
import { api } from '@/lib/api';
import { DatabaseIcon, RefreshIcon } from '@/components/icons';

const COLLECTIONS: Array<{ id: LocalDataCollection; label: string }> = [
  { id: 'connections', label: 'Connections' },
  { id: 'conversations', label: 'Conversations' },
  { id: 'agents', label: 'Agents' },
  { id: 'traces', label: 'API traces' },
  { id: 'settings', label: 'Settings' }
];

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

export function DataExplorerPage() {
  const [collection, setCollection] = useState<LocalDataCollection>('conversations');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(100);
  const [result, setResult] = useState<LocalDataResult | null>(null);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void api.localData
      .query({ collection, search, limit })
      .then((next) => {
        if (cancelled) return;
        setResult(next);
        setSelected(next.rows[0] ?? null);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError((reason as Error).message);
        setResult(null);
        setSelected(null);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [collection, search, limit, refreshKey]);

  const columns = Array.from(
    new Set((result?.rows ?? []).flatMap((row) => Object.keys(row)))
  ).slice(0, 6);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-base">
      <div className="app-drag h-11 shrink-0" />
      <header className="px-6 pb-4 border-b border-border flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <DatabaseIcon className="w-5 h-5 text-neon" />
            <h1 className="text-xl font-semibold">Local Data Explorer</h1>
          </div>
          <p className="text-xs text-content-muted mt-1">
            Read-only access to application data. Encrypted vault contents are never exposed.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="chip border-neon/30 text-neon">JSON store</span>
          <button
            className="btn-outline !px-2.5"
            type="button"
            title="Refresh data"
            aria-label="Refresh data"
            onClick={() => setRefreshKey((value) => value + 1)}
            disabled={loading}
          >
            <RefreshIcon className={clsx('w-4 h-4', loading && 'animate-spin')} />
          </button>
        </div>
      </header>

      <div className="px-6 py-3 border-b border-border flex flex-wrap gap-2">
        {COLLECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={clsx(
              'px-3 py-1.5 text-xs border rounded-md transition-colors',
              collection === item.id
                ? 'border-neon/50 bg-neon/10 text-neon'
                : 'border-border text-content-muted hover:text-content hover:border-borderStrong'
            )}
            onClick={() => setCollection(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="px-6 py-3 border-b border-border flex items-center gap-3">
        <input
          className="field max-w-xl"
          type="search"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder={`Search ${collection}…`}
          aria-label={`Search ${collection}`}
        />
        <label className="flex items-center gap-2 text-xs text-content-muted whitespace-nowrap">
          Rows
          <select
            className="field !w-auto !py-2"
            value={limit}
            onChange={(event) => setLimit(Number(event.target.value))}
          >
            {[25, 50, 100, 250, 500].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <div className="ml-auto text-[11px] text-content-faint whitespace-nowrap">
          {result && `${result.returned} shown · ${result.matched} matched · ${result.total} total`}
        </div>
      </div>

      {error ? (
        <div className="m-6 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
          {error}
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,1.65fr)_minmax(300px,0.85fr)]">
          <section
            className="min-w-0 overflow-auto border-r border-border"
            aria-label="Query results"
          >
            {loading && !result ? (
              <div className="h-full grid place-items-center text-sm text-content-faint">
                Loading data…
              </div>
            ) : !result?.rows.length ? (
              <div className="h-full grid place-items-center text-sm text-content-faint">
                No matching records.
              </div>
            ) : (
              <table className="w-full text-xs table-fixed">
                <thead className="sticky top-0 z-10 bg-overlay border-b border-border text-content-faint">
                  <tr>
                    <th className="w-12 px-3 py-2 text-right font-medium">#</th>
                    {columns.map((column) => (
                      <th key={column} className="px-3 py-2 text-left font-medium truncate">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, index) => (
                    <tr
                      key={`${String(row.id ?? 'row')}-${index}`}
                      className={clsx(
                        'border-b border-border/70 cursor-pointer hover:bg-white/[0.035]',
                        selected === row && 'bg-neon/[0.07]'
                      )}
                      onClick={() => setSelected(row)}
                    >
                      <td className="px-3 py-2 text-right text-content-faint">{index + 1}</td>
                      {columns.map((column) => (
                        <td
                          key={column}
                          className="px-3 py-2 truncate text-content-muted"
                          title={displayValue(row[column])}
                        >
                          {displayValue(row[column])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <aside className="min-w-0 overflow-auto bg-overlay/30 p-4" aria-label="Selected record">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="text-sm font-semibold">Record inspector</h2>
              {selected?.id !== undefined && (
                <span className="font-mono text-[10px] text-content-faint truncate">
                  {String(selected.id)}
                </span>
              )}
            </div>
            {selected ? (
              <pre className="text-[11px] leading-relaxed whitespace-pre-wrap break-words font-mono text-content-muted border border-border bg-black/20 rounded-md p-3">
                {JSON.stringify(selected, null, 2)}
              </pre>
            ) : (
              <p className="text-xs text-content-faint">
                Select a record to inspect its full JSON.
              </p>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

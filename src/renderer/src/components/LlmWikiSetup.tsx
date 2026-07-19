import { useEffect, useState } from 'react';
import type { LlmWikiStatus } from '@shared/types';
import { api } from '@/lib/api';

export function LlmWikiSetup({ onDone }: { onDone?: () => void }) {
  const [status, setStatus] = useState<LlmWikiStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<LlmWikiStatus>) => {
    setBusy(true);
    setError(null);
    try {
      const next = await action();
      setStatus(next);
      if (next.state === 'ready') onDone?.();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void api.llmWiki.status().then(setStatus).catch((reason: Error) => setError(reason.message));
  }, []);

  if (!status) {
    return <div className="panel bg-surface p-4 text-sm text-content-muted" role="status">Checking for a human llm-wiki vault…</div>;
  }

  const ready = status.state === 'ready';
  const found = status.state === 'found';
  return (
    <div className="panel bg-surface p-4 space-y-3" role="status">
      <div>
        <div className="text-sm font-semibold">
          {ready ? 'Human llm-wiki referenced' : found ? 'Use this llm-wiki vault?' : 'Set up human llm-wiki'}
        </div>
        <div className="text-[11px] text-content-muted mt-1 break-all">
          {status.path ?? status.message}
        </div>
        {ready && (
          <div className="text-[11px] text-content-faint mt-1">
            {status.pageCount} Markdown pages · read-only context for all agents
          </div>
        )}
      </div>
      {error && <div className="text-xs text-red-300" role="alert">{error}</div>}
      <div className="flex flex-wrap gap-2">
        {found && (
          <button className="btn-primary" disabled={busy} onClick={() => void run(api.llmWiki.referenceFound)}>
            Reference vault
          </button>
        )}
        {!ready && (
          <button className="btn-outline" disabled={busy} onClick={() => void run(api.llmWiki.choose)}>
            Choose existing…
          </button>
        )}
        {!ready && (
          <button className="btn-outline" disabled={busy} onClick={() => void run(api.llmWiki.create)}>
            Create LLM-Vault…
          </button>
        )}
        {ready && (
          <button className="btn-outline" disabled={busy} onClick={() => void run(api.llmWiki.choose)}>
            Change…
          </button>
        )}
        {ready && (
          <button className="btn-ghost" disabled={busy} onClick={() => void run(api.llmWiki.remove)}>
            Remove reference
          </button>
        )}
        {onDone && !ready && (
          <button className="btn-ghost" disabled={busy} onClick={onDone}>Not now</button>
        )}
      </div>
      <p className="text-[11px] text-content-faint">
        The vault belongs to the human user. Agents receive bounded read-only context and cannot write to it.
      </p>
    </div>
  );
}
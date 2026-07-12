import { useState } from 'react';
import type { ConnectionConfig, ProviderType } from '@shared/types';
import { PROVIDER_META } from '@shared/types';
import { useAppStore } from '@/store/useAppStore';
import { ConnectionForm } from './ConnectionForm';
import { CheckIcon, ChevronDownIcon, PlusIcon } from './icons';

type View = { kind: 'list' } | { kind: 'pick' } | { kind: 'form'; conn: ConnectionConfig };

const ORDER: ProviderType[] = [
  'ollama',
  'openai',
  'anthropic',
  'github-models',
  'copilot',
  'lm-studio',
  'openai-compatible'
];

export function ConnectionsManager() {
  const connections = useAppStore((s) => s.connections);
  const [view, setView] = useState<View>({ kind: 'list' });

  const startNew = (type: ProviderType) => {
    const now = Date.now();
    const meta = PROVIDER_META[type];
    setView({
      kind: 'form',
      conn: {
        id: crypto.randomUUID(),
        providerType: type,
        label: meta.name,
        baseUrl: meta.needsBaseUrl ? meta.defaultBaseUrl : undefined,
        defaultModel: undefined,
        hasKey: false,
        createdAt: now,
        updatedAt: now
      }
    });
  };

  const BackButton = () => (
    <button
      className="btn-ghost !px-2 mb-3 -ml-1 text-content-muted"
      onClick={() => setView({ kind: 'list' })}
    >
      <ChevronDownIcon className="w-4 h-4 rotate-90" /> Back
    </button>
  );

  if (view.kind === 'form') {
    return (
      <div>
        <BackButton />
        <ConnectionForm initial={view.conn} onDone={() => setView({ kind: 'list' })} />
      </div>
    );
  }

  if (view.kind === 'pick') {
    return (
      <div>
        <BackButton />
        <p className="text-xs text-content-muted mb-3">Choose a backend to connect:</p>
        <div className="grid grid-cols-2 gap-3">
          {ORDER.map((type) => {
            const meta = PROVIDER_META[type];
            return (
              <button
                key={type}
                className="panel bg-overlay text-left p-4 hover:border-neon/50 hover:shadow-neon-sm transition-all"
                onClick={() => startNew(type)}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{meta.name}</span>
                  {meta.experimental && (
                    <span className="chip !py-0.5 border-amber-500/40 text-amber-300">exp</span>
                  )}
                </div>
                <p className="text-[11px] text-content-faint mt-1.5 leading-snug">
                  {meta.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {connections.length === 0 ? (
        <div className="text-center py-10 text-sm text-content-muted">
          No connections yet. Add your first backend to start chatting.
        </div>
      ) : (
        <div className="space-y-2">
          {connections.map((c) => {
            const meta = PROVIDER_META[c.providerType];
            return (
              <button
                key={c.id}
                className="panel bg-overlay w-full text-left p-3.5 flex items-center gap-3 hover:border-borderStrong transition-colors"
                onClick={() => setView({ kind: 'form', conn: c })}
              >
                <div className="w-9 h-9 rounded-lg bg-neon/10 border border-neon/30 flex items-center justify-center text-neon shrink-0">
                  ◈
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{c.label}</div>
                  <div className="text-[11px] text-content-faint">{meta.name}</div>
                </div>
                {(meta.needsKey || meta.supportsDeviceFlow) &&
                  (c.hasKey ? (
                    <span className="chip !py-0.5 border-emerald-500/40 text-emerald-300">
                      <CheckIcon className="w-3 h-3" /> key
                    </span>
                  ) : (
                    <span className="chip !py-0.5 border-amber-500/40 text-amber-300">no key</span>
                  ))}
              </button>
            );
          })}
        </div>
      )}

      <button className="btn-primary w-full" onClick={() => setView({ kind: 'pick' })}>
        <PlusIcon className="w-4 h-4" /> Add connection
      </button>
    </div>
  );
}

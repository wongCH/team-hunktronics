import { useState } from 'react';
import clsx from 'clsx';
import { useAppStore } from '@/store/useAppStore';
import { api } from '@/lib/api';
import { ConnectionsManager } from '@/components/ConnectionsManager';

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={clsx(
        'relative w-11 h-6 rounded-full transition-colors shrink-0',
        on ? 'bg-neon/70 shadow-neon-sm' : 'bg-white/10'
      )}
    >
      <span
        className={clsx(
          'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform',
          on && 'translate-x-5'
        )}
      />
    </button>
  );
}

export function SettingsPage() {
  const { settings, vault, updateSettings } = useAppStore();
  const [clientId, setClientId] = useState(settings?.githubClientId ?? '');

  if (!settings) return null;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="app-drag h-11 shrink-0" />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-4 pb-12 space-y-8">
          <div>
            <h1 className="text-2xl font-semibold mb-1">Settings</h1>
            <p className="text-content-muted text-sm">Manage backends and application preferences.</p>
          </div>

          <section>
            <h2 className="text-sm font-semibold mb-3">Connections</h2>
            <div className="panel bg-surface p-4">
              <ConnectionsManager />
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold mb-3">Security</h2>
            <div className="panel bg-surface p-3.5 flex items-center gap-3">
              <span
                className={clsx(
                  'w-2 h-2 rounded-full',
                  vault?.available ? 'bg-emerald-400 shadow-neon-sm' : 'bg-amber-400'
                )}
              />
              <div className="text-sm">
                {vault?.available ? 'Keys are encrypted at rest' : 'OS encryption unavailable'}
                <div className="text-[11px] text-content-faint">Backend: {vault?.backend ?? 'unknown'}</div>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold mb-3">Experimental</h2>
            <div className="panel bg-surface p-3.5 flex items-start gap-3">
              <Toggle
                on={settings.experimentalCopilot}
                onChange={(v) => void updateSettings({ experimentalCopilot: v })}
              />
              <div className="text-sm">
                Enable GitHub Copilot backend
                <div className="text-[11px] text-content-faint mt-0.5 max-w-sm">
                  Uses your Copilot subscription via device login. This is unofficial and may violate
                  GitHub's Terms of Service. Off by default.
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold mb-3">GitHub device login</h2>
            <label className="label">OAuth client id (advanced)</label>
            <div className="flex gap-2">
              <input
                className="field font-mono text-xs"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              />
              <button
                className="btn-outline"
                onClick={() => void updateSettings({ githubClientId: clientId.trim() })}
              >
                Save
              </button>
            </div>
            <p className="text-[11px] text-content-faint mt-1.5">
              Client id used for the GitHub device flow. Defaults to the public Copilot client id.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold mb-3">About</h2>
            <p className="text-xs text-content-muted">
              Agent Control Panel · v0.1.0 · dark / neon-blue theme. All data and encrypted keys are
              stored locally on this machine.
            </p>
            <button
              className="btn-ghost !px-2 mt-1 text-xs"
              onClick={() => void api.shell.openExternal('https://ollama.com')}
            >
              Get Ollama for local models →
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}

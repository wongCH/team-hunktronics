import { useState } from 'react';
import clsx from 'clsx';
import { useAppStore } from '@/store/useAppStore';
import { api } from '@/lib/api';

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

export function SettingsModal() {
  const { settings, vault, updateSettings } = useAppStore();
  const [clientId, setClientId] = useState(settings?.githubClientId ?? '');

  if (!settings) return null;

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-sm font-semibold mb-2">Security</h3>
        <div className="panel bg-overlay p-3.5 flex items-center gap-3">
          <span
            className={clsx(
              'w-2 h-2 rounded-full',
              vault?.available ? 'bg-emerald-400 shadow-neon-sm' : 'bg-amber-400'
            )}
          />
          <div className="text-sm">
            {vault?.available ? 'Keys are encrypted at rest' : 'OS encryption unavailable'}
            <div className="text-[11px] text-content-faint">
              Backend: {vault?.backend ?? 'unknown'}
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold mb-2">Experimental</h3>
        <div className="panel bg-overlay p-3.5 flex items-start gap-3">
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
        <h3 className="text-sm font-semibold mb-2">GitHub device login</h3>
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
        <h3 className="text-sm font-semibold mb-2">About</h3>
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
  );
}

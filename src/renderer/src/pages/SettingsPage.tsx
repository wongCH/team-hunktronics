import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { APP_THEMES, isAppTheme, type SkillDefinition } from '@shared/types';
import { useAppStore } from '@/store/useAppStore';
import { api } from '@/lib/api';
import { ConnectionsManager } from '@/components/ConnectionsManager';
import { PlusIcon, TrashIcon } from '@/components/icons';
import { LlmWikiSetup } from '@/components/LlmWikiSetup';

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
  const [skills, setSkills] = useState<SkillDefinition[]>([]);
  const [skillError, setSkillError] = useState<string | null>(null);

  useEffect(() => {
    void api.skills
      .list()
      .then(setSkills)
      .catch((error: Error) => setSkillError(error.message));
  }, []);

  if (!settings) return null;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="app-drag h-11 shrink-0" />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-4 pb-12 space-y-8">
          <div>
            <h1 className="text-2xl font-semibold mb-1">Settings</h1>
            <p className="text-content-muted text-sm">
              Manage backends and application preferences.
            </p>
          </div>

          <section>
            <h2 className="text-sm font-semibold mb-3">Appearance</h2>
            <div className="panel bg-surface p-4">
              <label className="label" htmlFor="app-theme">
                Theme
              </label>
              <select
                id="app-theme"
                className="field cursor-pointer"
                value={settings.theme}
                onChange={(event) => {
                  const theme = event.currentTarget.value;
                  if (!isAppTheme(theme)) throw new Error(`Unsupported theme: ${theme}`);
                  void updateSettings({ theme });
                }}
              >
                {APP_THEMES.map((theme) => (
                  <option key={theme.id} value={theme.id}>
                    {theme.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-content-faint mt-1.5">
                Applies immediately across the application and is remembered for future launches.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold mb-3">Connections</h2>
            <div className="panel bg-surface p-4">
              <ConnectionsManager />
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold mb-3">Human llm-wiki</h2>
            <LlmWikiSetup />
          </section>

          <section>
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1">
                <h2 className="text-sm font-semibold">Skills library</h2>
                <p className="text-[11px] text-content-faint mt-0.5">
                  Import Markdown instructions, then assign them in the agent editor.
                </p>
              </div>
              <button
                className="btn-primary"
                onClick={() => {
                  setSkillError(null);
                  void api.skills
                    .import()
                    .then(setSkills)
                    .catch((error: Error) => setSkillError(error.message));
                }}
              >
                <PlusIcon className="w-4 h-4" /> Import skill
              </button>
            </div>
            <div className="panel bg-surface overflow-hidden">
              {skills.map((skill) => (
                <div
                  key={skill.id}
                  className="px-4 py-3 border-b border-border last:border-0 flex items-center gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{skill.name}</div>
                    <div className="text-[11px] text-content-faint truncate">
                      {skill.description} · {skill.sourceFile}
                    </div>
                  </div>
                  <button
                    className="btn-danger !p-2"
                    title={`Delete ${skill.name}`}
                    onClick={() => void api.skills.delete(skill.id).then(setSkills)}
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {skills.length === 0 && (
                <p className="px-4 py-5 text-xs text-content-faint">No uploaded skills yet.</p>
              )}
            </div>
            {skillError && <p className="mt-2 text-xs text-red-300">{skillError}</p>}
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
                <div className="text-[11px] text-content-faint">
                  Backend: {vault?.backend ?? 'unknown'}
                </div>
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
                  Uses your Copilot subscription via device login. This is unofficial and may
                  violate GitHub's Terms of Service. Off by default.
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
              Agent Control Panel · v0.1.0. All data and encrypted keys are stored locally on this
              machine.
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

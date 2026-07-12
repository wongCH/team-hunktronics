import { useAppStore } from '@/store/useAppStore';
import { PROVIDER_META } from '@shared/types';
import { PlugIcon } from './icons';
import { ModelPicker } from './ModelPicker';

export function TopBar() {
  const { connections, settings, setActiveConnection, setPage } = useAppStore();

  const activeConn = connections.find((c) => c.id === settings?.activeConnectionId);

  return (
    <header className="app-drag h-14 shrink-0 flex items-center gap-3 px-4 border-b border-border bg-surface/50">
      {connections.length === 0 ? (
        <button className="btn-primary app-no-drag" onClick={() => setPage('settings')}>
          <PlugIcon className="w-4 h-4" /> Add a connection
        </button>
      ) : (
        <div className="app-no-drag flex items-center gap-2">
          <select
            className="field w-52 cursor-pointer"
            value={settings?.activeConnectionId ?? ''}
            onChange={(e) => void setActiveConnection(e.target.value || null)}
          >
            <option value="">Select connection…</option>
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>

          <ModelPicker />
        </div>
      )}

      <div className="ml-auto app-no-drag flex items-center gap-2">
        {activeConn && (
          <span className="chip">
            <span className="w-2 h-2 rounded-full bg-neon shadow-neon-sm" />
            {PROVIDER_META[activeConn.providerType].name}
          </span>
        )}
      </div>
    </header>
  );
}

import clsx from 'clsx';
import { useAppStore, type Page } from '@/store/useAppStore';
import { ActivityIcon, DashboardIcon, BotIcon, ChatIcon, DatabaseIcon, MemoryIcon, SettingsIcon, TasksIcon } from './icons';

const ITEMS: { id: Page; label: string; Icon: typeof BotIcon }[] = [
  { id: 'dashboard', label: 'Dashboard', Icon: DashboardIcon },
  { id: 'agents', label: 'Agents', Icon: BotIcon },
  { id: 'tasks', label: 'Tasks', Icon: TasksIcon },
  { id: 'chat', label: 'Chat', Icon: ChatIcon },
  { id: 'memory', label: 'Memory', Icon: MemoryIcon },
  { id: 'operations', label: 'Ops', Icon: ActivityIcon },
  { id: 'data', label: 'Data', Icon: DatabaseIcon },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon }
];

export function NavRail() {
  const page = useAppStore((s) => s.page);
  const setPage = useAppStore((s) => s.setPage);
  const vault = useAppStore((s) => s.vault);

  return (
    <nav className="w-[78px] shrink-0 flex flex-col items-center bg-overlay border-r border-border">
      <div className="app-drag h-11 w-full" />
      <div className="app-no-drag text-neon neon-text text-xl mb-3">◈</div>
      <div className="app-no-drag flex flex-col gap-1.5 w-full px-2">
        {ITEMS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setPage(id)}
            className={clsx(
              'flex flex-col items-center gap-1 rounded-xl py-2.5 text-[10px] font-medium transition-all',
              page === id
                ? 'bg-neon/15 text-neon border border-neon/40 shadow-neon-sm'
                : 'text-content-faint border border-transparent hover:text-content hover:bg-white/5'
            )}
          >
            <Icon className="w-5 h-5" />
            {label}
          </button>
        ))}
      </div>
      <div
        className="app-no-drag mt-auto mb-4"
        title={vault?.available ? `Encrypted · ${vault.backend}` : 'Encryption unavailable'}
      >
        <span
          className={clsx(
            'block w-2 h-2 rounded-full',
            vault?.available ? 'bg-emerald-400 shadow-neon-sm' : 'bg-amber-400'
          )}
        />
      </div>
    </nav>
  );
}

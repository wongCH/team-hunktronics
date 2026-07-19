import clsx from 'clsx';
import type { AgentIcon, AgentRole } from '@shared/types';
import { AGENT_ICONS, DEFAULT_AGENT_ICONS } from '@shared/types';

export function getAgentIcon(icon: AgentIcon | undefined, role: AgentRole): AgentIcon {
  return icon ?? DEFAULT_AGENT_ICONS[role];
}

export function AgentIconPicker({
  value,
  onChange
}: {
  value: AgentIcon;
  onChange: (icon: AgentIcon) => void;
}) {
  return (
    <div className="grid grid-cols-5 gap-2" role="group" aria-label="Agent icon">
      {AGENT_ICONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={clsx(
            'grid aspect-square min-w-0 place-items-center rounded-lg border text-xl transition-colors',
            value === option.value
              ? 'border-neon bg-neon/15 shadow-neon-sm'
              : 'border-border bg-white/5 hover:border-borderStrong hover:bg-white/10'
          )}
          aria-label={option.label}
          aria-pressed={value === option.value}
          title={option.label}
          onClick={() => onChange(option.value)}
        >
          {option.value}
        </button>
      ))}
    </div>
  );
}

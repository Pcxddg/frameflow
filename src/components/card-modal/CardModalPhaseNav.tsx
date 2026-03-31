import type { PanelId, CardDerived } from './types';
import { PANEL_ORDER, PANEL_CONFIG } from './constants';

interface CardModalPhaseNavProps {
  activePanel: PanelId;
  onSelectPanel: (id: PanelId) => void;
  showAll: boolean;
  onToggleShowAll: () => void;
  derived: CardDerived;
}

export function CardModalPhaseNav({ activePanel, onSelectPanel, showAll, onToggleShowAll, derived }: CardModalPhaseNavProps) {
  return (
    <div className="shrink-0 px-4 py-2.5 sm:px-5" style={{ borderBottom: '1px solid var(--ff-border)', background: 'var(--ff-surface-solid)' }}>
      <div className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1 ff-scrollbar">
        {PANEL_ORDER.map(id => {
          const config = PANEL_CONFIG[id];
          const isActive = activePanel === id;
          const isCurrent = derived.phase.panel === id;
          return (
            <button
              key={id}
              onClick={() => onSelectPanel(id)}
              className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold transition-all whitespace-nowrap ${isActive ? 'shadow-sm' : ''}`}
              style={{
                background: isActive ? 'var(--ff-primary)' : isCurrent ? 'color-mix(in srgb, var(--ff-primary) 12%, var(--ff-surface-solid))' : 'var(--ff-bg-subtle)',
                color: isActive ? 'white' : isCurrent ? 'var(--ff-primary)' : 'var(--ff-text-secondary)',
              }}
            >
              {config.title}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {derived.flowScheduleLabel && (
            <span className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase" style={{ background: 'var(--ff-surface-raised)', border: '1px solid var(--ff-border)', color: 'var(--ff-text-secondary)' }}>
              {derived.flowScheduleLabel}
            </span>
          )}
          {derived.flowWorkingDaysLabel && (
            <span className="text-[11px]" style={{ color: 'var(--ff-text-secondary)' }}>{derived.flowWorkingDaysLabel}</span>
          )}
        </div>
        <button
          onClick={onToggleShowAll}
          className="text-[11px] font-medium underline decoration-dotted underline-offset-2"
          style={{ color: 'var(--ff-text-tertiary)' }}
        >
          {showAll ? 'Solo lo de esta fase' : 'Ver todo'}
        </button>
      </div>
    </div>
  );
}

import { Film, Zap, Users, SlidersHorizontal, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useIsMobile } from '../hooks/useIsMobile';

export type ContentFilter = 'all' | 'long' | 'short';
export type AssigneeFilter = 'all' | 'Creador' | 'Editor' | 'Asistente';

function getAssigneeLabel(value: AssigneeFilter) {
  if (value === 'Creador') return 'Creador';
  if (value === 'Editor') return 'Editor';
  if (value === 'Asistente') return 'Asistente';
  return 'Todos';
}

interface FilterBarProps {
  contentFilter: ContentFilter;
  assigneeFilter: AssigneeFilter;
  onContentFilterChange: (f: ContentFilter) => void;
  onAssigneeFilterChange: (f: AssigneeFilter) => void;
}

export function FilterBar({ contentFilter, assigneeFilter, onContentFilterChange, onAssigneeFilterChange }: FilterBarProps) {
  const isMobile = useIsMobile();
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);

  const activeChips = useMemo(() => {
    const chips: string[] = [];
    if (contentFilter !== 'all') chips.push(contentFilter === 'long' ? 'Largos' : 'Shorts');
    if (assigneeFilter !== 'all') chips.push(getAssigneeLabel(assigneeFilter));
    return chips;
  }, [assigneeFilter, contentFilter]);

  const contentOptions = [
    { value: 'all' as const, label: 'Todos', icon: null },
    { value: 'long' as const, label: 'Largos', icon: <Film size={12} /> },
    { value: 'short' as const, label: 'Shorts', icon: <Zap size={12} /> },
  ];

  const assigneeOptions = [
    { value: 'all' as const, label: 'Todos' },
    { value: 'Creador' as const, label: 'Creador' },
    { value: 'Editor' as const, label: 'Editor' },
    { value: 'Asistente' as const, label: 'Asistente' },
  ];

  if (!isMobile) {
    return (
      <div
        className="flex items-center gap-4 sm:gap-8 px-4 sm:px-6 py-2 backdrop-blur-sm shrink-0 overflow-x-auto no-scrollbar scroll-smooth"
        style={{ background: `var(--ff-filter-bg)`, borderBottom: `1px solid var(--ff-border)` }}
      >
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-wider hidden sm:inline" style={{ color: `var(--ff-text-tertiary)` }}>Tipo:</span>
          <div className="flex rounded-full overflow-hidden p-0.5 shadow-inner" style={{ border: `1px solid var(--ff-border-medium)`, background: `var(--ff-input-bg)` }}>
            {contentOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => onContentFilterChange(opt.value)}
                className="px-3 py-1 text-xs font-semibold transition-all duration-200 flex items-center gap-1 rounded-full whitespace-nowrap"
                style={
                  contentFilter === opt.value
                    ? { background: `var(--ff-filter-active)`, color: `var(--ff-filter-text-active)`, boxShadow: `var(--ff-shadow-sm)` }
                    : { color: `var(--ff-filter-text)` }
                }
              >
                {opt.icon}
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-wider hidden sm:flex items-center gap-1" style={{ color: `var(--ff-text-tertiary)` }}>
            <Users size={11} />
            Responsable:
          </span>
          <div className="flex rounded-full overflow-hidden p-0.5 shadow-inner" style={{ border: `1px solid var(--ff-border-medium)`, background: `var(--ff-input-bg)` }}>
            {assigneeOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => onAssigneeFilterChange(opt.value)}
                className="px-3 py-1 text-xs font-semibold transition-all duration-200 rounded-full whitespace-nowrap"
                style={
                  assigneeFilter === opt.value
                    ? { background: `var(--ff-filter-active)`, color: `var(--ff-filter-text-active)`, boxShadow: `var(--ff-shadow-sm)` }
                    : { color: `var(--ff-filter-text)` }
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className="flex items-center justify-between gap-3 px-4 py-3 shrink-0"
        style={{ background: `var(--ff-filter-bg)`, borderBottom: `1px solid var(--ff-border)` }}
      >
        <div className="flex-1 min-w-0 overflow-x-auto no-scrollbar">
          <div className="flex gap-2 min-w-max">
            {activeChips.length > 0 ? activeChips.map((chip) => (
              <span key={chip} className="text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ background: `var(--ff-filter-active)`, color: `var(--ff-filter-text-active)` }}>
                {chip}
              </span>
            )) : (
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ background: `var(--ff-bg-subtle)`, color: `var(--ff-text-tertiary)` }}>
                Sin filtros
              </span>
            )}
          </div>
        </div>

        <button
          onClick={() => setIsMobileSheetOpen(true)}
          className="min-h-11 px-3 py-2 rounded-2xl text-sm font-semibold flex items-center gap-2 shrink-0"
          style={{ background: `var(--ff-filter-active)`, color: `var(--ff-filter-text-active)`, border: `1px solid var(--ff-border)` }}
        >
          <SlidersHorizontal size={15} />
          Filtrar
        </button>
      </div>

      {isMobileSheetOpen && (
        <div className="fixed inset-0 z-40 flex items-end" onClick={() => setIsMobileSheetOpen(false)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div className="relative w-full rounded-t-[1.75rem] p-4 ff-slide-up" style={{ background: `var(--ff-surface-solid)`, borderTop: `1px solid var(--ff-border)` }} onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: `var(--ff-text-tertiary)` }}>Filtros</p>
                <h3 className="text-base font-bold mt-1" style={{ color: `var(--ff-text-primary)` }}>Ajusta tu vista</h3>
              </div>
              <button onClick={() => setIsMobileSheetOpen(false)} className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: `var(--ff-bg-subtle)` }}>
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-2" style={{ color: `var(--ff-text-tertiary)` }}>Tipo</p>
                <div className="grid grid-cols-3 gap-2">
                  {contentOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => onContentFilterChange(opt.value)}
                      className="min-h-11 rounded-2xl px-3 py-2 text-xs font-semibold flex items-center justify-center gap-1.5"
                      style={contentFilter === opt.value ? { background: `var(--ff-filter-active)`, color: `var(--ff-filter-text-active)`, border: `1px solid var(--ff-primary)` } : { background: `var(--ff-bg-subtle)`, color: `var(--ff-text-secondary)` }}
                    >
                      {opt.icon}
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-2" style={{ color: `var(--ff-text-tertiary)` }}>Responsable</p>
                <div className="grid grid-cols-2 gap-2">
                  {assigneeOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => onAssigneeFilterChange(opt.value)}
                      className="min-h-11 rounded-2xl px-3 py-2 text-xs font-semibold"
                      style={assigneeFilter === opt.value ? { background: `var(--ff-filter-active)`, color: `var(--ff-filter-text-active)`, border: `1px solid var(--ff-primary)` } : { background: `var(--ff-bg-subtle)`, color: `var(--ff-text-secondary)` }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

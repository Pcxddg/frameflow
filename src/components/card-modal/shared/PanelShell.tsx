import { type ReactNode, type RefObject } from 'react';
import { ChevronDown } from 'lucide-react';
import { panelStyle, subtleButtonStyle } from '../hooks/useFlowStyles';

interface PanelShellProps {
  panelRef: RefObject<HTMLDivElement | null>;
  kicker: string;
  title: string;
  description: string;
  preview: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  action?: ReactNode;
  children: ReactNode;
}

export function PanelShell({ panelRef, kicker, title, description, preview, expanded, onToggle, action, children }: PanelShellProps) {
  return (
    <section
      ref={panelRef}
      className="rounded-[1.7rem] border p-4 md:p-5"
      style={{ ...panelStyle, scrollMarginTop: '7rem' }}
    >
      <div className={`flex flex-wrap items-start justify-between gap-3 ${expanded ? 'mb-4' : ''}`}>
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--ff-text-tertiary)' }}>{kicker}</p>
          <div className="mt-2 flex items-center gap-3">
            <h2 className="min-w-0 text-lg font-bold md:text-xl" style={{ color: 'var(--ff-text-primary)' }}>{title}</h2>
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border" style={subtleButtonStyle}>
              <ChevronDown size={16} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </span>
          </div>
          <p className="mt-2 text-sm leading-6" style={{ color: 'var(--ff-text-secondary)' }}>{description}</p>
        </button>
        {expanded ? action : null}
      </div>
      {expanded ? children : <div onClick={onToggle} className="cursor-pointer">{preview}</div>}
    </section>
  );
}

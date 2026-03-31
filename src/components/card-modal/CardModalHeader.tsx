import { X, Film, Zap } from 'lucide-react';
import type { Card as CardType } from '../../types';
import type { CardActions, CardAiState, PhaseConfig } from './types';

interface CardModalHeaderProps {
  card: CardType;
  phase: PhaseConfig;
  actions: CardActions;
  ai: CardAiState;
  readOnly: boolean;
  onClose: () => void;
}

export function CardModalHeader({ card, phase, actions, ai, readOnly, onClose }: CardModalHeaderProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 shrink-0 sm:px-5" style={{ borderBottom: '1px solid var(--ff-border-medium)', background: 'var(--ff-surface-solid)' }}>
      {/* Phase badge */}
      <span className={`text-[11px] font-bold text-white px-2.5 py-1 rounded-full shrink-0 ${phase.color}`}>
        {phase.name}
      </span>

      {/* Content type toggle */}
      <div className="flex rounded-lg overflow-hidden shrink-0" style={{ border: '1px solid var(--ff-border-medium)' }}>
        <button
          onClick={() => actions.updateCard({ contentType: 'long' })}
          disabled={readOnly}
          className="px-2.5 py-1 text-xs font-semibold transition-colors flex items-center gap-1"
          style={card.contentType !== 'short'
            ? { background: 'var(--ff-primary)', color: 'var(--ff-text-inverse)' }
            : { background: 'var(--ff-surface-solid)', color: 'var(--ff-text-secondary)' }}
        >
          <Film size={12} /> Largo
        </button>
        <button
          onClick={() => actions.updateCard({ contentType: 'short' })}
          disabled={readOnly}
          className="px-2.5 py-1 text-xs font-semibold transition-colors flex items-center gap-1"
          style={card.contentType === 'short'
            ? { background: 'var(--ff-accent)', color: '#fff' }
            : { background: 'var(--ff-surface-solid)', color: 'var(--ff-text-secondary)' }}
        >
          <Zap size={12} /> Short
        </button>
      </div>

      {/* Title input */}
      <input
        type="text"
        value={card.title}
        onChange={e => actions.updateCard({ title: e.target.value })}
        readOnly={readOnly}
        className="order-3 basis-full text-lg font-bold bg-transparent border-none outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1 min-w-0 sm:order-none sm:basis-auto sm:flex-1"
        style={{ color: 'var(--ff-text-primary)' }}
        placeholder="Titulo del video..."
      />

      {/* Close button */}
      <button onClick={onClose} className="p-2 rounded-full transition-colors shrink-0" style={{ color: 'var(--ff-text-tertiary)' }} title="Cerrar (Esc)">
        <X size={20} />
      </button>
    </div>
  );
}

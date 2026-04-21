import { ArrowRight, Film, Zap, Link2 } from 'lucide-react';
import { useBoard } from '../store';
import { CardData } from '../types';

interface LinkGroup {
  type: string;
  color: string;
  links: { source: CardData; target: CardData }[];
}

export function InterlinkingGraph() {
  const { board } = useBoard();

  if (!board) return null;

  const cards = Object.values(board.cards);

  // Build link groups
  const rawLinks: { source: CardData; target: CardData }[] = [];
  cards.forEach(card => {
    // interlinkingTargets
    card.interlinkingTargets?.forEach(targetId => {
      const target = board.cards[targetId];
      if (target) rawLinks.push({ source: card, target });
    });
    // shortsFunnel
    if (card.shortsFunnel) {
      const target = board.cards[card.shortsFunnel];
      if (target) rawLinks.push({ source: card, target });
    }
  });

  if (rawLinks.length === 0) {
    return (
      <div className="ff-interlinking-graph rounded-xl p-6 text-center ff-panel">
        <Link2 size={32} className="mx-auto mb-3" style={{ color: `var(--ff-text-tertiary)` }} />
        <p className="text-sm" style={{ color: `var(--ff-text-secondary)` }}>No hay enlaces entre videos todavia.</p>
        <p className="text-xs mt-1" style={{ color: `var(--ff-text-tertiary)` }}>Usa el campo "Interlinking" en las tarjetas para conectar videos entre si.</p>
      </div>
    );
  }

  // Classify links
  const classify = (source: CardData, target: CardData): string => {
    if (source.contentType === 'short' && target.contentType === 'long') return 'Short → Largo';
    if (source.contentType === 'long' && target.contentType === 'long') {
      if (target.monetization?.sellsProduct || target.monetization?.hasAffiliate) return 'Viral → Ventas';
      return 'Viral → Evergreen';
    }
    if (source.contentType === 'short' && target.contentType === 'short') return 'Short → Short';
    return 'Otro';
  };

  const groupMap = new Map<string, { source: CardData; target: CardData }[]>();
  rawLinks.forEach(link => {
    const type = classify(link.source, link.target);
    if (!groupMap.has(type)) groupMap.set(type, []);
    groupMap.get(type)!.push(link);
  });

  const colorMap: Record<string, string> = {
    'Short → Largo': 'border-purple-400 bg-purple-50',
    'Viral → Ventas': 'border-green-400 bg-green-50',
    'Viral → Evergreen': 'border-blue-400 bg-blue-50',
    'Short → Short': 'border-orange-400 bg-orange-50',
    'Otro': 'border-gray-300 bg-gray-50',
  };

  const dotColorMap: Record<string, string> = {
    'Short → Largo': 'bg-purple-500',
    'Viral → Ventas': 'bg-green-500',
    'Viral → Evergreen': 'bg-blue-500',
    'Short → Short': 'bg-orange-500',
    'Otro': 'bg-gray-400',
  };

  const groups: LinkGroup[] = Array.from(groupMap.entries()).map(([type, links]) => ({
    type,
    color: colorMap[type] || colorMap['Otro'],
    links,
  }));

  return (
    <div className="ff-interlinking-graph space-y-4">
      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {groups.map(g => (
          <div key={g.type} className="flex items-center gap-1.5 text-xs" style={{ color: `var(--ff-text-secondary)` }}>
            <span className={`w-2.5 h-2.5 rounded-full ${dotColorMap[g.type] || dotColorMap['Otro']}`} />
            <span className="font-medium">{g.type}</span>
            <span style={{ color: `var(--ff-text-tertiary)` }}>({g.links.length})</span>
          </div>
        ))}
      </div>

      {/* Link groups */}
      {groups.map(group => (
        <div key={group.type} className={`rounded-xl border-l-4 p-4 ${group.color}`} style={{ boxShadow: `var(--ff-shadow-sm)` }}>
          <h4 className="text-xs font-bold uppercase mb-3" style={{ color: `var(--ff-text-primary)` }}>{group.type}</h4>
          <div className="space-y-2">
            {group.links.map((link, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: `color-mix(in srgb, var(--ff-surface-solid) 88%, transparent)`, border: `1px solid var(--ff-border)` }}>
                <CardChip card={link.source} />
                <ArrowRight size={14} className="shrink-0" style={{ color: `var(--ff-text-tertiary)` }} />
                <CardChip card={link.target} />
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Stats */}
      <div className="flex items-center gap-6 text-xs pt-2" style={{ color: `var(--ff-text-secondary)` }}>
        <span>Total de enlaces: <strong style={{ color: `var(--ff-text-primary)` }}>{rawLinks.length}</strong></span>
        <span>Videos enlazados: <strong style={{ color: `var(--ff-text-primary)` }}>{new Set([...rawLinks.map(l => l.source.id), ...rawLinks.map(l => l.target.id)]).size}</strong></span>
        <span>Videos sin enlaces: <strong style={{ color: `var(--ff-text-primary)` }}>{cards.filter(c => !c.interlinkingTargets?.length && !c.shortsFunnel && !rawLinks.some(l => l.target.id === c.id)).length}</strong></span>
      </div>
    </div>
  );
}

function CardChip({ card }: { card: CardData }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      {card.contentType === 'short' ? (
        <Zap size={12} className="text-purple-500 shrink-0" />
      ) : (
        <Film size={12} className="text-blue-500 shrink-0" />
      )}
      <span className="text-xs truncate max-w-[180px] font-medium" style={{ color: `var(--ff-text-primary)` }}>{card.title}</span>
    </div>
  );
}
